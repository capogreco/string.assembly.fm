/**
 * PartManager Module for String Assembly FM
 * Unified management of chord, expressions, and program distribution
 * Replaces ChordManager, ExpressionManager, and SimpleProgramState
 *
 * NOTE: This manages transitions for chord/expression state. Global parameter
 * transitions (sliders, etc.) are handled separately by the worklet's built-in
 * parameter smoothing system.
 */

import { eventBus } from "../core/EventBus.js";
import { appState } from "../state/AppState.js";
import { Logger } from "../core/Logger.js";

export class PartManager {
  constructor() {
    this.eventBus = eventBus;
    this.appState = appState;
    this.isInitialized = false;

    // Current musical state
    this.currentChord = []; // Array of frequencies
    this.noteExpressions = new Map(); // note -> expression object
    this.harmonicSelections = {
      "vibrato-numerator": new Set([1]),
      "vibrato-denominator": new Set([1]),
      "tremolo-numerator": new Set([1]),
      "tremolo-denominator": new Set([1]),
      "trill-numerator": new Set([1]),
      "trill-denominator": new Set([1]),
    };

    // Distribution state
    this.synthAssignments = new Map(); // synthId -> {note, frequency, expression}
    this.lastSentProgram = null;
  }

  /**
   * Initialize the part manager
   */
  async initialize() {
    if (this.isInitialized) {
      Logger.log("PartManager already initialized", "lifecycle");
      return;
    }

    Logger.log("Initializing PartManager...", "lifecycle");

    // Sync harmonic selections from AppState
    const savedSelections = this.appState.get("harmonicSelections");
    if (savedSelections) {
      this.harmonicSelections = savedSelections;
      Logger.log("Loaded harmonic selections from AppState", "parts");
    }

    this.setupEventListeners();
    this.isInitialized = true;

    Logger.log("PartManager initialized", "lifecycle");
  }

  /**
   * Set up event listeners
   * @private
   */
  setupEventListeners() {
    // Listen for chord changes from piano
    this.eventBus.on("chord:changed", (data) => {
      this.setChord(data.frequencies);
    });

    // Listen for expression changes from piano
    this.eventBus.on("expression:changed", (data) => {
      this.setNoteExpression(data.note, data.expression);
    });

    // Listen for harmonic selection changes
    this.eventBus.on("harmonicRatio:changed", (data) => {
      this.updateHarmonicSelection(data);
    });

    // Listen for synth connections/disconnections
    this.eventBus.on("synth:connected", (data) => {
      this.handleSynthConnected(data.synthId);
    });

    this.eventBus.on("synth:disconnected", (data) => {
      this.handleSynthDisconnected(data.synthId);
    });

    // Listen for program requests from synths (replaces ExpressionManager)
    this.eventBus.on("network:programRequested", (data) => {
      this.handleProgramRequest(data.synthId);
    });
  }

  /**
   * Set the current chord
   * @param {number[]} frequencies - Array of frequencies
   */
  setChord(frequencies) {
    this.currentChord = [...frequencies];

    // Clean up expressions for notes no longer in chord
    const currentNotes = new Set(
      frequencies.map((f) => this.frequencyToNoteName(f)),
    );
    for (const [noteName] of this.noteExpressions) {
      if (!currentNotes.has(noteName)) {
        this.noteExpressions.delete(noteName);
      }
    }

    // Update app state
    this.appState.set("currentChord", this.currentChord);
    
    // Update expressions in app state for UI visibility
    const expressionsObj = Object.fromEntries(this.noteExpressions);
    this.appState.set("expressions", expressionsObj);
    
    // Mark as changed for sync tracking
    this.appState.markParameterChanged("chord");
    
    // Update sync status
    if (window.updateSyncStatus) {
      window.updateSyncStatus();
    }

    // Redistribute if we have synths
    this.redistributeToSynths();

    Logger.log(`Chord set: ${frequencies.length} notes`, "parts");
  }

