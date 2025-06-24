/**
 * ExpressionManager Module for String Assembly FM
 * Handles chord expressions, note assignment, and expression distribution
 */

import { eventBus } from "../core/EventBus.js";
import { appState } from "../state/AppState.js";
import { Config } from "../core/Config.js";

export class ExpressionManager {
  constructor() {
    this.eventBus = eventBus;
    this.appState = appState;
    this.currentExpressions = new Map();
    this.noteAssignments = new Map();
    this.expressionModes = ["none", "vibrato", "trill", "tremolo"];
    this.isInitialized = false;
  }

  /**
   * Initialize the expression manager
   */
  initialize() {
    if (this.isInitialized) {
      if (window.Logger) {
        window.Logger.log("ExpressionManager already initialized", "lifecycle");
      }
      return;
    }

    if (window.Logger) {
      window.Logger.log("Initializing ExpressionManager...", "lifecycle");
    }

    // Set up event listeners
    this.setupEventListeners();

    // Set up state subscriptions
    this.setupStateSubscriptions();

    this.isInitialized = true;

    if (window.Logger) {
      window.Logger.log("ExpressionManager initialized", "lifecycle");
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

    // Listen for expression changes
    this.eventBus.on("expression:changed", (data) => {
      this.handleExpressionChange(data.expression);
    });

    // Listen for harmonic ratio changes
    this.eventBus.on("harmonicRatio:changed", (data) => {
      this.handleHarmonicRatioChange(data);
    });

    // Listen for synth connections
    this.eventBus.on("network:synthConnected", (data) => {
      this.assignNoteToSynth(data.synthId);
    });

    // Listen for program requests
    this.eventBus.on("network:programRequested", (data) => {
      this.sendProgramToSynth(data.synthId);
    });
  }

  /**
   * Set up state subscriptions
   * @private
   */
  setupStateSubscriptions() {
    // Subscribe to chord changes
    this.appState.subscribe("currentChord", (newChord) => {
      this.updateChordExpressions(newChord);
    });

    // Subscribe to expression changes
    this.appState.subscribe("selectedExpression", (newExpression) => {
      this.updateExpressionMode(newExpression);
    });

    // Subscribe to harmonic selections
    this.appState.subscribe("harmonicSelections", (newSelections) => {
      this.updateHarmonicSelections(newSelections);
    });
  }

  /**
   * Handle chord changes from piano
   * @param {Array} chord - Array of frequencies
   * @param {Array} noteNames - Array of note names
   * @private
   */
  handleChordChange(chord, noteNames) {
    if (window.Logger) {
      window.Logger.log(
        `Chord changed: [${noteNames.join(", ")}]`,
        "expressions",
      );
    }

    // Create chord state for distribution
    const chordState = this.createChordState(chord, noteNames);
    this.appState.set("currentChordState", chordState);

    // Update expression display
    this.updateExpressionDisplay();

    // Redistribute notes to connected synths
    this.redistributeNotesToSynths();
  }

  /**
   * Handle expression mode changes
   * @param {string} expression - New expression mode
   * @private
   */
  handleExpressionChange(data) {
    // data is { note, expression, allExpressions }
    if (window.Logger) {
      // Log the actual expression object for the note, or the note if expression is removed
      const logMessage = data.expression
        ? `Expression for note ${data.note}: ${JSON.stringify(data.expression)}`
        : `Expression removed for note ${data.note}`;
      window.Logger.log(
        `ExpressionManager handling expression:changed - ${logMessage}`,
        "expressions",
      );
    }

    // Update the specific note's expression in ExpressionManager's state
    // PianoExpressionHandler is the source of truth for what the expression is.
    // ExpressionManager needs to stay in sync to generate correct programs.
    if (data.note && data.expression) {
      this.currentExpressions.set(data.note, data.expression);
    } else if (data.note && !data.expression) {
      // This case might occur if PianoExpressionHandler sends null/undefined for expression
      // when a note's expression is cleared or the note is removed from chord.
      this.currentExpressions.delete(data.note);
    }

    // Update AppState with the complete map of per-note expressions
    // Create a plain object copy for AppState, as StochasticChordDistributor expects an object
    const perNoteExpressionsObject = Object.fromEntries(
      this.currentExpressions,
    );
    this.appState.set("perNoteExpressions", perNoteExpressionsObject);

    // The PianoExpressionHandler has already updated the visual state of the piano keys.
    // this.updateExpressionDisplay(); // This method was for the legacy window.svgExpression.render()
    // and can be removed or made conditional if still needed for other UI.

    // Send updated programs to synths based on the potentially new expression state for one or more notes.
    // updateSynthPrograms iterates over this.noteAssignments, which should be updated
    // by assignNoteToSynth if the overall chord or synth availability changes.
    // For a per-note expression change, we might need a more targeted update.
    // For now, let's assume updateSynthPrograms will correctly regenerate programs
    // if this.currentExpressions (used by createProgramWithExpression) has changed.
    this.updateSynthPrograms();
  }

  /**
   * Handle harmonic ratio changes
   * @param {Object} data - Harmonic ratio change data
   * @private
   */
  handleHarmonicRatioChange(data) {
    if (window.Logger) {
      window.Logger.log(
        `Harmonic ratio changed: ${data.expression} ${data.type}`,
        "expressions",
      );
    }

    // Update expression parameters
    this.updateExpressionParameters();

    // Send updated programs to synths
    this.updateSynthPrograms();
  }

  /**
   * Create chord state for distribution
   * @param {Array} chord - Array of frequencies
   * @param {Array} noteNames - Array of note names
   * @returns {Object} Chord state object
   * @private
   */
  createChordState(chord, noteNames) {
    const selectedExpression =
      this.appState.get("selectedExpression") || "none";
    const harmonicSelections = this.appState.get("harmonicSelections");

    return {
      chord,
      noteNames,
      expression: selectedExpression,
      harmonicSelections: this.serializeHarmonicSelections(harmonicSelections),
      timestamp: Date.now(),
    };
  }

  /**
   * Serialize harmonic selections for storage/transmission
   * @param {Object} harmonicSelections - Harmonic selections with Sets
   * @returns {Object} Serialized harmonic selections
   * @private
   */
  serializeHarmonicSelections(harmonicSelections) {
    const serialized = {};
    Object.entries(harmonicSelections).forEach(([key, selection]) => {
      if (selection instanceof Set) {
        serialized[key] = Array.from(selection);
      } else {
        serialized[key] = selection;
      }
    });
    return serialized;
  }

  /**
   * Update chord expressions based on current settings
   * @param {Array} chord - Current chord frequencies
   * @private
   */
  updateChordExpressions(chord) {
    const selectedExpression =
      this.appState.get("selectedExpression") || "none";

    // Clear existing expressions
    this.currentExpressions.clear();

    if (chord && chord.length > 0 && selectedExpression !== "none") {
      // Create expressions for each note in chord
      chord.forEach((frequency, index) => {
        const noteName = this.frequencyToNoteName(frequency); // Get note name
        const expression = this.createNoteExpression(
          frequency,
          selectedExpression,
          index,
          chord.length,
        );
        this.currentExpressions.set(noteName, expression); // Use noteName as key
      });
    }

    // Update AppState with the complete map of per-note expressions
    const perNoteExpressionsObject = Object.fromEntries(
      this.currentExpressions,
    );
    this.appState.set("perNoteExpressions", perNoteExpressionsObject);

    // Emit expression update event
    this.eventBus.emit("expressions:updated", {
      expressions: Array.from(this.currentExpressions.values()),
      expressionMode: selectedExpression,
      timestamp: Date.now(),
    });
  }

  /**
   * Create expression for a specific note
   * @param {number} frequency - Note frequency
   * @param {string} expressionType - Type of expression
   * @param {number} index - Note index in chord
   * @param {number} totalNotes - Total notes in chord
   * @returns {Object} Expression object
   * @private
   */
  createNoteExpression(frequency, expressionType, index, totalNotes) {
    const harmonicSelections = this.appState.get("harmonicSelections");
    const noteName = this.frequencyToNoteName(frequency);

    const expression = {
      frequency,
      noteName,
      type: expressionType,
      index,
      totalNotes,
      parameters: this.getExpressionParameters(
        expressionType,
        harmonicSelections,
      ),
      timestamp: Date.now(),
    };

    // Add expression-specific data
    switch (expressionType) {
      case "vibrato":
        expression.vibratoRate = this.getRandomHarmonicRatio(
          harmonicSelections["vibrato-numerator"],
          harmonicSelections["vibrato-denominator"],
        );
        break;
      case "trill":
        expression.trillTarget = this.calculateTrillTarget(
          frequency,
          harmonicSelections,
        );
        expression.trillRate = this.getRandomHarmonicRatio(
          harmonicSelections["trill-numerator"],
          harmonicSelections["trill-denominator"],
        );
        break;
      case "tremolo":
        expression.tremoloRate = this.getRandomHarmonicRatio(
          harmonicSelections["tremolo-numerator"],
          harmonicSelections["tremolo-denominator"],
        );
        break;
    }

    return expression;
  }

  /**
   * Get expression parameters for a given type
   * @param {string} expressionType - Type of expression
   * @param {Object} harmonicSelections - Current harmonic selections
   * @returns {Object} Expression parameters
   * @private
   */
  getExpressionParameters(expressionType, harmonicSelections) {
    const baseParams = {
      enabled: true,
      depth: 0.5,
      phase: Math.random() * 2 * Math.PI,
    };

    switch (expressionType) {
      case "vibrato":
        return {
          ...baseParams,
          rate: 5.0,
          ratios: {
            numerator: Array.from(
              harmonicSelections["vibrato-numerator"] || new Set([1]),
            ),
            denominator: Array.from(
              harmonicSelections["vibrato-denominator"] || new Set([1]),
            ),
          },
        };
      case "trill":
        return {
          ...baseParams,
          speed: 10.0,
          articulation: 0.5,
          ratios: {
            numerator: Array.from(
              harmonicSelections["trill-numerator"] || new Set([1]),
            ),
            denominator: Array.from(
              harmonicSelections["trill-denominator"] || new Set([1]),
            ),
          },
        };
      case "tremolo":
        return {
          ...baseParams,
          speed: 15.0,
          articulation: 0.7,
          ratios: {
            numerator: Array.from(
              harmonicSelections["tremolo-numerator"] || new Set([1]),
            ),
            denominator: Array.from(
              harmonicSelections["tremolo-denominator"] || new Set([1]),
            ),
          },
        };
      default:
        return baseParams;
    }
  }

  /**
   * Calculate trill target frequency
   * @param {number} baseFrequency - Base note frequency
   * @param {Object} harmonicSelections - Harmonic selections
   * @returns {number} Target frequency for trill
   * @private
   */
  calculateTrillTarget(baseFrequency, harmonicSelections) {
    const numerators = Array.from(
      harmonicSelections["trill-numerator"] || new Set([1]),
    );
    const denominators = Array.from(
      harmonicSelections["trill-denominator"] || new Set([1]),
    );

    const ratio = this.getRandomHarmonicRatio(
      new Set(numerators),
      new Set(denominators),
    );

    // Calculate target frequency based on harmonic ratio
    const semitonesUp = Math.log2(ratio) * 12;
    return baseFrequency * Math.pow(2, semitonesUp / 12);
  }

  /**
   * Get random harmonic ratio from selections
   * @param {Set} numerators - Set of numerator values
   * @param {Set} denominators - Set of denominator values
   * @returns {number} Random harmonic ratio
   * @private
   */
  getRandomHarmonicRatio(numerators, denominators) {
    const numArray = Array.from(numerators || new Set([1]));
    const denArray = Array.from(denominators || new Set([1]));

    const randomNum = numArray[Math.floor(Math.random() * numArray.length)];
    const randomDen = denArray[Math.floor(Math.random() * denArray.length)];

    return randomNum / randomDen;
  }

  /**
   * Assign note to synth
   * @param {string} synthId - Synth ID to assign note to
   * @returns {Object|null} Assignment result
   */
  assignNoteToSynth(synthId) {
    const chordState = this.appState.get("currentChordState");

    if (!chordState || chordState.chord.length === 0) {
      if (window.Logger) {
        window.Logger.log(
          `No chord state available for ${synthId} - cannot assign note`,
          "expressions",
        );
      }
      return null;
    }

    // Get expressions from app state
    const expressions = this.appState.get("expressions") || {};

    // Select note for this synth using round-robin
    const assignedNote = this.selectNoteForSynth(synthId, chordState.noteNames);
    const assignedFreq = this.noteToFrequency(assignedNote);
    const expression = expressions[assignedNote] || { type: "none" };

    // Build synth program
    const synthProgram = { ...chordState.baseProgram };
    synthProgram.fundamentalFrequency = assignedFreq;

    // Apply expression parameters
    this.applyExpressionToProgram(synthProgram, expression);

    // Store assignment
    const assignment = {
      synthId,
      frequency: assignedFreq,
      note: assignedNote,
      expression: expression,
      timestamp: Date.now(),
    };
    this.noteAssignments.set(synthId, assignment);

    if (window.Logger) {
      window.Logger.log(
        `Assigned ${assignedNote} (${assignedFreq.toFixed(1)}Hz) with ${expression.type} to ${synthId}`,
        "expressions",
      );
    }

    return {
      program: synthProgram,
      metadata: {
        baseNote: assignedNote,
        expression: expression.type,
      },
      transition: this.calculateTransitionTiming(synthProgram),
    };
  }

  /**
   * Select note for synth using round-robin distribution
   * @param {string} synthId - Synth ID
   * @param {Array} noteNames - Available note names
   * @returns {string} Selected note name
   * @private
   */
  selectNoteForSynth(synthId, noteNames) {
    const connectedSynths = this.appState.get("connectedSynths");
    const synthIds = Array.from(connectedSynths.keys());
    const synthIndex = synthIds.indexOf(synthId);

    if (synthIndex === -1) return noteNames[0]; // Fallback to first note

    const noteIndex = synthIndex % noteNames.length;
    return noteNames[noteIndex];
  }

  /**
   * Convert note name to frequency
   * @param {string} noteName - Note name (e.g., "C4", "F#5")
   * @returns {number} Frequency in Hz
   * @private
   */
  noteToFrequency(noteName) {
    const noteOrder = [
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

    const match = noteName.match(/^([A-G]#?)(\d)$/);
    if (!match) return 440; // Fallback to A4

    const noteName_ = match[1];
    const octave = parseInt(match[2]);
    const noteIndex = noteOrder.indexOf(noteName_);

    if (noteIndex === -1) return 440;

    const midiNote = (octave + 1) * 12 + noteIndex;
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }

  /**
   * Apply expression parameters to synth program
   * @param {Object} synthProgram - Synth program to modify
   * @param {Object} expression - Expression data
   * @private
   */
  applyExpressionToProgram(synthProgram, expression) {
    // Reset all expression parameters
    synthProgram.vibratoEnabled = false;
    synthProgram.tremoloEnabled = false;
    synthProgram.trillEnabled = false;

    if (!expression || expression.type === "none") {
      return;
    }

    // Get harmonic ratios for stochastic variation
    const harmonicRatios = this.getHarmonicRatios(expression.type);

    switch (expression.type) {
      case "vibrato":
        synthProgram.vibratoEnabled = true;
        synthProgram.vibratoRate =
          (expression.rate || 4) * harmonicRatios.ratio;
        synthProgram.vibratoDepth = expression.depth || 0.01;
        break;

      case "tremolo":
        synthProgram.tremoloEnabled = true;
        synthProgram.tremoloSpeed =
          (expression.speed || 10) * harmonicRatios.ratio;
        synthProgram.tremoloDepth = expression.depth || 0.3;
        synthProgram.tremoloArticulation =
          synthProgram.tremoloArticulation || 0.8;
        break;

      case "trill":
        synthProgram.trillEnabled = true;
        synthProgram.trillSpeed =
          (expression.speed || 8) * harmonicRatios.ratio;
        synthProgram.trillInterval = expression.interval || 2;
        synthProgram.trillArticulation = synthProgram.trillArticulation || 0.7;
        break;
    }
  }

  /**
   * Get harmonic ratios for expression type
   * @param {string} expressionType - Expression type
   * @returns {Object} Harmonic ratio data
   * @private
   */
  getHarmonicRatios(expressionType) {
    const harmonicSelections = this.appState.get("harmonicSelections") || {};
    const numeratorKey = `${expressionType}-numerator`;
    const denominatorKey = `${expressionType}-denominator`;

    const numerators = harmonicSelections[numeratorKey] || new Set([1]);
    const denominators = harmonicSelections[denominatorKey] || new Set([1]);

    // Random selection from enabled ratios
    const numeratorArray = Array.from(numerators);
    const denominatorArray = Array.from(denominators);

    const randomNum =
      numeratorArray[Math.floor(Math.random() * numeratorArray.length)];
    const randomDen =
      denominatorArray[Math.floor(Math.random() * denominatorArray.length)];

    return {
      numerator: randomNum,
      denominator: randomDen,
      ratio: randomNum / randomDen,
    };
  }

  /**
   * Create program with expression for assignment
   * @param {Object} assignment - Note assignment
   * @returns {Object} Program with expression parameters
   * @private
   */
  createProgramWithExpression(assignment) {
    // Get base program from current parameters
    const baseProgram = this.getCurrentProgram();

    // Add expression-specific parameters
    const expressionParams =
      this.getExpressionParametersForAssignment(assignment);

    return {
      ...baseProgram,
      ...expressionParams,
      frequency: assignment.frequency,
      note: assignment.note,
      expression: assignment.expression,
      timestamp: Date.now(),
    };
  }

  /**
   * Get expression parameters for specific assignment
   * @param {Object} assignment - Note assignment
   * @returns {Object} Expression parameters
   * @private
   */
  getExpressionParametersForAssignment(assignment) {
    const harmonicSelections = this.appState.get("harmonicSelections");
    const params = {};

    switch (assignment.expression) {
      case "vibrato":
        params.vibratoRate =
          this.getRandomHarmonicRatio(
            harmonicSelections["vibrato-numerator"],
            harmonicSelections["vibrato-denominator"],
          ) * 5.0; // Base vibrato rate
        break;

      case "trill":
        const trillRatio = this.getRandomHarmonicRatio(
          harmonicSelections["trill-numerator"],
          harmonicSelections["trill-denominator"],
        );
        params.trillSpeed = trillRatio * 10.0; // Base trill speed
        params.trillTarget = this.calculateTrillTarget(
          assignment.frequency,
          harmonicSelections,
        );
        break;

      case "tremolo":
        params.tremoloSpeed =
          this.getRandomHarmonicRatio(
            harmonicSelections["tremolo-numerator"],
            harmonicSelections["tremolo-denominator"],
          ) * 15.0; // Base tremolo speed
        break;
    }

    return params;
  }

  /**
   * Send program to specific synth
   * @param {string} synthId - Target synth ID
   */
  sendProgramToSynth(synthId) {
    const assignment = this.assignNoteToSynth(synthId);

    if (assignment && window.networkCoordinator) {
      window.networkCoordinator.sendProgramToSynth(
        synthId,
        assignment.program,
        assignment.transition,
      );
    }
  }

  /**
   * Redistribute notes to all connected synths
   */
  redistributeNotesToSynths() {
    const connectedSynths = this.appState.get("connectedSynths");

    connectedSynths.forEach((synthData, synthId) => {
      this.sendProgramToSynth(synthId);
    });

    if (window.Logger) {
      window.Logger.log(
        `Redistributed notes to ${connectedSynths.size} synths`,
        "expressions",
      );
    }
  }

  /**
   * Update synth programs when expression settings change
   * @private
   */
  updateSynthPrograms() {
    const connectedSynths = this.appState.get("connectedSynths");

    // Update programs for synths with current assignments
    this.noteAssignments.forEach((assignment, synthId) => {
      if (connectedSynths.has(synthId)) {
        const updatedProgram = this.createProgramWithExpression(assignment);

        if (window.networkCoordinator) {
          window.networkCoordinator.sendProgramToSynth(
            synthId,
            updatedProgram,
            this.calculateTransitionTiming(updatedProgram),
          );
        }
      }
    });
  }

  /**
   * Update expression mode
   * @param {string} newExpression - New expression mode
   * @private
   */
  updateExpressionMode(newExpression) {
    // Update current expressions for the new mode
    const currentChord = this.appState.get("currentChord");
    this.updateChordExpressions(currentChord);
    // updateChordExpressions now also updates AppState with perNoteExpressions
  }

  /**
   * Update harmonic selections
   * @param {Object} newSelections - New harmonic selections
   * @private
   */
  updateHarmonicSelections(newSelections) {
    // Update expression parameters
    this.updateExpressionParameters();
  }

  /**
   * Update expression parameters
   * @private
   */
  updateExpressionParameters() {
    // Recalculate expression parameters with new harmonic ratios
    const currentChord = this.appState.get("currentChord");
    if (currentChord && currentChord.length > 0) {
      this.updateChordExpressions(currentChord);
    }
  }

  /**
   * Update expression display
   * @private
   */
  updateExpressionDisplay() {
    try {
      // Update SVG expression display if available
      if (window.svgExpression) {
        window.svgExpression.render();
      }
    } catch (error) {
      if (window.Logger) {
        window.Logger.log(
          `Error updating expression display: ${error}`,
          "error",
        );
      }
    }
  }

  /**
   * Get current program from UI or state
   * @returns {Object} Current program
   * @private
   */
  getCurrentProgram() {
    // Try to get from parameter controls first
    if (window.parameterControls) {
      return window.parameterControls.getAllParameterValues();
    }

    // Fallback to app state
    return this.appState.get("currentProgram") || Config.DEFAULT_PROGRAM;
  }

  /**
   * Calculate transition timing for program
   * @param {Object} program - Program to calculate timing for
   * @returns {Object} Transition timing parameters
   * @private
   */
  calculateTransitionTiming(program) {
    const baseTransitionTime = program.transitionTiming || 1.0;
    const variance = program.transitionVariance || 0.1;

    const randomVariance = (Math.random() - 0.5) * 2 * variance;
    const actualTransitionTime = Math.max(
      0.1,
      baseTransitionTime + randomVariance,
    );

    return {
      duration: actualTransitionTime,
      shape: program.transitionShape || 0.5,
      delay: 0,
    };
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
   * Get current expressions
   * @returns {Map} Current expressions map
   */
  getCurrentExpressions() {
    return new Map(this.currentExpressions);
  }

  /**
   * Get note assignments
   * @returns {Map} Current note assignments
   */
  getNoteAssignments() {
    return new Map(this.noteAssignments);
  }

  /**
   * Clear all assignments for disconnected synth
   * @param {string} synthId - Synth ID that disconnected
   */
  clearSynthAssignment(synthId) {
    this.noteAssignments.delete(synthId);

    if (window.Logger) {
      window.Logger.log(
        `Cleared assignment for disconnected synth: ${synthId}`,
        "expressions",
      );
    }
  }

  /**
   * Clear all expressions and assignments
   */
  clearAll() {
    this.currentExpressions.clear();
    this.noteAssignments.clear();

    // Update AppState
    this.appState.set("perNoteExpressions", {});

    if (window.Logger) {
      window.Logger.log(
        "Cleared all expressions and assignments",
        "expressions",
      );
    }
  }

  /**
   * Add event listener for expression events
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    return this.eventBus.on(`expressions:${event}`, handler);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  off(event, handler) {
    this.eventBus.off(`expressions:${event}`, handler);
  }

  /**
   * Cleanup and destroy
   */
  destroy() {
    this.clearAll();
    this.isInitialized = false;

    if (window.Logger) {
      window.Logger.log("ExpressionManager destroyed", "lifecycle");
    }
  }
}

// Create global instance
export const expressionManager = new ExpressionManager();

// Make available globally for backward compatibility
if (typeof window !== "undefined") {
  window.ExpressionManager = ExpressionManager;
  window.expressionManager = expressionManager;
}
