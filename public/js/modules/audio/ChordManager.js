/**
 * ChordManager Module for String Assembly FM
 * Handles chord distribution, note allocation, and chord state management
 */

import { eventBus } from "../core/EventBus.js";
import { appState } from "../state/AppState.js";
import { SystemConfig, ConfigUtils } from "../../config/system.config.js";

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
    // Listen for piano chord changes (but don't auto-distribute)
    this.eventBus.on("piano:chordChanged", (data) => {
      this.currentChord = [...data.chord];
      if (window.Logger) {
        window.Logger.log(
          `DEBUG ChordManager: Piano chord updated: [${data.noteNames.join(", ")}] (not distributed)`,
          "expressions",
        );
        window.Logger.log(
          `DEBUG ChordManager: currentChord is now: ${JSON.stringify(this.currentChord)}`,
          "expressions",
        );
      }
    });

    // Listen for synth connections (but don't auto-redistribute)
    this.eventBus.on("network:synthConnected", (data) => {
      if (window.Logger) {
        window.Logger.log(`Synth connected: ${data.synthId}`, "expressions");
      }
    });

    this.eventBus.on("webrtc:peerDisconnected", (data) => {
      this.handleSynthDisconnected(data.peerId);
    });

    // Listen for distribution algorithm changes
    this.eventBus.on("chord:algorithmChanged", (data) => {
      this.distributionAlgorithm = data.algorithm;
    });

    // Listen for explicit program send requests
    this.eventBus.on("program:sendRequested", (data) => {
      return this.distributeForProgramSend(data.program);
    });
  }

  /**
   * Set up state subscriptions
   * @private
   */
  setupStateSubscriptions() {
    // Subscribe to chord changes (but don't auto-distribute)
    this.appState.subscribe("currentChord", (newChord) => {
      this.currentChord = [...(newChord || [])];
    });

    // REMOVED connectedSynths subscription - was causing auto-redistribution on ping/pong
  }

  /**
   * Handle chord changes from external sources
   * @param {Array} chord - Array of frequencies
   * @param {Array} noteNames - Array of note names
   * @private
   */
  handleChordChange(chord, noteNames) {
    // DO NOTHING - no auto-distribution
  }

  /**
   * Update current chord
   * @param {Array} newChord - New chord frequencies
   * @private
   */
  updateChord(newChord) {
    // DO NOTHING - no auto-distribution
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

        if (window.Logger) {
          window.Logger.log(
            `DEBUG distributeStochastic: synthIds passed to chordDistributor: ${JSON.stringify(synthIds)}`,
            "expressions",
          );
        }

        const distribution = window.chordDistributor.distributeChord(
          chordData,
          synthIds,
          { expressions: perNoteExpressions }, // Pass expressions here
        );

        // Convert to our internal format
        if (window.Logger) {
          window.Logger.log(
            `DEBUG distributeStochastic: Raw distribution from chordDistributor: ${JSON.stringify(distribution)}`,
            "expressions",
          );
          window.Logger.log(
            `DEBUG distributeStochastic: distribution keys: ${JSON.stringify(Object.keys(distribution))}`,
            "expressions",
          );
        }

        Object.entries(distribution).forEach(
          ([distributionKey, assignment]) => {
            // The stochastic distributor returns indices as keys, not synth IDs
            // Map the index back to the actual synth ID
            const synthIndex = parseInt(distributionKey);
            const actualSynthId = synthIds[synthIndex];

            const internalAssignment = {
              frequency: assignment.frequency,
              noteName: assignment.note,
              index: assignment.index,
              algorithm: "stochastic",
              timestamp: Date.now(),
            };

            if (window.Logger) {
              window.Logger.log(
                `DEBUG distributeStochastic: Creating assignment for ${actualSynthId} (index ${distributionKey}): ${JSON.stringify(internalAssignment)}`,
                "expressions",
              );
            }

            this.chordDistribution.set(actualSynthId, internalAssignment);
          },
        );
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
    if (window.Logger) {
      window.Logger.log(
        `DEBUG distributeRoundRobin: chord=${JSON.stringify(chord)}, noteNames=${JSON.stringify(noteNames)}, synthIds=${JSON.stringify(synthIds)}`,
        "expressions",
      );
    }

    synthIds.forEach((synthId, synthIndex) => {
      const noteIndex = synthIndex % chord.length;
      const assignment = {
        frequency: chord[noteIndex],
        noteName: noteNames[noteIndex],
        index: noteIndex,
        algorithm: "round-robin",
        timestamp: Date.now(),
      };

      if (window.Logger) {
        window.Logger.log(
          `DEBUG distributeRoundRobin: Creating assignment for ${synthId}: ${JSON.stringify(assignment)}`,
          "expressions",
        );
      }

      this.chordDistribution.set(synthId, assignment);
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
    // DO NOTHING - no auto-redistribution
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

    // Don't auto-redistribute on disconnect
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

    // Don't auto-redistribute - wait for explicit program send
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
   * Assign note to newly connected synth without redistributing existing assignments
   * @param {string} synthId - New synth ID
   * @returns {Object|null} Assignment object
   */
  assignNoteToNewSynth(synthId) {
    if (!this.currentChord || this.currentChord.length === 0) {
      return null;
    }

    if (this.chordDistribution.has(synthId)) {
      return this.chordDistribution.get(synthId);
    }

    const existingAssignments = this.chordDistribution.size;
    const noteIndex = existingAssignments % this.currentChord.length;

    const frequency = this.currentChord[noteIndex];
    const noteName = this.frequencyToNoteName(frequency);

    const assignment = {
      frequency,
      noteName,
      index: noteIndex,
      algorithm: this.distributionAlgorithm,
      timestamp: Date.now(),
    };

    this.chordDistribution.set(synthId, assignment);

    if (window.Logger) {
      window.Logger.log(
        `Assigned ${noteName} to newly connected synth ${synthId}`,
        "expressions",
      );
    }

    return assignment;
  }

  /**
   * Distribute chord for explicit program send
   * @param {Object} program - Complete program object
   * @returns {Array} Distribution assignments
   */
  distributeForProgramSend(program) {
    if (window.Logger) {
      window.Logger.log(
        `DEBUG ChordManager: distributeForProgramSend called with currentChord: ${JSON.stringify(this.currentChord)}`,
        "expressions",
      );
    }

    if (!this.currentChord || this.currentChord.length === 0) {
      if (window.Logger) {
        window.Logger.log(
          "DEBUG ChordManager: No chord selected - sending base program only",
          "expressions",
        );
      }
      const connectedSynths = this.appState.get("connectedSynths");
      const assignments = [];

      connectedSynths.forEach((synthData, synthId) => {
        const baseProgram = { ...program, powerOn: program.powerOn !== false };
        // Set default expression to none when no chord
        baseProgram.expression = "none";
        baseProgram.vibratoEnabled = false;
        baseProgram.tremoloEnabled = false;
        baseProgram.trillEnabled = false;

        assignments.push({
          synthId,
          program: baseProgram,
          assignment: null,
        });
      });

      return assignments;
    }

    const connectedSynths = this.appState.get("connectedSynths");
    if (connectedSynths.size === 0) {
      return [];
    }

    const noteNames = this.currentChord.map((freq) =>
      this.frequencyToNoteName(freq),
    );

    if (window.Logger) {
      window.Logger.log(
        `DEBUG ChordManager: About to call distributeChord with chord=${JSON.stringify(this.currentChord)}, noteNames=${JSON.stringify(noteNames)}`,
        "expressions",
      );
    }

    this.distributeChord(this.currentChord, noteNames);

    if (window.Logger) {
      window.Logger.log(
        `DEBUG ChordManager: After distributeChord, chordDistribution has ${this.chordDistribution.size} entries`,
        "expressions",
      );
    }

    const assignments = [];
    connectedSynths.forEach((synthData, synthId) => {
      const assignment = this.chordDistribution.get(synthId);
      const synthProgram = { ...program };

      if (window.Logger) {
        window.Logger.log(
          `DEBUG ChordManager: Processing synth ${synthId}, assignment: ${JSON.stringify(assignment)}`,
          "expressions",
        );
      }

      if (assignment) {
        synthProgram.fundamentalFrequency = assignment.frequency;
        synthProgram.assignedNote = assignment.noteName;

        const expressions = this.appState.get("perNoteExpressions") || {};
        const noteExpression = expressions[assignment.noteName];

        if (window.Logger) {
          window.Logger.log(
            `DEBUG ChordManager: expressions from appState: ${JSON.stringify(expressions)}`,
            "expressions",
          );
          window.Logger.log(
            `DEBUG ChordManager: noteExpression for ${assignment.noteName}: ${JSON.stringify(noteExpression)}`,
            "expressions",
          );
        }

        if (noteExpression) {
          // Set the expression type field for synth compatibility
          synthProgram.expression = noteExpression.type;

          switch (noteExpression.type) {
            case "vibrato":
              synthProgram.vibratoEnabled = true;
              synthProgram.vibratoDepth = noteExpression.depth || 0.01;
              synthProgram.vibratoRate = noteExpression.rate || 4;
              break;
            case "tremolo":
              synthProgram.tremoloEnabled = true;
              synthProgram.tremoloDepth = noteExpression.depth || 0.3;
              synthProgram.tremoloSpeed = noteExpression.speed || 10;
              break;
            case "trill":
              synthProgram.trillEnabled = true;
              synthProgram.trillInterval = noteExpression.interval || 2;
              synthProgram.trillSpeed = noteExpression.speed || 8;
              break;
          }

          if (window.Logger) {
            window.Logger.log(
              `DEBUG ChordManager: Applied expression ${noteExpression.type} to synth ${synthId}`,
              "expressions",
            );
          }
        } else {
          // No expression for this note
          synthProgram.expression = "none";
          synthProgram.vibratoEnabled = false;
          synthProgram.tremoloEnabled = false;
          synthProgram.trillEnabled = false;

          if (window.Logger) {
            window.Logger.log(
              `DEBUG ChordManager: No expression found for note ${assignment.noteName} (synth ${synthId})`,
              "expressions",
            );
          }
        }
      }

      assignments.push({ synthId, program: synthProgram, assignment });
    });

    this.eventBus.emit("chord:distributed", {
      chord: this.currentChord,
      noteNames,
      assignments,
      distribution: this.getDistributionSummary(),
      timestamp: Date.now(),
    });

    return assignments;
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
