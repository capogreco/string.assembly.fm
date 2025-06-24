/**
 * ChordManager Module for String Assembly FM
 * Handles chord distribution, note allocation, and chord state management
 */

import { eventBus } from "../core/EventBus.js";
import { appState } from "../state/AppState.js";
import { Config } from "../core/Config.js";

export class ChordManager {
  constructor() {
    this.eventBus = eventBus;
    this.appState = appState;
    this.currentChord = [];
    this.chordDistribution = new Map();
    this.distributionAlgorithm = "stochastic"; // 'stochastic', 'round-robin', 'random'
    this.isInitialized = false;
  }

  /**
   * Initialize the chord manager
   */
  initialize() {
    if (this.isInitialized) {
      if (window.Logger) {
        window.Logger.log("ChordManager already initialized", "lifecycle");
      }
      return;
    }

    if (window.Logger) {
      window.Logger.log("Initializing ChordManager...", "lifecycle");
    }

    // Set up event listeners
    this.setupEventListeners();

    // Set up state subscriptions
    this.setupStateSubscriptions();

    this.isInitialized = true;

    if (window.Logger) {
      window.Logger.log("ChordManager initialized", "lifecycle");
    }
  }

  /**
   * Set up event listeners
   * @private
   */
  setupEventListeners() {
    // Listen for piano chord changes
    this.eventBus.on("piano:chordChanged", (data) => {
      this.handleChordChange(data.chord, data.noteNames);
    });

    // Listen for synth connections/disconnections
    this.eventBus.on("network:synthConnected", (data) => {
      this.redistributeChord();
    });

    this.eventBus.on("webrtc:peerDisconnected", (data) => {
      this.handleSynthDisconnected(data.peerId);
    });

    // Listen for distribution algorithm changes
    this.eventBus.on("chord:algorithmChanged", (data) => {
      this.setDistributionAlgorithm(data.algorithm);
    });
  }

  /**
   * Set up state subscriptions
   * @private
   */
  setupStateSubscriptions() {
    // Subscribe to chord changes
    this.appState.subscribe("currentChord", (newChord) => {
      this.updateChord(newChord);
    });

    // Subscribe to connected synths changes
    this.appState.subscribe("connectedSynths", () => {
      this.redistributeChord();
    });
  }

  /**
   * Handle chord changes from external sources
   * @param {Array} chord - Array of frequencies
   * @param {Array} noteNames - Array of note names
   * @private
   */
  handleChordChange(chord, noteNames) {
    this.currentChord = [...chord];

    if (window.Logger) {
      window.Logger.log(
        `Chord changed: [${noteNames.join(", ")}]`,
        "expressions",
      );
    }

    // Distribute chord to connected synths
    this.distributeChord(chord, noteNames);

    // Emit chord distribution event
    this.eventBus.emit("chord:distributed", {
      chord,
      noteNames,
      distribution: this.getDistributionSummary(),
      timestamp: Date.now(),
    });
  }

  /**
   * Update current chord
   * @param {Array} newChord - New chord frequencies
   * @private
   */
  updateChord(newChord) {
    if (!newChord || !Array.isArray(newChord)) {
      this.currentChord = [];
      this.chordDistribution.clear();
      return;
    }

    this.currentChord = [...newChord];

    // Convert frequencies to note names
    const noteNames = newChord.map((freq) => this.frequencyToNoteName(freq));

    // Redistribute with new chord
    this.distributeChord(newChord, noteNames);
  }

  /**
   * Distribute chord to connected synths
   * @param {Array} chord - Array of frequencies
   * @param {Array} noteNames - Array of note names
   */
  distributeChord(chord, noteNames) {
    if (!chord || chord.length === 0) {
      this.clearDistribution();
      return;
    }

    const connectedSynths = this.appState.get("connectedSynths");
    if (connectedSynths.size === 0) {
      if (window.Logger) {
        window.Logger.log(
          "No synths connected for chord distribution",
          "expressions",
        );
      }
      return;
    }

    // Clear existing distribution
    this.chordDistribution.clear();

    // Distribute notes based on selected algorithm
    switch (this.distributionAlgorithm) {
      case "stochastic":
        this.distributeStochastic(
          chord,
          noteNames,
          Array.from(connectedSynths.keys()),
        );
        break;
      case "round-robin":
        this.distributeRoundRobin(
          chord,
          noteNames,
          Array.from(connectedSynths.keys()),
        );
        break;
      case "random":
        this.distributeRandom(
          chord,
          noteNames,
          Array.from(connectedSynths.keys()),
        );
        break;
      default:
        this.distributeRoundRobin(
          chord,
          noteNames,
          Array.from(connectedSynths.keys()),
        );
    }

    if (window.Logger) {
      window.Logger.log(
        `Distributed ${chord.length} notes to ${connectedSynths.size} synths using ${this.distributionAlgorithm}`,
        "expressions",
      );
    }
  }

