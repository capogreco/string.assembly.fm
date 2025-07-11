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
import { Part } from "./Part.js";

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
   * Get current parts (frequency + expression pairs)
   * @private
   */
  get currentParts() {
    return this.appState.getNested('performance.currentProgram.parts.current') || [];
  }
  
  // ========== NEW PARTS PARADIGM METHODS ==========
  
  /**
   * Set the complete parts array (replaces the chord)
   * @param {Part[]} parts - Array of Part objects
   */
  setParts(parts) {
    // Validate parts
    const validParts = parts.filter(p => p instanceof Part || (p && p.frequency));
    
    // Convert plain objects to Part instances if needed
    const partInstances = validParts.map(p => {
      if (p instanceof Part) {
        return p;
      } else {
        return Part.fromObject(p);
      }
    });
    
    // Store in app state as plain objects (to avoid serialization issues)
    const plainParts = partInstances.map(p => p.toObject());
    this.appState.setNested('performance.currentProgram.parts', plainParts);
    
    // Update legacy frequency array for compatibility (temporary)
    const frequencies = partInstances.map(p => p.frequency);
    this.appState.setNested('performance.currentProgram.chord.frequencies', frequencies);
    
    // Mark as changed for sync tracking
    this.appState.markParameterChanged("parts");
    
    // Update sync status
    if (window.updateSyncStatus) {
      window.updateSyncStatus();
    }
    
    // Redistribute parts to synths
    this.redistributePartsNew();
    
    Logger.log(`Set ${partInstances.length} parts`, 'parts');
  }
  
  /**
   * Add a part to the chord
   * @param {Part} part - Part object to add
   */
  addPartNew(part) {
    try {
      const currentParts = [...this.getParts()];
      currentParts.push(part);
      this.setParts(currentParts);
      
      Logger.log(`Added part: ${part.frequency}Hz with ${part.expression.type}`, 'parts');
    } catch (error) {
      Logger.log(`Error in addPartNew: ${error.message}`, 'error');
      Logger.log(`Part data: ${JSON.stringify(part)}`, 'error');
      throw error;
    }
  }
  
  /**
   * Remove a part by ID
   * @param {string} partId - ID of part to remove
   */
  removePart(partId) {
    try {
      const currentParts = this.getParts().filter(p => p.id !== partId);
      this.setParts(currentParts);
      
      Logger.log(`Removed part`, 'parts');
    } catch (error) {
      Logger.log(`Error in removePart: ${error.message}`, 'error');
      Logger.log(`PartId: ${partId}`, 'error');
      throw error;
    }
  }
  
  /**
   * Update a part's properties
   * @param {string} partId - ID of part to update
   * @param {Object} updates - Properties to update {frequency?, expression?}
   */
  updatePart(partId, updates) {
    const currentParts = this.getParts();
    const index = currentParts.findIndex(p => p.id === partId);
    
    if (index === -1) {
      Logger.log(`Part ${partId} not found for update`, 'warn');
      return;
    }
    
    // Create new part with updates (immutable)
    const updatedPart = currentParts[index].update(updates);
    
    // Replace in array
    const newParts = [...currentParts];
    newParts[index] = updatedPart;
    
    this.setParts(newParts);
    
    Logger.log(`Updated part ${partId}`, 'parts');
  }
  
  /**
   * Get current parts array
   * @returns {Part[]} Array of Part objects
   */
  getParts() {
    const stored = this.appState.getNested('performance.currentProgram.parts');
    
    // Ensure we have an array
    if (!stored || !Array.isArray(stored)) {
      return [];
    }
    
    // Ensure they're Part instances
    return stored.map(p => p instanceof Part ? p : Part.fromObject(p));
  }
  
  /**
   * Redistribute parts to connected synths using the new paradigm
   */
  redistributePartsNew() {
    const connectedSynths = this.appState.getNested('connections.synths');
    if (!connectedSynths || connectedSynths.size === 0) {
      this.setSynthAssignments(new Map());
      return;
    }
    
    const synthIds = Array.from(connectedSynths.keys());
    const parts = this.getParts();
    const assignments = new Map();
    
    if (parts.length === 0) {
      // No parts - clear assignments
      this.setSynthAssignments(assignments);
      return;
    }
    
    // Distribute parts to synths
    synthIds.forEach((synthId, index) => {
      // For note allocation: when there are fewer parts than synths,
      // multiple synths will play the same part (unison)
      const partIndex = index % parts.length;
      const part = parts[partIndex];
      
      // Store the complete part as the assignment
      const assignment = {
        frequency: part.frequency,
        expression: part.expression,
        partId: part.id
      };
      assignments.set(synthId, assignment);
      
      // Only log details if there are few synths
      if (synthIds.length <= 4) {
        const mode = parts.length < synthIds.length ? ' (unison)' : '';
        Logger.log(`  Assigned to ${synthId}: ${this.frequencyToNoteName(part.frequency)} with ${part.expression?.type || 'none'}${mode}`, 'parts');
      }
    });
    
    this.setSynthAssignments(assignments);
    
    // Only log summary for large synth counts
    if (synthIds.length > 4) {
      Logger.log(`Redistributed ${parts.length} parts to ${synthIds.length} synths`, 'parts');
    }
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
      // PartManager already initialized
      return;
    }

    // Initializing PartManager...

    this.setupEventListeners();
    this.isInitialized = true;

    // PartManager initialized
  }

  /**
   * Set up event listeners
   * @private
   */
  setupEventListeners() {
    // REMOVED: Old event listeners for chord:changed and expression:changed
    // Parts are now managed through part:added and part:removed events

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
   * Set the current chord (LEGACY - should not be used with parts paradigm)
   * @param {number[]} frequencies - Array of frequencies
   */
  setChord(frequencies) {
    Logger.log('WARNING: setChord called - this should not be used with parts paradigm', 'warn');
    
    // Clear existing parts first
    this.setParts([]);
    
    // Create new parts from frequencies (without expressions)
    const newParts = frequencies.map(freq => new Part(freq, { type: 'none' }));
    this.setParts(newParts);
    
    // Update legacy state for compatibility
    this.appState.setNested('performance.currentProgram.chord.frequencies', [...frequencies]);
    
    // Update ProgramState
    if (programState) {
      programState.updateChord(frequencies);
    }
    
    // Mark as changed for sync tracking
    this.appState.markParameterChanged("chord");
    
    // Update sync status
    if (window.updateSyncStatus) {
      window.updateSyncStatus();
    }
  }

  // REMOVED: Old addPart method that used pendingExpressions
  // Use addPartNew() instead which works with Part objects

  // REMOVED: Old setNoteExpression method
  // Expressions are now part of Part objects and managed through setParts/addPartNew
  
  /**
   * Convert note name to frequency
   * @param {string} noteName - Note name (e.g., "C4")
   * @returns {number} Frequency in Hz
   */
  noteNameToFrequency(noteName) {
    const A4 = 440;
    const noteRegex = /^([A-G])(#|b)?(\d)$/;
    const match = noteName.match(noteRegex);
    
    if (!match) return 0;
    
    const [, note, accidental, octave] = match;
    const noteOffsets = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
    
    let semitones = noteOffsets[note];
    if (accidental === '#') semitones += 1;
    if (accidental === 'b') semitones -= 1;
    
    semitones += (parseInt(octave) - 4) * 12;
    
    return A4 * Math.pow(2, semitones / 12);
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
    return this.appState.getNested('performance.currentProgram.partsAssignments') || new Map();
  }

  /**
   * Set synth assignments in AppState
   * @private
   */
  setSynthAssignments(assignments) {
    this.appState.setNested('performance.currentProgram.partsAssignments', assignments);
  }

  // REMOVED: Old redistributeToSynths method that used pendingExpressions
  // Use redistributePartsNew() instead which works with Part objects

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
    
    // Build expressions from current assignments
    const expressions = {};
    for (const [id, assign] of this.synthAssignments) {
      const noteName = this.frequencyToNoteName(assign.frequency);
      if (assign.expression && assign.expression.type !== "none") {
        expressions[noteName] = assign.expression;
      }
    }
    
    // Build complete message
    const programMessage = this.parameterResolver.buildProgramMessage(resolvedProgram, {
      chord: {
        frequencies: [...this.currentChord],
        expressions: expressions
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
    
    // Build expressions from current assignments
    const expressions = {};
    for (const [id, assign] of this.synthAssignments) {
      const noteName = this.frequencyToNoteName(assign.frequency);
      if (assign.expression && assign.expression.type !== "none") {
        expressions[noteName] = assign.expression;
      }
    }
    
    // Create the program message with current assignments (may be empty!)
    const programMessage = {
      ...baseProgram,
      chord: {
        frequencies: [...this.currentChord],
        expressions: expressions
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
            expressions: expressions  // Use the expressions we built above
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
    this.redistributePartsNew();
  }

  /**
   * Handle synth disconnection
   * @param {string} synthId - Disconnected synth ID
   * @private
   */
  handleSynthDisconnected(synthId) {
    // Remove assignment for disconnected synth
    const assignments = this.synthAssignments;
    assignments.delete(synthId);
    this.setSynthAssignments(assignments);
    
    // Redistribute parts to remaining synths
    this.redistributePartsNew();
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
        
        // Build expressions from current assignments
        const expressions = {};
        for (const [id, assign] of this.synthAssignments) {
          const noteName = this.frequencyToNoteName(assign.frequency);
          if (assign.expression && assign.expression.type !== "none") {
            expressions[noteName] = assign.expression;
          }
        }
        
        // Build complete message
        const programMessage = this.parameterResolver.buildProgramMessage(resolvedProgram, {
          chord: {
            frequencies: [...this.currentChord],
            expressions: expressions
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
    // Build expressions from synthAssignments
    const expressions = {};
    for (const [synthId, assignment] of this.synthAssignments) {
      const noteName = this.frequencyToNoteName(assignment.frequency);
      if (assignment.expression && assignment.expression.type !== "none") {
        expressions[noteName] = assignment.expression;
      }
    }
    
    return {
      frequencies: [...this.currentChord],
      notes: this.currentChord.map((f) => this.frequencyToNoteName(f)),
      expressions: expressions,
      synthAssignments: Object.fromEntries(this.synthAssignments),
    };
  }

  /**
   * Clear current chord and expressions
   */
  clearPart() {
    // Clear the parts array (new paradigm)
    this.setParts([]);
    
    // Clear legacy state
    this.appState.setNested('performance.currentProgram.chord.frequencies', []);
    this.setSynthAssignments(new Map());
    
    Logger.log("Parts cleared", "parts");
  }

  /**
   * Get statistics about current state
   * @returns {Object} Statistics
   */
  getStatistics() {
    const connectedSynths = this.appState.getNested('connections.synths') || new Map();
    const chord = this.currentChord;
    
    // Count expressions from assignments
    let expressionsCount = 0;
    for (const [id, assignment] of this.synthAssignments) {
      if (assignment.expression && assignment.expression.type !== "none") {
        expressionsCount++;
      }
    }

    return {
      chordSize: chord.length,
      expressionsCount: expressionsCount,
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
