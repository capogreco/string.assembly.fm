/**
 * PianoKeyboard Module for String Assembly FM
 * Handles piano keyboard interactions for chord input
 */

import { eventBus } from '../core/EventBus.js';
import { appState } from '../state/AppState.js';
import { Config } from '../core/Config.js';

export class PianoKeyboard {
  constructor() {
    this.eventBus = eventBus;
    this.appState = appState;
    this.pianoElement = null;
    this.keys = new Map();
    this.isInitialized = false;
    this.keyWidth = 20;
    this.whiteKeyHeight = 60;
    this.blackKeyHeight = 40;
    this.startNote = 21; // A0
    this.endNote = 108; // C8
    this.octaves = 7;
  }

  /**
   * Initialize the piano keyboard
   */
  initialize() {
    if (this.isInitialized) {
      if (window.Logger) {
        window.Logger.log('PianoKeyboard already initialized', 'lifecycle');
      }
      return;
    }

    if (window.Logger) {
      window.Logger.log('Initializing PianoKeyboard...', 'lifecycle');
    }

    // Find piano element
    this.pianoElement = document.getElementById('piano');
    if (!this.pianoElement) {
      if (window.Logger) {
        window.Logger.log('Piano element not found', 'error');
      }
      return;
    }

    // Create piano keyboard
    this.createPianoKeyboard();

    // Set up event listeners
    this.setupEventListeners();

    // Set up state subscriptions
    this.setupStateSubscriptions();

    this.isInitialized = true;

    if (window.Logger) {
      window.Logger.log('PianoKeyboard initialized', 'lifecycle');
    }
  }

