/**
 * PianoKeyboard Module for String Assembly FM
 * Handles piano keyboard interactions for chord input
 */

import { eventBus } from "../core/EventBus.js";
import { appState } from "../state/AppState.js";
import { SystemConfig, ConfigUtils } from "../../config/system.config.js";
import { programState } from "../state/ProgramState.js";
import { PianoExpressionHandler } from "../piano/PianoExpressionHandler.js";

export class PianoKeyboard {
  constructor() {
    this.eventBus = eventBus;
    this.appState = appState;
    this.pianoElement = null;
    this.keys = new Map();
    this.currentChord = new Set(); // Initialize the chord set
    this.isInitialized = false;
    this.keyWidth = 20;
    this.whiteKeyHeight = 60;
    this.blackKeyHeight = 40;
    this.startNote = 24; // C1 MIDI note
    this.octaves = 7; // Display 7 octaves starting from C1
    this.endNote = this.startNote + this.octaves * 12 - 1; // Calculate end note based on start and octaves
    this.expressionHandler = null;
  }

  /**
   * Get instrument ranges for bowed string instruments
   * @private
   */
  getInstrumentRanges() {
    // Note: Frequencies can be pre-calculated if noteToFrequency is expensive or for clarity
    return {
      0: {
        // Violin
        name: "Violin",
        low: this.noteToFrequency("G", 3), // Approx 196.00 Hz
        high: this.noteToFrequency("A", 7), // Approx 3520.00 Hz (can go higher)
      },
      1: {
        // Viola
        name: "Viola",
        low: this.noteToFrequency("C", 3), // Approx 130.81 Hz
        high: this.noteToFrequency("E", 6), // Approx 1318.51 Hz
      },
      2: {
        // Cello
        name: "Cello",
        low: this.noteToFrequency("C", 2), // Approx 65.41 Hz
        high: this.noteToFrequency("C", 6), // Approx 1046.50 Hz
      },
      3: {
        // Double Bass
        name: "Double Bass",
        low: this.noteToFrequency("E", 1), // Approx 41.20 Hz
        high: this.noteToFrequency("G", 4), // Approx 392.00 Hz
      },
      4: {
        // None (Full Range for visual keyboard)
        name: "None",
        low: this.noteToFrequency("C", 0), // A very low C
        high: this.noteToFrequency("B", 8), // A very high B (covers C8)
      },
    };
  }

  /**
   * Convert note and octave to frequency
   * @param {string} note - Note name (e.g., "C", "C#", "D")
   * @param {number} octave - Octave number
   * @returns {number} Frequency in Hz
   * @private
   */
  noteToFrequency(note, octave) {
    const noteMap = {
      C: 0,
      "C#": 1,
      D: 2,
      "D#": 3,
      E: 4,
      F: 5,
      "F#": 6,
      G: 7,
      "G#": 8,
      A: 9,
      "A#": 10,
      B: 11,
    };

    const A4 = 440;
    const noteNumber = noteMap[note];
    if (noteNumber === undefined) return A4;

    const midiNumber = (octave + 1) * 12 + noteNumber;
    return A4 * Math.pow(2, (midiNumber - 69) / 12);
  }

  /**
   * Get the valid pitch range for the currently selected instrument body type.
   * Defaults to the "None" (full) range if bodyType is not set or invalid.
   * @returns {{ name: string, low: number, high: number }}
   * @public
   */
  getCurrentInstrumentRange() {
    const selectedBodyType =
      this.appState.get("bodyType") !== undefined
        ? this.appState.get("bodyType")
        : 4; // Default to "None" (index 4) if not set in AppState

    const instrumentRanges = this.getInstrumentRanges();
    let currentRange = instrumentRanges[selectedBodyType];

    if (!currentRange) {
      if (window.Logger) {
        window.Logger.log(
          `No valid range found for bodyType: ${selectedBodyType}. Defaulting to 'None' (full range).`,
          "warn",
        );
      }
      currentRange = instrumentRanges[4]; // Fallback to "None"
    }
    return currentRange;
  }