  /**
   * Set expression for a note
   * @param {string} noteName - Note name (e.g., "C4")
   * @param {Object} expression - Expression object {type, ...params}
   */
  setNoteExpression(noteName, expression) {
    
    if (expression && expression.type && expression.type !== "none") {
      this.noteExpressions.set(noteName, expression);
    } else {
      this.noteExpressions.delete(noteName);
    }

    // Update AppState expressions for UI visibility
    const expressionsObj = Object.fromEntries(this.noteExpressions);
    this.appState.set("expressions", expressionsObj);
    
    // Mark as changed for sync tracking
    this.appState.markParameterChanged(`expression_${noteName}`);
    
    // Update sync status
    if (window.updateSyncStatus) {
      window.updateSyncStatus();
    }

    Logger.log(
      `Expression set: ${noteName} -> ${expression?.type || "none"}`,
      "expressions",
    );
  }

  /**
   * Update harmonic ratio selection
   * @param {Object} data - {expression, type, selection}
   */
  updateHarmonicSelection(data) {
    const key = `${data.expression}-${data.type}`;
    if (this.harmonicSelections[key]) {
      this.harmonicSelections[key] = new Set(data.selection);
      Logger.log(`Harmonic selection updated: ${key}`, "expressions");
    }
  }

  /**
   * Get random harmonic ratio for expression
   * @param {string} expression - Expression type
   * @returns {number} Harmonic ratio
   */
  getRandomHarmonicRatio(expression) {
    const numeratorKey = `${expression}-numerator`;
    const denominatorKey = `${expression}-denominator`;

    const numerators = Array.from(this.harmonicSelections[numeratorKey] || new Set([1]));
    const denominators = Array.from(this.harmonicSelections[denominatorKey] || new Set([1]));


    if (numerators.length === 0 || denominators.length === 0) {
      return 1.0;
    }

    const randomNumerator =
      numerators[Math.floor(Math.random() * numerators.length)];
    const randomDenominator =
      denominators[Math.floor(Math.random() * denominators.length)];

    const ratio = randomNumerator / randomDenominator;
    return ratio;
  }

  /**
   * Redistribute current chord to connected synths
   */
  redistributeToSynths() {
    const connectedSynths = this.appState.get("connectedSynths");
    if (!connectedSynths || connectedSynths.size === 0) {
      this.synthAssignments.clear();
      return;
    }

    const synthIds = Array.from(connectedSynths.keys());
    this.synthAssignments.clear();

    if (this.currentChord.length === 0) {
      // No chord - clear assignments
      return;
    }

    // Simple round-robin distribution
    synthIds.forEach((synthId, index) => {
      const noteIndex = index % this.currentChord.length;
      const frequency = this.currentChord[noteIndex];
      const noteName = this.frequencyToNoteName(frequency);
      const expression = this.noteExpressions.get(noteName) || { type: "none" };
      

      this.synthAssignments.set(synthId, {
        frequency,
        expression,
      });
    });

    Logger.log(`Redistributed to ${synthIds.length} synths`, "parts");
  }