  /**
   * Stochastic distribution using external chord distributor
   * @param {Array} chord - Chord frequencies
   * @param {Array} noteNames - Note names
   * @param {Array} synthIds - Connected synth IDs
   * @private
   */
  distributeStochastic(chord, noteNames, synthIds) {
    if (
      window.chordDistributor &&
      typeof window.chordDistributor.distributeChord === "function"
    ) {
      try {
        // Format chord data for stochastic distributor
        const chordData = { notes: noteNames };

        // Get per-note expressions from AppState
        const perNoteExpressions =
          this.appState.get("perNoteExpressions") || {};

        const distribution = window.chordDistributor.distributeChord(
          chordData,
          synthIds,
          { expressions: perNoteExpressions }, // Pass expressions here
        );

        // Convert to our internal format
        Object.entries(distribution).forEach(([synthId, assignment]) => {
          this.chordDistribution.set(synthId, {
            frequency: assignment.frequency,
            noteName: assignment.note,
            index: assignment.index,
            algorithm: "stochastic",
            timestamp: Date.now(),
          });
        });
      } catch (error) {
        if (window.Logger) {
          window.Logger.log(
            `Stochastic distribution failed: ${error}, falling back to round-robin`,
            "error",
          );
        }
        this.distributeRoundRobin(chord, noteNames, synthIds);
      }
    } else {
      // Fallback to round-robin if stochastic distributor not available
      this.distributeRoundRobin(chord, noteNames, synthIds);
    }
  }