  /**
   * Initialize the piano keyboard
   */
  initialize() {
    if (this.isInitialized) {
      // PianoKeyboard already initialized
      return;
    }

    // Initializing PianoKeyboard...

    // Find piano element
    this.pianoElement = document.getElementById("piano");
    if (!this.pianoElement) {
      if (window.Logger) {
        window.Logger.log("Piano element not found", "error");
      }
      return;
    }

    // Create piano keyboard
    this.createPianoKeyboard(); // This draws all keys as visually active

    // Set up event listeners
    this.setupEventListeners();

    // Set up state subscriptions
    this.setupStateSubscriptions();

    // Initialize expression handler
    this.expressionHandler = new PianoExpressionHandler(this);
    this.expressionHandler.initialize();

    // Initialize bodyType from HTML select element
    this.initializeBodyTypeFromDOM();

    // Apply visual range styling based on current instrument
    if (window.Logger) {
      window.Logger.log("Applying initial instrument range styling", "info");
    }

    // Small delay to ensure SVG keys are fully rendered
    setTimeout(() => {
      this.updateKeyRangeStylesVisual();
    }, 100);

    this.isInitialized = true;

    // PianoKeyboard initialized
  }

  /**
   * Create the piano keyboard SVG
   * @private
   */
  createPianoKeyboard() {
    // Calculate dimensions based on container width
    const containerWidth = this.pianoElement.parentElement.clientWidth;
    const whiteKeysPerOctave = 7;
    const totalWhiteKeys = this.octaves * whiteKeysPerOctave;

    // Adjust key width to fit container
    this.keyWidth = Math.floor((containerWidth - 20) / totalWhiteKeys); // 20px padding
    const totalWidth = totalWhiteKeys * this.keyWidth;

    // Set SVG dimensions to fit container
    this.pianoElement.setAttribute("width", "100%");
    this.pianoElement.setAttribute("height", this.whiteKeyHeight);
    this.pianoElement.setAttribute(
      "viewBox",
      `0 0 ${totalWidth} ${this.whiteKeyHeight}`,
    );

    // Clear existing content
    this.pianoElement.innerHTML = "";

    // Create keys
    this.createWhiteKeys();
    this.createBlackKeys();

    if (window.Logger) {
      // Created piano keyboard
    }
  }

