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
import { programState } from "../state/ProgramState.js";
import { ParameterResolver } from "./ParameterResolver.js";

export class PartManager {
  constructor() {
    this.eventBus = eventBus;
    this.appState = appState;
    this.isInitialized = false;
    this.lastSentProgram = null;
    this.parameterResolver = new ParameterResolver(appState);
  }

  /**
   * Get current chord from AppState
   * @private
   */
  get currentChord() {
    return this.appState.getNested('performance.currentProgram.chord.frequencies') || [];
  }

  /**
   * Get note expressions from AppState
   * @private
   */
  get noteExpressions() {
    const expressions = this.appState.getNested('performance.currentProgram.chord.expressions') || {};
    return new Map(Object.entries(expressions));
  }

  /**
   * Get harmonic selections from AppState
   * @private
   */
  get harmonicSelections() {
    return this.appState.getNested('performance.currentProgram.harmonicSelections') || {
      "vibrato-numerator": new Set([1]),
      "vibrato-denominator": new Set([1]),
      "tremolo-numerator": new Set([1]),
      "tremolo-denominator": new Set([1]),
      "trill-numerator": new Set([1]),
      "trill-denominator": new Set([1]),
    };
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
      // Don't automatically redistribute when loading from banks
      // The synths will load their saved programs with correct values
      if (!data.fromBankLoad) {
        this.setChord(data.frequencies);
      } else {
        // Just update AppState without sending to synths
        this.appState.setNested('performance.currentProgram.chord.frequencies', [...data.frequencies]);
      }
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
    this.eventBus.on("network:synthConnected", (data) => {
      this.handleSynthConnected(data.synthId);
    });

    this.eventBus.on("network:synthDisconnected", (data) => {
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
    // Update app state
    this.appState.setNested('performance.currentProgram.chord.frequencies', [...frequencies]);
    
    // Clean up expressions for notes no longer in chord
    const currentNotes = new Set(
      frequencies.map((f) => this.frequencyToNoteName(f)),
    );
    const expressions = this.appState.getNested('performance.currentProgram.chord.expressions') || {};
    const newExpressions = {};
    
    // Keep only expressions for notes in the current chord
    for (const [noteName, expression] of Object.entries(expressions)) {
      if (currentNotes.has(noteName)) {
        newExpressions[noteName] = expression;
      }
    }
    
    // Update expressions in AppState
    this.appState.setNested('performance.currentProgram.chord.expressions', newExpressions);

    // Update ProgramState
    programState.updateChord(frequencies, newExpressions);
    
    // Mark as changed for sync tracking
    this.appState.markParameterChanged("chord");
    
    // Update sync status
    if (window.updateSyncStatus) {
      window.updateSyncStatus();
    }

    // Redistribute if we have synths
    this.redistributeToSynths();

  }

  /**
   * Set expression for a note
   * @param {string} noteName - Note name (e.g., "C4")
   * @param {Object} expression - Expression object {type, ...params}
   */
  setNoteExpression(noteName, expression) {
    // Get current expressions from AppState
    const expressions = this.appState.getNested('performance.currentProgram.chord.expressions') || {};
    const newExpressions = { ...expressions };
    
    if (expression && expression.type && expression.type !== "none") {
      newExpressions[noteName] = expression;
    } else {
      delete newExpressions[noteName];
    }

    // Update AppState
    this.appState.setNested('performance.currentProgram.chord.expressions', newExpressions);

    // Update ProgramState
    programState.updateNoteExpression(noteName, expression);
    
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
    const selections = { ...this.harmonicSelections };
    
    if (selections[key]) {
      selections[key] = new Set(data.selection);
      
      // Update AppState
      this.appState.setNested('performance.currentProgram.harmonicSelections', selections);
      
      // Update ProgramState
      programState.updateHarmonicSelection(key, Array.from(data.selection));
      
    }
  }


  /**
   * Get synth assignments from AppState
   * @private
   */
  get synthAssignments() {
    return this.appState.getNested('performance.currentProgram.parts.assignments') || new Map();
  }

  /**
   * Set synth assignments in AppState
   * @private
   */
  setSynthAssignments(assignments) {
    this.appState.setNested('performance.currentProgram.parts.assignments', assignments);
  }

  /**
   * Redistribute current chord to connected synths
   */
  redistributeToSynths() {
    const connectedSynths = this.appState.getNested('connections.synths');
    if (!connectedSynths || connectedSynths.size === 0) {
      this.setSynthAssignments(new Map());
      return;
    }

    const synthIds = Array.from(connectedSynths.keys());
    const assignments = new Map();

    if (this.currentChord.length === 0) {
      // No chord - clear assignments
      this.setSynthAssignments(assignments);
      return;
    }

    // Simple round-robin distribution
    synthIds.forEach((synthId, index) => {
      const noteIndex = index % this.currentChord.length;
      const frequency = this.currentChord[noteIndex];
      const noteName = this.frequencyToNoteName(frequency);
      const expression = this.noteExpressions.get(noteName) || { type: "none" };
      
      assignments.set(synthId, {
        frequency,
        expression,
      });
    });

    this.setSynthAssignments(assignments);
  }

  /**
   * Send program to a specific synth with stochastic resolution
   * @param {string} synthId - Synth ID to send to
   * @param {Object} transitionConfig - Transition configuration
   */
  async sendProgramToSpecificSynth(synthId, transitionConfig = null) {
    
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
    
    // Use default transition config if not provided
    if (!transitionConfig) {
      transitionConfig = {
        duration: baseProgram.transitionDuration || 10,
        stagger: baseProgram.transitionStagger || 0,
        durationSpread: baseProgram.transitionDurationSpread || 0,
        glissando: baseProgram.glissando !== undefined ? baseProgram.glissando : true
      };
    }
    
    const powerState = powerCheckbox ? powerCheckbox.checked : true;
    
    // Get assignment for this synth
    const assignment = this.synthAssignments.get(synthId);
    
    // Use ParameterResolver to build complete program
    const resolvedProgram = assignment 
      ? this.parameterResolver.resolveForSynth(synthId, assignment, baseProgram, transitionConfig)
      : baseProgram; // Send base program without assignment to silence
    
    // Build complete message
    const programMessage = this.parameterResolver.buildProgramMessage(resolvedProgram, {
      chord: {
        frequencies: [...this.currentChord],
        expressions: Object.fromEntries(this.noteExpressions)
      },
      parts: Object.fromEntries(this.synthAssignments),
      power: powerState
    });
    
    // Send program
    const success = networkCoordinator.sendProgramToSynth(
      synthId,
      programMessage,
      transitionConfig
    );
    
    if (success) {
      if (assignment) {
        Logger.log(
          `Sent to ${synthId}: ${assignment.frequency.toFixed(1)}Hz, expression: ${assignment.expression.type || 'none'}`,
          "parts"
        );
      } else {
        Logger.log(`Sent empty assignment to ${synthId} (will silence)`, "parts");
      }
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
      duration: baseProgram.transitionDuration,
      stagger: baseProgram.transitionStagger,
      durationSpread: baseProgram.transitionDurationSpread,
      glissando: baseProgram.glissando !== undefined ? baseProgram.glissando : true, // default true
    };



    // Always get connected synths, even if no assignments
    const connectedSynths = this.appState.getNested('connections.synths');
    const allSynthIds = Array.from(connectedSynths.keys());
    
    if (allSynthIds.length === 0) {
      Logger.log("No synths connected", "warn");
      return;
    }
    
    Logger.log(`Sending current part: ${this.currentChord.length} notes, ${this.synthAssignments.size} assignments`, "parts");

    // Get current power state (powerCheckbox already declared above)
    const powerState = powerCheckbox ? powerCheckbox.checked : true;
    
    // Create the program message with current assignments (may be empty!)
    const programMessage = {
      ...baseProgram,
      chord: {
        frequencies: [...this.currentChord],
        expressions: Object.fromEntries(this.noteExpressions)
      },
      parts: Object.fromEntries(this.synthAssignments),
      transition: transitionConfig,
      power: powerState  // Include power state in program
    };

    // Send to ALL connected synths (not just assigned ones)
    // Use ParameterResolver for each synth
    let successCount = 0;
    for (let i = 0; i < allSynthIds.length; i++) {
      const synthId = allSynthIds[i];
      const assignment = this.synthAssignments.get(synthId);
      
      try {
        // Use ParameterResolver to build complete program for this synth
        const resolvedProgram = assignment 
          ? this.parameterResolver.resolveForSynth(synthId, assignment, baseProgram, transitionConfig)
          : baseProgram; // Send base program without assignment to silence
        
        // Build complete message
        const synthProgramMessage = this.parameterResolver.buildProgramMessage(resolvedProgram, {
          chord: {
            frequencies: [...this.currentChord],
            expressions: Object.fromEntries(this.noteExpressions)
          },
          parts: Object.fromEntries(this.synthAssignments),
          power: powerState
        });
        
        // Send resolved program
        const success = networkCoordinator.sendProgramToSynth(
          synthId,
          synthProgramMessage,
          transitionConfig
        );

        if (success) {
          successCount++;
        } else {
          Logger.log(`Failed to send to ${synthId}`, "error");
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
      `Part sent successfully to ${successCount}/${allSynthIds.length} synths`,
      "parts",
    );

    return { successCount, totalSynths: allSynthIds.length };
  }



  /**
   * Handle synth connection
   * @param {string} synthId - Connected synth ID
   * @private
   */
  handleSynthConnected(synthId) {
    // Just redistribute - don't send program yet
    // Synth will request program after SynthCore initialization
    this.redistributeToSynths();
  }

  /**
   * Handle synth disconnection
   * @param {string} synthId - Disconnected synth ID
   * @private
   */
  handleSynthDisconnected(synthId) {
    this.synthAssignments.delete(synthId);
    this.redistributeToSynths();
  }

  /**
   * Handle program request from synth (replaces ExpressionManager functionality)
   * @param {string} synthId - Requesting synth ID
   * @private
   */
  handleProgramRequest(synthId) {

    // Only send if we have a lastSentProgram (i.e., user has sent a program)
    if (this.lastSentProgram && this.currentChord.length > 0) {
      const assignment = this.synthAssignments.get(synthId);
      if (assignment) {
        // Use ParameterResolver to build complete program
        const resolvedProgram = this.parameterResolver.resolveForSynth(
          synthId, 
          assignment, 
          this.lastSentProgram.baseProgram,
          { duration: 0, stagger: 0, durationSpread: 0 } // No transition for request
        );
        
        // Build complete message
        const programMessage = this.parameterResolver.buildProgramMessage(resolvedProgram, {
          chord: {
            frequencies: [...this.currentChord],
            expressions: Object.fromEntries(this.noteExpressions)
          },
          parts: Object.fromEntries(this.synthAssignments),
          power: this.lastSentProgram.baseProgram.powerOn || false
        });
        
        // Send resolved program
        const networkCoordinator = this.appState.get("networkCoordinator");
        if (networkCoordinator) {
          networkCoordinator.sendProgramToSynth(synthId, programMessage, {
            duration: 0,
            stagger: 0,
            durationSpread: 0
          });
        }
      }
    }
    // If no active program, synth will remain waiting
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
    this.appState.setNested('performance.currentProgram.chord.frequencies', []);
    this.appState.setNested('performance.currentProgram.chord.expressions', {});
    this.setSynthAssignments(new Map());
    Logger.log("Part cleared", "parts");
  }

  /**
   * Get statistics about current state
   * @returns {Object} Statistics
   */
  getStatistics() {
    const connectedSynths = this.appState.getNested('connections.synths') || new Map();
    const chord = this.currentChord;
    const expressions = this.noteExpressions;

    return {
      chordSize: chord.length,
      expressionsCount: expressions.size,
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