  /**
   * Send program to a specific synth with stochastic resolution
   * @param {string} synthId - Synth ID to send to
   * @param {Object} transitionConfig - Transition configuration
   */
  async sendProgramToSpecificSynth(synthId, transitionConfig = {}) {
    Logger.log(`Sending program to specific synth: ${synthId}`, "parts");
    
    const networkCoordinator = this.appState.get("networkCoordinator");
    if (!networkCoordinator) {
      throw new Error("Network coordinator not available");
    }
    
    // Get base program parameters
    const parameterControls = this.appState.get("parameterControls");
    if (!parameterControls) {
      throw new Error("Parameter controls not available");
    }
    
    const baseProgram = parameterControls.getAllParameterValues();
    
    // Add power state
    const powerCheckbox = document.getElementById("power");
    if (powerCheckbox) {
      baseProgram.powerOn = powerCheckbox.checked;
    }
    
    // Assign synth to chord if not already assigned
    if (!this.synthAssignments.has(synthId)) {
      // Find next available note in chord
      const assignedNotes = new Set(
        Array.from(this.synthAssignments.values()).map(a => a.frequency)
      );
      
      let assignment = null;
      for (const frequency of this.currentChord) {
        if (!assignedNotes.has(frequency)) {
          const noteName = this.frequencyToNoteName(frequency);
          const expression = this.noteExpressions.get(noteName) || { type: "none" };
          assignment = { frequency, expression };
          break;
        }
      }
      
      // If no unassigned notes, use round-robin
      if (!assignment && this.currentChord.length > 0) {
        const synthIds = Array.from(this.synthAssignments.keys());
        const index = synthIds.length % this.currentChord.length;
        const frequency = this.currentChord[index];
        const noteName = this.frequencyToNoteName(frequency);
        const expression = this.noteExpressions.get(noteName) || { type: "none" };
        assignment = { frequency, expression };
      }
      
      if (assignment) {
        this.synthAssignments.set(synthId, assignment);
        Logger.log(`Assigned ${synthId} to ${assignment.frequency.toFixed(1)}Hz`, "parts");
      } else {
        Logger.log(`No chord available to assign ${synthId}`, "warn");
        return;
      }
    }
    
    // Get assignment for this synth
    const assignment = this.synthAssignments.get(synthId);
    if (!assignment) {
      Logger.log(`No assignment found for ${synthId}`, "error");
      return;
    }
    
    // Create synth-specific program
    const synthProgram = { ...baseProgram };
    synthProgram.fundamentalFrequency = assignment.frequency;
    
    // Apply expression with stochastic resolution
    this.applyExpressionToProgram(synthProgram, assignment.expression);
    
    // Send with transition
    const success = networkCoordinator.sendProgramToSynth(
      synthId,
      synthProgram,
      transitionConfig
    );
    
    if (success) {
      Logger.log(
        `Sent to ${synthId}: ${assignment.frequency.toFixed(1)}Hz, expression: ${assignment.expression.type || 'none'}`,
        "parts"
      );
    } else {
      Logger.log(`Failed to send program to ${synthId}`, "error");
    }
  }

  /**
   * Send current part to all synths with transitions
   * This handles chord/expression transitions. Global parameter transitions
   * (like slider changes) are handled by the worklet's parameter smoothing.
   * @param {Object} options - Transition options
   */
  async sendCurrentPart(options = {}) {
    const networkCoordinator = this.appState.get("networkCoordinator");
    if (!networkCoordinator) {
      throw new Error("Network coordinator not available");
    }

    // Get base program parameters
    const parameterControls = this.appState.get("parameterControls");
    if (!parameterControls) {
      throw new Error("Parameter controls not available");
    }

    const baseProgram = parameterControls.getAllParameterValues();

    // Add power state
    const powerCheckbox = document.getElementById("power");
    if (powerCheckbox) {
      baseProgram.powerOn = powerCheckbox.checked;
    }

    // Get transition configuration
    const transitionConfig = {
      duration: parseFloat(baseProgram.transitionDuration) || 1.0,
      stagger: parseFloat(baseProgram.transitionStagger) || 0.0,
      durationSpread: parseFloat(baseProgram.transitionDurationSpread) || 0.0,
    };

    Logger.log(
      `Sending part with transition config: ${JSON.stringify(transitionConfig)}`,
      "parts",
    );


    // Send to each synth
    let successCount = 0;
    const synthIds = Array.from(this.synthAssignments.keys());


    for (let i = 0; i < synthIds.length; i++) {
      const synthId = synthIds[i];
      const assignment = this.synthAssignments.get(synthId);

      if (!assignment) {
        continue;
      }

      // Create synth-specific program
      const synthProgram = { ...baseProgram };
      synthProgram.fundamentalFrequency = assignment.frequency;


      // Apply expression parameters
      let targetExpression = "NONE";
      this.applyExpressionToProgram(synthProgram, assignment.expression);

      if (assignment.expression.type === "vibrato")
        targetExpression = "VIBRATO";
      else if (assignment.expression.type === "tremolo")
        targetExpression = "TREMOLO";
      else if (assignment.expression.type === "trill")
        targetExpression = "TRILL";

      // Calculate transition timing
      const transitionTiming = this.calculateTransitionTiming(
        transitionConfig,
        i,
      );


      try {
        // Send program
        const success = networkCoordinator.sendProgramToSynth(
          synthId,
          synthProgram,
          transitionTiming,
        );

        if (success) {
          successCount++;

          Logger.log(
            `Sent to ${synthId}: ${assignment.frequency.toFixed(1)}Hz, expression type: ${assignment.expression.type || 'MISSING'}`,
            "parts",
          );
          
        } else {
        }
      } catch (error) {
        Logger.log(`Failed to send to ${synthId}: ${error.message}`, "error");
      }
    }


    if (successCount === 0) {
      throw new Error("Failed to send to any synths");
    }

    this.lastSentProgram = {
      baseProgram,
      transitionConfig,
      timestamp: Date.now(),
    };
    Logger.log(
      `Part sent successfully to ${successCount}/${synthIds.length} synths`,
      "parts",
    );

    return { successCount, totalSynths: synthIds.length };
  }