  /**
   * Create white keys
   * @private
   */
  createWhiteKeys() {
    const whiteKeyPattern = [0, 2, 4, 5, 7, 9, 11]; // C, D, E, F, G, A, B
    let whiteKeyIndex = 0;

    for (let octave = 0; octave < this.octaves + 1; octave++) {
      whiteKeyPattern.forEach((noteOffset) => {
        const midiNote = this.startNote + octave * 12 + noteOffset;

        // Stop if we exceed our range
        if (midiNote > this.endNote) return;

        const frequency = this.midiToFrequency(midiNote);
        const noteName = this.midiToNoteName(midiNote);

        const x = whiteKeyIndex * this.keyWidth;

        // Create white key rectangle
        const rect = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect",
        );
        rect.setAttribute("x", x);
        rect.setAttribute("y", 0);
        rect.setAttribute("width", this.keyWidth - 1);
        rect.setAttribute("height", this.whiteKeyHeight);
        rect.setAttribute("fill", "white");
        rect.setAttribute("data-original-fill", "white");
        rect.setAttribute("data-original-fill-active", "white"); // Used if we re-enable visual graying
        rect.setAttribute("stroke", "#ddd");
        rect.setAttribute("stroke-width", "1");
        rect.setAttribute("class", "piano-key white-key");
        rect.setAttribute("data-note", midiNote);
        rect.setAttribute("data-frequency", frequency);
        rect.setAttribute("data-note-name", noteName);

        // Hover effects are now managed by PianoExpressionHandler (if any)
        // or should be added there if desired.
        // Removing these listeners from PianoKeyboard to prevent color conflicts.

        this.pianoElement.appendChild(rect);

        this.keys.set(frequency, {
          element: rect,
          midiNote,
          frequency,
          noteName,
          type: "white",
          isActive: false,
        });

        whiteKeyIndex++;
      });
    }
  }

  /**
   * Create black keys
   * @private
   */
  createBlackKeys() {
    const blackKeyPattern = [1, 3, -1, 6, 8, 10, -1]; // C#, D#, (gap), F#, G#, A#, (gap)
    let whiteKeyIndex = 0;

    for (let octave = 0; octave < this.octaves + 1; octave++) {
      blackKeyPattern.forEach((noteOffset, patternIndex) => {
        if (noteOffset === -1) {
          whiteKeyIndex++;
          return; // Skip gaps
        }

        const midiNote = this.startNote + octave * 12 + noteOffset;

        // Stop if we exceed our range
        if (midiNote > this.endNote) return;

        const frequency = this.midiToFrequency(midiNote);
        const noteName = this.midiToNoteName(midiNote);

        // Calculate position between white keys
        const x = whiteKeyIndex * this.keyWidth + this.keyWidth * 0.7;

        // Create black key rectangle
        const rect = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect",
        );
        rect.setAttribute("x", x);
        rect.setAttribute("y", 0);
        rect.setAttribute("width", this.keyWidth * 0.6);
        rect.setAttribute("height", this.blackKeyHeight);
        rect.setAttribute("fill", "#333");
        rect.setAttribute("data-original-fill", "#333");
        rect.setAttribute("data-original-fill-active", "#333"); // Used if we re-enable visual graying
        rect.setAttribute("stroke", "#000");
        rect.setAttribute("stroke-width", "1");
        rect.setAttribute("class", "piano-key black-key");
        rect.setAttribute("data-note", midiNote);
        rect.setAttribute("data-frequency", frequency);
        rect.setAttribute("data-note-name", noteName);

        // Hover effects are now managed by PianoExpressionHandler (if any)
        // or should be added there if desired.
        // Removing these listeners from PianoKeyboard to prevent color conflicts.

        this.pianoElement.appendChild(rect);

        this.keys.set(frequency, {
          element: rect,
          midiNote,
          frequency,
          noteName,
          type: "black",
          isActive: false,
        });

        whiteKeyIndex++;
      });
    }
  }

  /**
   * Set up event listeners
   * @private
   */
  setupEventListeners() {
    if (!this.pianoElement) return;

    // Click events are now handled by PianoExpressionHandler
    // Commenting out to prevent double handling
    /*
    this.pianoElement.addEventListener("click", (e) => {
      const key = e.target.closest(".piano-key");
      if (key) {
        this.handleKeyClick(key, e);
      }
    });
    */

    // Keyboard events removed - will be added back later

    // Clear chord button
    const clearButton = document.getElementById("clear-chord");
    if (clearButton) {
      clearButton.addEventListener("click", () => {
        this.clearChord();
      });
    }
    
    // NOTE: Removed chord:changed event listener - now using direct renderParts() calls
  }

  /**
   * Initialize body type from DOM select element
   * @private
   */
  initializeBodyTypeFromDOM() {
    const bodyTypeSelect = document.getElementById("bodyType");
    if (bodyTypeSelect) {
      const selectedValue = parseInt(bodyTypeSelect.value);
      this.appState.set("bodyType", selectedValue);

      if (window.Logger) {
        window.Logger.log(
          `Initialized bodyType from DOM: ${selectedValue}`,
          "info",
        );
      }

      // Set up change listener
      bodyTypeSelect.addEventListener("change", (e) => {
        const newBodyType = parseInt(e.target.value);
        this.appState.set("bodyType", newBodyType);

        if (window.Logger) {
          window.Logger.log(
            `Body type changed via DOM: ${newBodyType}`,
            "info",
          );
        }
      });
    } else {
      // Fallback to default value
      this.appState.set("bodyType", 0); // Default to Violin

      if (window.Logger) {
        window.Logger.log(
          "bodyType select not found, defaulting to Violin (0)",
          "warn",
        );
      }
    }
  }

  /**
   * Set up state subscriptions
   * @private
   */
  setupStateSubscriptions() {
    // Chord changes are handled via chord:changed event in setupEventListeners()
    // No need to subscribe to state directly

    // Subscribe to body type changes
    this.appState.subscribe("bodyType", (newBodyType) => {
      if (window.Logger) {
        window.Logger.log(
          `Body type changed to: ${newBodyType}. Piano interaction range updated.`,
          "info",
        );
      }

      // Update visual range styling when instrument changes
      if (window.Logger) {
        window.Logger.log(
          `Updating range styling for bodyType: ${newBodyType}`,
          "info",
        );
      }
      // Small delay to ensure any pending visual updates complete
      setTimeout(() => {
        this.updateKeyRangeStylesVisual();
      }, 50);

      // Re-evaluate expressions that may now be out of range
      if (this.expressionHandler) {
        this.expressionHandler.syncWithAppState();
      }
    });
  }

  /**
   * (Optional) Update key visual styles based on instrument range (e.g., for graying out)
   * This is NOT called automatically by default with the current "all keys active" approach.
   * @private
   */
  updateKeyRangeStylesVisual() {
    if (!this.keys || this.keys.size === 0) {
      if (window.Logger) {
        window.Logger.log("Piano keys not yet created", "warn");
      }
      return;
    }

    const currentRange = this.getCurrentInstrumentRange();
    if (window.Logger) {
      window.Logger.log(
        `Updating range styling. Current range: ${currentRange ? currentRange.name : "None"}`,
        "info",
      );
    }

    let outOfRangeCount = 0;

    this.keys.forEach((keyData, frequency) => {
      const element = keyData.element;
      if (!element) return;

      const inRange =
        !currentRange ||
        (frequency >= currentRange.low && frequency <= currentRange.high);

      if (inRange) {
        // Key is in range
        element.style.pointerEvents = "auto";
        element.style.opacity = "1.0";
        element.classList.remove("out-of-range");
        keyData.inRange = true;
      } else {
        // Key is out of range - apply grayed styling
        const disabledFill = keyData.type === "white" ? "#e0e0e0" : "#999";
        element.setAttribute("fill", disabledFill);
        element.setAttribute("data-original-fill", disabledFill);
        element.style.pointerEvents = "none";
        element.style.opacity = "0.4";
        element.classList.add("out-of-range");
        keyData.inRange = false;
        outOfRangeCount++;
      }
    });

    // Range styling complete - renderParts() will handle expression colors when needed

    if (window.Logger) {
      window.Logger.log(
        `Range styling complete. ${outOfRangeCount} keys out of range`,
        "info",
      );
    }
  }

  /**
   * Handle piano key click
   * @param {Element} keyElement - Clicked key element
   * @param {Event} event - Click event
   * @private
   */
  handleKeyClick(keyElement, event) {
    const frequency = parseFloat(keyElement.dataset.frequency);
    const noteName = keyElement.dataset.noteName;

    if (!frequency || !noteName) return;

    // This method is kept for backward compatibility but is not used
    // PianoExpressionHandler handles all mouse interactions
  }

  // Keyboard shortcut methods removed - will be added back later

  /**
   * Add note to current chord
   * @param {number} frequency - Frequency to add
   */
  addNoteToChord(frequency) {
    const currentChord = [...(programState.currentProgram.chord.frequencies || [])];

    if (!currentChord.includes(frequency)) {
      currentChord.push(frequency);
      currentChord.sort((a, b) => a - b);
      this.setChord(currentChord);
    }
  }

  /**
   * Remove note from current chord
   * @param {number} frequency - Frequency to remove
   */
  removeNoteFromChord(frequency) {
    const currentChord = programState.currentProgram.chord.frequencies || [];
    const newChord = currentChord.filter((f) => f !== frequency);
    this.setChord(newChord);
  }

  /**
   * Toggle note in chord
   * @param {number} frequency - Frequency to toggle
   */
  toggleNoteInChord(frequency) {
    const currentChord = programState.currentProgram.chord.frequencies || [];

    if (currentChord.includes(frequency)) {
      this.removeNoteFromChord(frequency);
    } else {
      this.addNoteToChord(frequency);
    }
  }

  /**
   * Set the current chord
   * @param {Array} frequencies - Array of frequencies
   */
  setChord(frequencies) {
    // Update ProgramState
    programState.updateChord(frequencies);
    
    // Update appState for compatibility
    // Don't set directly - PartManager handles chord state

    // Emit chord change event
    this.eventBus.emit("piano:chordChanged", {
      chord: frequencies,
      noteNames: frequencies.map((f) => this.frequencyToNoteName(f)),
      timestamp: Date.now(),
    });

    if (window.Logger) {
      const noteNames = frequencies.map((f) => this.frequencyToNoteName(f));
      window.Logger.log(`Chord set: [${noteNames.join(", ")}]`, "expressions");
    }
  }

  /**
   * Clear the current chord
   */
  clearChord() {
    // Clear internal chord tracking
    this.setChord([]);

    // Clear all expression markings from the piano roll
    if (this.expressionHandler) {
      this.expressionHandler.clearAll();
    }

    // IMPORTANT: Clear parts in PartManager (new paradigm)
    const partManager = window.partManager || window.appState?.get('partManager');
    if (partManager) {
      partManager.clearPart();
    }

    if (window.Logger) {
      window.Logger.log("Chord and parts cleared", "expressions");
    }
  }

  /**
   * Update key visual states based on current chord
   * @param {Array} chord - Array of frequencies in current chord
   * @private
   */
  updateKeyStates(chord = []) {
    this.keys.forEach((keyData, frequency) => {
      const isActive = chord.includes(frequency);
      keyData.isActive = isActive;

      // Visual state is now managed by PianoExpressionHandler
      // Don't update colors here
    });
  }

  /**
   * Highlight a key temporarily
   * @param {number} frequency - Frequency of key to highlight
   * @param {boolean} highlight - Whether to highlight or remove highlight
   * @private
   */
  highlightKey(frequency, highlight) {
    const keyData = this.keys.get(frequency);
    if (!keyData) return;

    // Color handling is now managed by PianoExpressionHandler
    // Only handle the CSS class for keyboard interaction
    if (highlight) {
      keyData.element.classList.add("keyboard-pressed");
    } else {
      keyData.element.classList.remove("keyboard-pressed");
    }
  }

  /**
   * Check if a key is currently active in the chord
   * @param {number} frequency - Frequency to check
   * @returns {boolean} Whether the key is active
   * @private
   */
  isKeyActive(frequency) {
    const currentChord = programState.currentProgram.chord.frequencies || [];
    return currentChord.includes(frequency);
  }

  /**
   * Convert MIDI note number to frequency
   * @param {number} midi - MIDI note number
   * @returns {number} Frequency in Hz
   * @private
   */
  midiToFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /**
   * Convert MIDI note number to note name
   * @param {number} midi - MIDI note number
   * @returns {string} Note name with octave
   * @private
   */
  midiToNoteName(midi) {
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
    const octave = Math.floor(midi / 12) - 1;
    const noteIndex = midi % 12;
    return `${noteNames[noteIndex]}${octave}`;
  }

  /**
   * Convert frequency to note name
   * @param {number} frequency - Frequency in Hz
   * @returns {string} Note name with octave
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
   * Get current chord information
   * @returns {Object} Chord information
   */
  getChordInfo() {
    const chord = this.appState.getNested('performance.currentProgram.chord.frequencies') || [];
    return {
      frequencies: chord,
      noteNames: chord.map((f) => this.frequencyToNoteName(f)),
      count: chord.length,
    };
  }

  /**
   * Set keyboard range
   * @param {number} startNote - Starting MIDI note
   * @param {number} endNote - Ending MIDI note
   */
  setKeyboardRange(startNote, endNote) {
    this.startNote = startNote;
    this.endNote = endNote;
    this.octaves = Math.ceil((endNote - startNote) / 12);

    if (this.isInitialized) {
      this.createPianoKeyboard();
    }
  }

  /**
   * Add event listener for piano events
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    return this.eventBus.on(`piano:${event}`, handler);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  off(event, handler) {
    this.eventBus.off(`piano:${event}`, handler);
  }

  /**
   * Render piano visuals from Parts array (single source of truth)
   * @param {Part[]|Object[]} parts - Array of Part objects
   */
  renderParts(parts) {
    if (window.Logger) {
      window.Logger.log(`PianoKeyboard rendering ${parts?.length || 0} parts`, "lifecycle");
    }
    
    // Clear current state
    this.currentChord.clear();
    
    if (this.expressionHandler) {
      // Clear expression handler state
      this.expressionHandler.expressions.clear();
      this.expressionHandler.relatedNotes.clear();
      this.expressionHandler.chordNotes.clear();
      
      // Process each part
      if (parts && Array.isArray(parts)) {
        parts.forEach(part => {
          const frequency = part.frequency;
          const expression = part.expression || { type: 'none' };
          
          // Add to chord state
          this.currentChord.add(frequency);
          this.expressionHandler.chordNotes.add(frequency);
          
          // Add expression if not 'none'
          if (expression.type !== 'none') {
            const noteName = this.frequencyToNoteName(frequency);
            this.expressionHandler.expressions.set(noteName, expression);
            
            // Handle related notes for trill
            if (expression.type === 'trill' && expression.toNote) {
              const toFreq = this.noteNameToFrequency(expression.toNote);
              if (toFreq > 0) {
                this.expressionHandler.relatedNotes.set(frequency, toFreq);
              }
            }
          }
        });
      }
      
      // Update all visuals in one call
      this.expressionHandler.updateKeyVisuals();
      this.expressionHandler.updateChordDisplay();
      this.expressionHandler.render(); // Update canvas overlays
    }
  }

  /**
   * Convert note name to frequency (helper for renderParts)
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
   * Cleanup and destroy
   */
  destroy() {
    this.keys.clear();
    // Destroy expression handler
    if (this.expressionHandler) {
      this.expressionHandler.destroy();
      this.expressionHandler = null;
    }

    this.isInitialized = false;

    if (window.Logger) {
      window.Logger.log("PianoKeyboard destroyed", "lifecycle");
    }
  }
}

// Create global instance
export const pianoKeyboard = new PianoKeyboard();

// Make available globally for backward compatibility
if (typeof window !== "undefined") {
  window.PianoKeyboard = PianoKeyboard;
  window.pianoKeyboard = pianoKeyboard;
}