  /**
   * Round-robin distribution
   * @param {Array} chord - Chord frequencies
   * @param {Array} noteNames - Note names
   * @param {Array} synthIds - Connected synth IDs
   * @private
   */
  distributeRoundRobin(chord, noteNames, synthIds) {
    synthIds.forEach((synthId, synthIndex) => {
      const noteIndex = synthIndex % chord.length;

      this.chordDistribution.set(synthId, {
        frequency: chord[noteIndex],
        noteName: noteNames[noteIndex],
        index: noteIndex,
        algorithm: "round-robin",
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Random distribution
   * @param {Array} chord - Chord frequencies
   * @param {Array} noteNames - Note names
   * @param {Array} synthIds - Connected synth IDs
   * @private
   */
  distributeRandom(chord, noteNames, synthIds) {
    synthIds.forEach((synthId) => {
      const randomIndex = Math.floor(Math.random() * chord.length);

      this.chordDistribution.set(synthId, {
        frequency: chord[randomIndex],
        noteName: noteNames[randomIndex],
        index: randomIndex,
        algorithm: "random",
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Redistribute chord to all connected synths
   */
  redistributeChord() {
    if (this.currentChord.length > 0) {
      const noteNames = this.currentChord.map((freq) =>
        this.frequencyToNoteName(freq),
      );
      this.distributeChord(this.currentChord, noteNames);
    }
  }

  /**
   * Handle synth disconnection
   * @param {string} synthId - Disconnected synth ID
   * @private
   */
  handleSynthDisconnected(synthId) {
    this.chordDistribution.delete(synthId);

    if (window.Logger) {
      window.Logger.log(
        `Removed chord assignment for disconnected synth: ${synthId}`,
        "expressions",
      );
    }

    // Redistribute remaining chord if needed
    this.redistributeChord();
  }

  /**
   * Clear chord distribution
   */
  clearDistribution() {
    this.chordDistribution.clear();
    this.currentChord = [];

    this.eventBus.emit("chord:cleared", {
      timestamp: Date.now(),
    });

    if (window.Logger) {
      window.Logger.log("Cleared chord distribution", "expressions");
    }
  }

  /**
   * Get note assignment for specific synth
   * @param {string} synthId - Synth ID
   * @returns {Object|null} Note assignment
   */
  getNoteAssignment(synthId) {
    return this.chordDistribution.get(synthId) || null;
  }

  /**
   * Get all note assignments
   * @returns {Map} All current assignments
   */
  getAllAssignments() {
    return new Map(this.chordDistribution);
  }

  /**
   * Get current chord
   * @returns {Array} Current chord frequencies
   */
  getCurrentChord() {
    return [...this.currentChord];
  }

  /**
   * Get chord information
   * @returns {Object} Chord information
   */
  getChordInfo() {
    const noteNames = this.currentChord.map((freq) =>
      this.frequencyToNoteName(freq),
    );

    return {
      frequencies: [...this.currentChord],
      noteNames,
      count: this.currentChord.length,
      distribution: this.getDistributionSummary(),
      algorithm: this.distributionAlgorithm,
    };
  }

  /**
   * Get distribution summary
   * @returns {Object} Distribution summary
   * @private
   */
  getDistributionSummary() {
    const summary = {
      totalSynths: this.chordDistribution.size,
      totalNotes: this.currentChord.length,
      assignments: {},
      algorithm: this.distributionAlgorithm,
    };

    this.chordDistribution.forEach((assignment, synthId) => {
      summary.assignments[synthId] = {
        noteName: assignment.noteName,
        frequency: assignment.frequency,
        index: assignment.index,
      };
    });

    return summary;
  }

  /**
   * Set distribution algorithm
   * @param {string} algorithm - Algorithm name ('stochastic', 'round-robin', 'random')
   */
  setDistributionAlgorithm(algorithm) {
    const validAlgorithms = ["stochastic", "round-robin", "random"];

    if (!validAlgorithms.includes(algorithm)) {
      if (window.Logger) {
        window.Logger.log(
          `Invalid distribution algorithm: ${algorithm}`,
          "error",
        );
      }
      return;
    }

    this.distributionAlgorithm = algorithm;

    if (window.Logger) {
      window.Logger.log(
        `Distribution algorithm set to: ${algorithm}`,
        "expressions",
      );
    }

    // Redistribute current chord with new algorithm
    this.redistributeChord();

    this.eventBus.emit("chord:algorithmChanged", {
      algorithm,
      timestamp: Date.now(),
    });
  }

  /**
   * Get available distribution algorithms
   * @returns {Array} Available algorithms
   */
  getAvailableAlgorithms() {
    return ["stochastic", "round-robin", "random"];
  }

  /**
   * Add note to current chord
   * @param {number} frequency - Frequency to add
   */
  addNote(frequency) {
    if (!this.currentChord.includes(frequency)) {
      this.currentChord.push(frequency);
      this.currentChord.sort((a, b) => a - b);

      // Update app state
      this.appState.set("currentChord", this.currentChord);

      if (window.Logger) {
        const noteName = this.frequencyToNoteName(frequency);
        window.Logger.log(`Added note to chord: ${noteName}`, "expressions");
      }
    }
  }

  /**
   * Remove note from current chord
   * @param {number} frequency - Frequency to remove
   */
  removeNote(frequency) {
    const index = this.currentChord.indexOf(frequency);
    if (index !== -1) {
      this.currentChord.splice(index, 1);

      // Update app state
      this.appState.set("currentChord", this.currentChord);

      if (window.Logger) {
        const noteName = this.frequencyToNoteName(frequency);
        window.Logger.log(
          `Removed note from chord: ${noteName}`,
          "expressions",
        );
      }
    }
  }

  /**
   * Set chord directly
   * @param {Array} frequencies - Array of frequencies
   */
  setChord(frequencies) {
    this.currentChord = [...frequencies];
    this.currentChord.sort((a, b) => a - b);

    // Update app state
    this.appState.set("currentChord", this.currentChord);

    const noteNames = frequencies.map((freq) => this.frequencyToNoteName(freq));

    if (window.Logger) {
      window.Logger.log(`Chord set: [${noteNames.join(", ")}]`, "expressions");
    }
  }

  /**
   * Clear current chord
   */
  clearChord() {
    this.currentChord = [];
    this.clearDistribution();

    // Update app state
    this.appState.set("currentChord", []);

    if (window.Logger) {
      window.Logger.log("Chord cleared", "expressions");
    }
  }

  /**
   * Convert frequency to note name
   * @param {number} frequency - Frequency in Hz
   * @returns {string} Note name with octave
   * @private
   */
  frequencyToNoteName(frequency) {
    const A4 = 440;
    const C0 = A4 * Math.pow(2, -4.75);

    if (frequency <= 0) return "N/A";

    const h = Math.round(12 * Math.log2(frequency / C0));
    const octave = Math.floor(h / 12);
    const noteIndex = h % 12;

    const noteNames = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ];
    return `${noteNames[noteIndex]}${octave}`;
  }

  /**
   * Get chord statistics
   * @returns {Object} Chord statistics
   */
  getStatistics() {
    const noteDistribution = {};
    this.chordDistribution.forEach((assignment) => {
      const note = assignment.noteName;
      noteDistribution[note] = (noteDistribution[note] || 0) + 1;
    });

    return {
      chordSize: this.currentChord.length,
      connectedSynths: this.chordDistribution.size,
      algorithm: this.distributionAlgorithm,
      noteDistribution,
      averageFrequency:
        this.currentChord.length > 0
          ? this.currentChord.reduce((sum, freq) => sum + freq, 0) /
            this.currentChord.length
          : 0,
      frequencyRange:
        this.currentChord.length > 0
          ? {
              min: Math.min(...this.currentChord),
              max: Math.max(...this.currentChord),
            }
          : { min: 0, max: 0 },
    };
  }

  /**
   * Add event listener for chord events
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    return this.eventBus.on(`chord:${event}`, handler);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  off(event, handler) {
    this.eventBus.off(`chord:${event}`, handler);
  }

  /**
   * Cleanup and destroy
   */
  destroy() {
    this.clearDistribution();
    this.isInitialized = false;

    if (window.Logger) {
      window.Logger.log("ChordManager destroyed", "lifecycle");
    }
  }
}

// Create global instance
export const chordManager = new ChordManager();

// Make available globally for backward compatibility
if (typeof window !== "undefined") {
  window.ChordManager = ChordManager;
  window.chordManager = chordManager;
}