  /**
   * Apply expression parameters to synth program
   * @param {Object} synthProgram - Program object to modify
   * @param {Object} expression - Expression object
   * @private
   */
  applyExpressionToProgram(synthProgram, expression) {
    // Reset all expression flags
    synthProgram.vibratoEnabled = 0;
    synthProgram.tremoloEnabled = 0;
    synthProgram.trillEnabled = 0;

    if (!expression || expression.type === "none") {
      return;
    }

    switch (expression.type) {
      case "vibrato":
        synthProgram.vibratoEnabled = 1;
        synthProgram.vibratoDepth =
          expression.depth || synthProgram.vibratoDepth || 0.01;
        const vibratoRatio = this.getRandomHarmonicRatio("vibrato");
        // Use expression rate as base, not the slider value
        const baseVibratoRate =
          expression.rate || synthProgram.vibratoRate || 5;
        synthProgram.vibratoRate = baseVibratoRate * vibratoRatio;
        break;

      case "tremolo":
        synthProgram.tremoloEnabled = 1;
        synthProgram.tremoloDepth =
          expression.depth || synthProgram.tremoloDepth || 0.3;
        synthProgram.tremoloArticulation =
          expression.articulation || synthProgram.tremoloArticulation || 0.8;
        const tremoloRatio = this.getRandomHarmonicRatio("tremolo");
        // Use expression speed as base, not the slider value
        const baseTremoloSpeed =
          expression.speed || synthProgram.tremoloSpeed || 10;
        synthProgram.tremoloSpeed = baseTremoloSpeed * tremoloRatio;
        break;

      case "trill":
        synthProgram.trillEnabled = 1;
        synthProgram.trillInterval =
          expression.interval || synthProgram.trillInterval || 2;
        synthProgram.trillArticulation =
          expression.articulation || synthProgram.trillArticulation || 0.7;
        const trillRatio = this.getRandomHarmonicRatio("trill");
        // Use expression speed as base, not the slider value
        const baseTrillSpeed = expression.speed || synthProgram.trillSpeed || 8;
        synthProgram.trillSpeed = baseTrillSpeed * trillRatio;
        break;
    }
  }

  /**
   * Calculate transition timing for a synth
   * @param {Object} config - Transition configuration
   * @param {number} synthIndex - Index of synth in list
   * @returns {Object} Timing object
   * @private
   */
  calculateTransitionTiming(config, synthIndex = 0) {
    const baseDuration = config.duration;
    const stagger = config.stagger; // 0 to 1 (0% to 100%)
    const durationSpread = config.durationSpread; // 0 to 1 (0% to 100%)

    // Calculate stagger delay using exponential algorithm
    // stagger = 0 means no stagger (all synths start together)
    // stagger = 1 means full 0.5x to 2x range of base duration
    let delay = 0;
    if (stagger > 0) {
      const staggerExponent = (Math.random() * 2 - 1) * stagger * Math.log(2);
      const staggerMultiplier = Math.exp(staggerExponent);
      delay = baseDuration * staggerMultiplier;
    }

    // Calculate duration variation using same exponential algorithm
    // durationSpread = 0 means no variation (all synths use base duration)
    // durationSpread = 1 means full 0.5x to 2x range of base duration
    let finalDuration = baseDuration;
    if (durationSpread > 0) {
      const durationExponent =
        (Math.random() * 2 - 1) * durationSpread * Math.log(2);
      const durationMultiplier = Math.exp(durationExponent);
      finalDuration = baseDuration * durationMultiplier;
    }

    return {
      delay: Math.max(0, delay),
      duration: finalDuration,
      stagger: stagger,
      durationSpread: durationSpread,
    };
  }