  /**
   * Create the piano keyboard SVG
   * @private
   */
  createPianoKeyboard() {
    // Calculate dimensions
    const whiteKeysPerOctave = 7;
    const totalWhiteKeys = this.octaves * whiteKeysPerOctave;
    const totalWidth = totalWhiteKeys * this.keyWidth;

    // Set SVG dimensions
    this.pianoElement.setAttribute('width', totalWidth);
    this.pianoElement.setAttribute('height', this.whiteKeyHeight);
    this.pianoElement.setAttribute('viewBox', `0 0 ${totalWidth} ${this.whiteKeyHeight}`);

    // Clear existing content
    this.pianoElement.innerHTML = '';

    // Create keys
    this.createWhiteKeys();
    this.createBlackKeys();

    if (window.Logger) {
      window.Logger.log(`Created piano keyboard with ${this.keys.size} keys`, 'lifecycle');
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
      whiteKeyPattern.forEach(noteOffset => {
        const midiNote = this.startNote + (octave * 12) + noteOffset;

        // Stop if we exceed our range
        if (midiNote > this.endNote) return;

        const frequency = this.midiToFrequency(midiNote);
        const noteName = this.midiToNoteName(midiNote);

        const x = whiteKeyIndex * this.keyWidth;

        // Create white key rectangle
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', 0);
        rect.setAttribute('width', this.keyWidth - 1);
        rect.setAttribute('height', this.whiteKeyHeight);
        rect.setAttribute('fill', 'white');
        rect.setAttribute('stroke', '#ddd');
        rect.setAttribute('stroke-width', '1');
        rect.setAttribute('class', 'piano-key white-key');
        rect.setAttribute('data-note', midiNote);
        rect.setAttribute('data-frequency', frequency);
        rect.setAttribute('data-note-name', noteName);

        // Add hover effects
        rect.addEventListener('mouseenter', () => {
          rect.setAttribute('fill', '#f0f0f0');
        });

        rect.addEventListener('mouseleave', () => {
          const isActive = this.isKeyActive(frequency);
          rect.setAttribute('fill', isActive ? '#4CAF50' : 'white');
        });

        this.pianoElement.appendChild(rect);

        this.keys.set(frequency, {
          element: rect,
          midiNote,
          frequency,
          noteName,
          type: 'white',
          isActive: false
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

        const midiNote = this.startNote + (octave * 12) + noteOffset;

        // Stop if we exceed our range
        if (midiNote > this.endNote) return;

        const frequency = this.midiToFrequency(midiNote);
        const noteName = this.midiToNoteName(midiNote);

        // Calculate position between white keys
        const x = whiteKeyIndex * this.keyWidth + this.keyWidth * 0.7;

        // Create black key rectangle
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', 0);
        rect.setAttribute('width', this.keyWidth * 0.6);
        rect.setAttribute('height', this.blackKeyHeight);
        rect.setAttribute('fill', '#333');
        rect.setAttribute('stroke', '#000');
        rect.setAttribute('stroke-width', '1');
        rect.setAttribute('class', 'piano-key black-key');
        rect.setAttribute('data-note', midiNote);
        rect.setAttribute('data-frequency', frequency);
        rect.setAttribute('data-note-name', noteName);

        // Add hover effects
        rect.addEventListener('mouseenter', () => {
          rect.setAttribute('fill', '#555');
        });

        rect.addEventListener('mouseleave', () => {
          const isActive = this.isKeyActive(frequency);
          rect.setAttribute('fill', isActive ? '#2E7D32' : '#333');
        });

        this.pianoElement.appendChild(rect);

        this.keys.set(frequency, {
          element: rect,
          midiNote,
          frequency,
          noteName,
          type: 'black',
          isActive: false
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

    // Click events for key selection
    this.pianoElement.addEventListener('click', (e) => {
      const key = e.target.closest('.piano-key');
      if (key) {
        this.handleKeyClick(key, e);
      }
    });

    // Keyboard events
    document.addEventListener('keydown', (e) => {
      this.handleKeyboardDown(e);
    });

    document.addEventListener('keyup', (e) => {
      this.handleKeyboardUp(e);
    });

    // Clear chord button
    const clearButton = document.getElementById('clear-chord');
    if (clearButton) {
      clearButton.addEventListener('click', () => {
        this.clearChord();
      });
    }
  }

  /**
   * Set up state subscriptions
   * @private
   */
  setupStateSubscriptions() {
    // Subscribe to chord changes
    this.appState.subscribe('currentChord', (newChord) => {
      this.updateKeyStates(newChord);
    });
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

    const currentChord = this.appState.get('currentChord') || [];

    if (event.ctrlKey || event.metaKey) {
      // Ctrl+click: toggle note in chord
      this.toggleNoteInChord(frequency);
    } else if (event.shiftKey) {
      // Shift+click: add note to chord
      this.addNoteToChord(frequency);
    } else {
      // Normal click: replace chord with single note
      this.setChord([frequency]);
    }

    // Emit key click event
    this.eventBus.emit('piano:keyClicked', {
      frequency,
      noteName,
      chord: this.appState.get('currentChord'),
      timestamp: Date.now()
    });

    if (window.Logger) {
      window.Logger.log(`Piano key clicked: ${noteName} (${frequency.toFixed(1)}Hz)`, 'expressions');
    }
  }

  /**
   * Handle keyboard input (computer keyboard)
   * @param {KeyboardEvent} event - Keyboard event
   * @private
   */
  handleKeyboardDown(event) {
    // Map computer keyboard to piano keys
    const keyMap = {
      'KeyZ': 261.63, // C4
      'KeyS': 277.18, // C#4
      'KeyX': 293.66, // D4
      'KeyD': 311.13, // D#4
      'KeyC': 329.63, // E4
      'KeyV': 349.23, // F4
      'KeyG': 369.99, // F#4
      'KeyB': 392.00, // G4
      'KeyH': 415.30, // G#4
      'KeyN': 440.00, // A4
      'KeyJ': 466.16, // A#4
      'KeyM': 493.88, // B4
      'Comma': 523.25, // C5
      'KeyL': 554.37, // C#5
      'Period': 587.33, // D5
      'Semicolon': 622.25, // D#5
      'Slash': 659.25, // E5
    };

    const frequency = keyMap[event.code];
    if (frequency && !event.repeat) {
      this.addNoteToChord(frequency);

      // Visual feedback
      this.highlightKey(frequency, true);
    }
  }

  /**
   * Handle keyboard release
   * @param {KeyboardEvent} event - Keyboard event
   * @private
   */
  handleKeyboardUp(event) {
    // Remove visual highlight (if implementing temporary highlights)
    const keyMap = {
      'KeyZ': 261.63, 'KeyS': 277.18, 'KeyX': 293.66, 'KeyD': 311.13,
      'KeyC': 329.63, 'KeyV': 349.23, 'KeyG': 369.99, 'KeyB': 392.00,
      'KeyH': 415.30, 'KeyN': 440.00, 'KeyJ': 466.16, 'KeyM': 493.88,
      'Comma': 523.25, 'KeyL': 554.37, 'Period': 587.33, 'Semicolon': 622.25,
      'Slash': 659.25
    };

    const frequency = keyMap[event.code];
    if (frequency) {
      this.highlightKey(frequency, false);
    }
  }

  /**
   * Add note to current chord
   * @param {number} frequency - Frequency to add
   */
  addNoteToChord(frequency) {
    const currentChord = [...(this.appState.get('currentChord') || [])];

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
    const currentChord = this.appState.get('currentChord') || [];
    const newChord = currentChord.filter(f => f !== frequency);
    this.setChord(newChord);
  }

  /**
   * Toggle note in chord
   * @param {number} frequency - Frequency to toggle
   */
  toggleNoteInChord(frequency) {
    const currentChord = this.appState.get('currentChord') || [];

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
    this.appState.set('currentChord', frequencies);

    // Emit chord change event
    this.eventBus.emit('piano:chordChanged', {
      chord: frequencies,
      noteNames: frequencies.map(f => this.frequencyToNoteName(f)),
      timestamp: Date.now()
    });

    if (window.Logger) {
      const noteNames = frequencies.map(f => this.frequencyToNoteName(f));
      window.Logger.log(`Chord set: [${noteNames.join(', ')}]`, 'expressions');
    }
  }

  /**
   * Clear the current chord
   */
  clearChord() {
    this.setChord([]);

    if (window.Logger) {
      window.Logger.log('Chord cleared', 'expressions');
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

      // Update visual state
      if (keyData.type === 'white') {
        keyData.element.setAttribute('fill', isActive ? '#4CAF50' : 'white');
      } else {
        keyData.element.setAttribute('fill', isActive ? '#2E7D32' : '#333');
      }
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

    if (highlight) {
      keyData.element.classList.add('keyboard-pressed');
      if (keyData.type === 'white') {
        keyData.element.setAttribute('fill', '#FFC107');
      } else {
        keyData.element.setAttribute('fill', '#FF9800');
      }
    } else {
      keyData.element.classList.remove('keyboard-pressed');
      // Restore normal state
      const isActive = keyData.isActive;
      if (keyData.type === 'white') {
        keyData.element.setAttribute('fill', isActive ? '#4CAF50' : 'white');
      } else {
        keyData.element.setAttribute('fill', isActive ? '#2E7D32' : '#333');
      }
    }
  }

  /**
   * Check if a key is currently active in the chord
   * @param {number} frequency - Frequency to check
   * @returns {boolean} Whether the key is active
   * @private
   */
  isKeyActive(frequency) {
    const currentChord = this.appState.get('currentChord') || [];
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
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
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

    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    return `${noteNames[noteIndex]}${octave}`;
  }

  /**
   * Get current chord information
   * @returns {Object} Chord information
   */
  getChordInfo() {
    const chord = this.appState.get('currentChord') || [];
    return {
      frequencies: chord,
      noteNames: chord.map(f => this.frequencyToNoteName(f)),
      count: chord.length
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
   * Cleanup and destroy
   */
  destroy() {
    this.keys.clear();
    this.isInitialized = false;

    if (window.Logger) {
      window.Logger.log('PianoKeyboard destroyed', 'lifecycle');
    }
  }
}

// Create global instance
export const pianoKeyboard = new PianoKeyboard();

// Make available globally for backward compatibility
if (typeof window !== 'undefined') {
  window.PianoKeyboard = PianoKeyboard;
  window.pianoKeyboard = pianoKeyboard;
}