  /**
   * Handle synth connection
   * @param {string} synthId - Connected synth ID
   * @private
   */
  handleSynthConnected(synthId) {
    Logger.log(`Synth connected: ${synthId}`, "parts");
    this.redistributeToSynths();

    // Send current program if we have one
    if (this.lastSentProgram && this.currentChord.length > 0) {
      const assignment = this.synthAssignments.get(synthId);
      if (assignment) {
        // TODO: Send current program to new synth
        Logger.log(`Should send current program to ${synthId}`, "parts");
      }
    }
  }

  /**
   * Handle synth disconnection
   * @param {string} synthId - Disconnected synth ID
   * @private
   */
  handleSynthDisconnected(synthId) {
    Logger.log(`Synth disconnected: ${synthId}`, "parts");
    this.synthAssignments.delete(synthId);
    this.redistributeToSynths();
  }

  /**
   * Handle program request from synth (replaces ExpressionManager functionality)
   * @param {string} synthId - Requesting synth ID
   * @private
   */
  handleProgramRequest(synthId) {

    // If we have a current chord, send the current part to this synth
    if (this.currentChord.length > 0) {
      // Trigger redistribution which will assign this synth and send program
      this.redistributeToSynths();
    } else {
    }
  }

  /**
   * Convert frequency to note name
   * @param {number} frequency - Frequency in Hz
   * @returns {string} Note name
   */
  frequencyToNoteName(frequency) {
    const A4 = 440;
    const C0 = A4 * Math.pow(2, -4.75);

    if (frequency <= 0) return "C0";

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
   * Get current chord information
   * @returns {Object} Chord info
   */
  getChordInfo() {
    return {
      frequencies: [...this.currentChord],
      notes: this.currentChord.map((f) => this.frequencyToNoteName(f)),
      expressions: Object.fromEntries(this.noteExpressions),
      synthAssignments: Object.fromEntries(this.synthAssignments),
    };
  }

  /**
   * Clear current chord and expressions
   */
  clearPart() {
    this.currentChord = [];
    this.noteExpressions.clear();
    this.synthAssignments.clear();
    this.appState.set("currentChord", []);
    this.appState.set("expressions", {}); // Clear expressions in app state
    Logger.log("Part cleared", "parts");
  }

  /**
   * Get statistics about current state
   * @returns {Object} Statistics
   */
  getStatistics() {
    const connectedSynths = this.appState.get("connectedSynths") || new Map();

    return {
      chordSize: this.currentChord.length,
      expressionsCount: this.noteExpressions.size,
      connectedSynths: connectedSynths.size,
      assignedSynths: this.synthAssignments.size,
      lastSent: this.lastSentProgram?.timestamp || null,
    };
  }

  /**
   * Destroy the part manager
   */
  destroy() {
    this.eventBus.off("chord:changed");
    this.eventBus.off("expression:changed");
    this.eventBus.off("harmonicRatio:changed");
    this.eventBus.off("synth:connected");
    this.eventBus.off("synth:disconnected");

    this.clearPart();
    this.isInitialized = false;

    Logger.log("PartManager destroyed", "lifecycle");
  }
}

// Create singleton instance
export const partManager = new PartManager();

// Make available globally for debugging
if (typeof window !== "undefined") {
  window.PartManager = PartManager;
  window.partManager = partManager;
}
