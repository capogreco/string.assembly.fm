/**
 * PianoKeyboard Module - Pure Parts viewer/editor
 * Displays Parts as colored keys and handles user interactions
 */

import { eventBus } from "../core/EventBus.js";
import { appState } from "../state/AppState.js";
import { Logger } from "../core/Logger.js";
import { Part } from "../audio/Part.js";
import { pianoGestureDetector } from "../piano/PianoGestureDetector.js";

// Expression colors matching the rest of the system
const EXPRESSION_COLORS = {
  none: "#9b59b6",    // Purple
  vibrato: "#e74c3c", // Red
  tremolo: "#f1c40f", // Yellow
  trill: "#3498db",   // Blue
};

export class PianoKeyboard {
  constructor() {
    this.eventBus = eventBus;
    this.appState = appState;
    this.isInitialized = false;
    
    // Piano configuration
    this.startNote = 48; // C3
    this.endNote = 84;   // C6
    this.octaves = 3;
    
    // DOM elements
    this.container = null;
    this.svg = null;
    this.keys = new Map(); // frequency -> key element
    
    // Gesture tracking
    this.gestureDetector = pianoGestureDetector;
    this.dragStart = null;
    this.currentDragElement = null;
    
    // Visual feedback during drag
    this.feedbackElement = null;
  }

  /**
   * Initialize the piano keyboard
   */
  initialize() {
    if (this.isInitialized) {
      Logger.log("PianoKeyboard already initialized", "lifecycle");
      return;
    }

    // Find container
    this.container = document.getElementById("piano-container");
    if (!this.container) {
      Logger.log("Piano container not found", "error");
      return;
    }

    // Get body type select
    this.bodyTypeSelect = document.getElementById("bodyType");
    if (this.bodyTypeSelect) {
      this.initializeBodyType();
    }

    // Create piano keyboard with indicator zones
    this.createPianoKeyboard();

    // Set up event listeners
    this.setupEventListeners();

    // Register with app state
    this.appState.set("pianoKeyboard", this);

    this.isInitialized = true;
    Logger.log("PianoKeyboard initialized", "lifecycle");
  }

  /**
   * Create the piano keyboard with indicator zones
   */
  createPianoKeyboard() {
    // Clear existing content
    this.container.innerHTML = "";
    this.keys.clear();

    // Create grid container
    const gridContainer = document.createElement("div");
    gridContainer.style.display = "grid";
    gridContainer.style.gridTemplateRows = "40px 200px 40px";
    gridContainer.style.width = "100%";
    gridContainer.style.position = "relative";
    
    // Create top indicator zone
    this.topIndicators = document.createElement("div");
    this.topIndicators.style.position = "relative";
    this.topIndicators.style.width = "100%";
    this.topIndicators.style.height = "40px";
    gridContainer.appendChild(this.topIndicators);

    // Create piano SVG container
    const pianoContainer = document.createElement("div");
    pianoContainer.style.position = "relative";
    pianoContainer.style.width = "100%";
    pianoContainer.style.height = "200px";
    
    // Create SVG for piano keys
    const width = this.container.clientWidth || 800;
    const height = 200;
    
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.setAttribute("width", width);
    this.svg.setAttribute("height", height);
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.svg.style.display = "block";
    this.svg.style.userSelect = "none";
    pianoContainer.appendChild(this.svg);
    gridContainer.appendChild(pianoContainer);
    
    // Create bottom indicator zone
    this.bottomIndicators = document.createElement("div");
    this.bottomIndicators.style.position = "relative";
    this.bottomIndicators.style.width = "100%";
    this.bottomIndicators.style.height = "40px";
    gridContainer.appendChild(this.bottomIndicators);

    // Calculate key dimensions
    const whiteKeyCount = this.countWhiteKeys(this.startNote, this.endNote);
    const whiteKeyWidth = width / whiteKeyCount;
    const blackKeyWidth = whiteKeyWidth * 0.6;
    const blackKeyHeight = height * 0.65;

    // Create white keys first
    let whiteKeyIndex = 0;
    const keyData = [];
    
    for (let midi = this.startNote; midi <= this.endNote; midi++) {
      const noteName = this.midiToNoteName(midi);
      const isBlack = noteName.includes("#");
      const frequency = this.midiToFrequency(midi);

      if (!isBlack) {
        // White key
        const x = whiteKeyIndex * whiteKeyWidth;
        const rect = this.createKey(x, 0, whiteKeyWidth - 1, height, "white", noteName, frequency, false);
        this.svg.appendChild(rect);
        this.keys.set(frequency, rect);
        keyData.push({ midi, whiteKeyIndex });
        whiteKeyIndex++;
      }
    }

    // Create black keys on top
    keyData.forEach((data, index) => {
      const nextMidi = data.midi + 1;
      if (nextMidi <= this.endNote) {
        const noteName = this.midiToNoteName(nextMidi);
        if (noteName.includes("#")) {
          const frequency = this.midiToFrequency(nextMidi);
          // Position between this white key and the next
          const x = (data.whiteKeyIndex + 1) * whiteKeyWidth - blackKeyWidth / 2;
          const rect = this.createKey(x, 0, blackKeyWidth, blackKeyHeight, "#333", noteName, frequency, true);
          this.svg.appendChild(rect);
          this.keys.set(frequency, rect);
        }
      }
    });

    // Append grid container to main container
    this.container.appendChild(gridContainer);
    
    // Store key width for indicator positioning
    this.whiteKeyWidth = whiteKeyWidth;

    // Create feedback element for drag visualization
    this.feedbackElement = document.createElement("div");
    this.feedbackElement.style.position = "absolute";
    this.feedbackElement.style.pointerEvents = "none";
    this.feedbackElement.style.display = "none";
    this.feedbackElement.style.padding = "4px 8px";
    this.feedbackElement.style.background = "rgba(0, 0, 0, 0.8)";
    this.feedbackElement.style.color = "white";
    this.feedbackElement.style.borderRadius = "4px";
    this.feedbackElement.style.fontSize = "12px";
    this.feedbackElement.style.zIndex = "1000";
    document.body.appendChild(this.feedbackElement);
  }

  /**
   * Create a piano key element
   */
  createKey(x, y, width, height, fill, noteName, frequency, isBlack) {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", width);
    rect.setAttribute("height", height);
    rect.setAttribute("fill", fill);
    rect.setAttribute("stroke", "#000");
    rect.setAttribute("stroke-width", "1");
    rect.setAttribute("data-note-name", noteName);
    rect.setAttribute("data-frequency", frequency);
    rect.setAttribute("data-original-fill", fill);
    
    if (isBlack) {
      rect.classList.add("black-key");
    } else {
      rect.classList.add("white-key");
    }

    // Style
    rect.style.cursor = "pointer";
    rect.style.transition = "fill 0.1s ease";

    return rect;
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Mouse events
    this.svg.addEventListener("mousedown", this.handleMouseDown.bind(this));
    document.addEventListener("mousemove", this.handleMouseMove.bind(this));
    document.addEventListener("mouseup", this.handleMouseUp.bind(this));

    // Touch events
    this.svg.addEventListener("touchstart", this.handleTouchStart.bind(this));
    document.addEventListener("touchmove", this.handleTouchMove.bind(this));
    document.addEventListener("touchend", this.handleTouchEnd.bind(this));

    // Clear all button
    const clearAllBtn = document.getElementById("clear-all-btn");
    if (clearAllBtn) {
      clearAllBtn.addEventListener("click", () => {
        this.clearAllParts();
      });
    }
  }

  /**
   * Handle mouse down
   */
  handleMouseDown(event) {
    event.preventDefault();
    const key = event.target;
    if (!key.hasAttribute("data-frequency")) return;

    const frequency = parseFloat(key.getAttribute("data-frequency"));
    const noteName = key.getAttribute("data-note-name");
    
    this.dragStart = {
      x: event.clientX,
      y: event.clientY,
      frequency: frequency,
      noteName: noteName,
      element: key
    };

    // Visual feedback
    key.style.filter = "brightness(0.8)";
    this.currentDragElement = key;
  }

  /**
   * Handle mouse move
   */
  handleMouseMove(event) {
    if (!this.dragStart) return;

    const currentPoint = { x: event.clientX, y: event.clientY };
    const feedback = this.gestureDetector.getDragFeedback(this.dragStart, currentPoint);

    // Show feedback
    if (feedback.type !== 'none') {
      this.feedbackElement.textContent = feedback.message;
      this.feedbackElement.style.display = "block";
      this.feedbackElement.style.left = event.clientX + 10 + "px";
      this.feedbackElement.style.top = event.clientY - 30 + "px";
      
      // Color feedback based on expression type
      if (feedback.type in EXPRESSION_COLORS) {
        this.feedbackElement.style.background = EXPRESSION_COLORS[feedback.type] + "CC";
      }
    }

    // For trill, highlight target key
    if (feedback.type === 'trill') {
      const targetElement = document.elementFromPoint(event.clientX, event.clientY);
      if (targetElement && targetElement.hasAttribute("data-note-name")) {
        // Clear previous highlight
        this.svg.querySelectorAll(".trill-target").forEach(el => {
          el.classList.remove("trill-target");
          el.style.filter = "";
        });
        
        // Highlight new target
        if (targetElement !== this.dragStart.element) {
          targetElement.classList.add("trill-target");
          targetElement.style.filter = "brightness(0.9)";
        }
      }
    }
  }

  /**
   * Handle mouse up
   */
  handleMouseUp(event) {
    if (!this.dragStart) return;

    const endPoint = {
      x: event.clientX,
      y: event.clientY,
      element: document.elementFromPoint(event.clientX, event.clientY)
    };

    const gesture = this.gestureDetector.detectGesture(this.dragStart, endPoint);

    if (!gesture) {
      // Just a click - toggle part
      this.togglePart(this.dragStart.frequency);
    } else {
      // Drag - add/update part with expression
      this.setPartExpression(this.dragStart.frequency, gesture);
    }

    // Clean up
    if (this.currentDragElement) {
      this.currentDragElement.style.filter = "";
    }
    
    // Clear trill highlights
    this.svg.querySelectorAll(".trill-target").forEach(el => {
      el.classList.remove("trill-target");
      el.style.filter = "";
    });

    this.feedbackElement.style.display = "none";
    this.dragStart = null;
    this.currentDragElement = null;
  }

  /**
   * Handle touch events (delegate to mouse handlers)
   */
  handleTouchStart(event) {
    const touch = event.touches[0];
    const mouseEvent = new MouseEvent("mousedown", {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    this.handleMouseDown(mouseEvent);
  }

  handleTouchMove(event) {
    const touch = event.touches[0];
    const mouseEvent = new MouseEvent("mousemove", {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    this.handleMouseMove(mouseEvent);
  }

  handleTouchEnd(event) {
    const touch = event.changedTouches[0];
    const mouseEvent = new MouseEvent("mouseup", {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    this.handleMouseUp(mouseEvent);
  }

  /**
   * Toggle a part (add/remove)
   */
  togglePart(frequency) {
    const partManager = this.appState.get("partManager");
    if (!partManager) return;

    const parts = partManager.getParts();
    const existing = parts.find(p => Math.abs(p.frequency - frequency) < 0.1);

    if (existing) {
      // Remove part
      this.eventBus.emit("part:removed", { partId: existing.id });
    } else {
      // Add part with no expression
      const part = new Part(frequency, { type: "none" });
      this.eventBus.emit("part:added", { 
        part: part,
        note: this.frequencyToNoteName(frequency)
      });
    }
  }

  /**
   * Set part expression
   */
  setPartExpression(frequency, expression) {
    const partManager = this.appState.get("partManager");
    if (!partManager) return;

    const parts = partManager.getParts();
    const existing = parts.find(p => Math.abs(p.frequency - frequency) < 0.1);

    if (existing) {
      // Update existing part
      this.eventBus.emit("part:updated", {
        partId: existing.id,
        updates: { expression: expression }
      });
    } else {
      // Create new part with expression
      const part = new Part(frequency, expression);
      this.eventBus.emit("part:added", {
        part: part,
        note: this.frequencyToNoteName(frequency)
      });
    }
  }

  /**
   * Clear all parts
   */
  clearAllParts() {
    const partManager = this.appState.get("partManager");
    if (!partManager) return;

    const parts = partManager.getParts();
    
    // Remove all parts
    parts.forEach(part => {
      this.eventBus.emit("part:removed", { partId: part.id });
    });

    Logger.log("All parts cleared", "lifecycle");
  }

  /**
   * Render parts (display current state)
   */
  renderParts(parts) {
    Logger.log(`PianoKeyboard rendering ${parts?.length || 0} parts`, "lifecycle");

    // First, reset all keys to their original colors
    this.keys.forEach((keyElement) => {
      const originalFill = keyElement.getAttribute("data-original-fill");
      keyElement.setAttribute("fill", originalFill);
    });
    
    // Clear all indicators
    if (this.topIndicators) this.topIndicators.innerHTML = "";
    if (this.bottomIndicators) this.bottomIndicators.innerHTML = "";

    // Color keys based on parts
    if (parts && Array.isArray(parts)) {
      parts.forEach(part => {
        let keyElement = this.keys.get(part.frequency);
        if (!keyElement) {
          // Try to find by approximation
          for (const [freq, elem] of this.keys) {
            if (Math.abs(freq - part.frequency) < 0.1) {
              keyElement = elem;
              break;
            }
          }
        }

        if (keyElement) {
          const color = EXPRESSION_COLORS[part.expression?.type || "none"];
          keyElement.setAttribute("fill", color);
          
          // Add expression indicator
          this.addExpressionIndicator(keyElement, part);
          
          Logger.log(`Set key ${part.frequency}Hz to color ${color} (${part.expression?.type})`, "piano");
        } else {
          Logger.log(`Could not find key element for frequency ${part.frequency}Hz`, "warn");
        }
      });
    }

    // Update range styling
    this.updateKeyRangeStyles();
  }

  /**
   * Update key range styles based on body type
   */
  updateKeyRangeStyles() {
    const bodyType = this.bodyTypeSelect?.value || "mando-guitar";
    const instrument = this.getInstrumentRange(bodyType);

    this.keys.forEach((keyElement, frequency) => {
      const midi = this.frequencyToMidi(frequency);
      
      if (midi < instrument.low || midi > instrument.high) {
        // Out of range - gray out
        keyElement.classList.add("out-of-range");
        keyElement.style.opacity = "0.3";
      } else {
        // In range
        keyElement.classList.remove("out-of-range");
        keyElement.style.opacity = "1";
      }
    });
  }

  /**
   * Initialize body type from DOM
   */
  initializeBodyType() {
    const currentBodyType = this.bodyTypeSelect.value;
    this.appState.set("bodyType", currentBodyType);

    // Listen for changes
    this.bodyTypeSelect.addEventListener("change", (e) => {
      const newBodyType = e.target.value;
      this.appState.set("bodyType", newBodyType);
      this.updateKeyRangeStyles();
    });
  }

  /**
   * Get instrument range
   */
  getInstrumentRange(bodyType) {
    // These should be MIDI note numbers
    // Violin: G3 (55) to A7 (103)
    // Viola: C3 (48) to G6 (91) 
    // Cello: C2 (36) to C6 (76)
    // Bass: E1 (28) to G4 (67)
    const ranges = {
      "0": { name: "Violin", low: 55, high: 103 },      // G3 to A7
      "1": { name: "Viola", low: 48, high: 91 },        // C3 to G6
      "2": { name: "Cello", low: 36, high: 76 },        // C2 to C6
      "3": { name: "Bass", low: 28, high: 67 },         // E1 to G4
      "4": { name: "Mando-Guitar", low: 55, high: 81 }, // G3 to A5
      "5": { name: "Octave Mando", low: 43, high: 81 }  // G2 to A5
    };
    return ranges[bodyType] || ranges["4"];
  }

  /**
   * Utility methods
   */
  countWhiteKeys(startMidi, endMidi) {
    let count = 0;
    for (let midi = startMidi; midi <= endMidi; midi++) {
      const noteName = this.midiToNoteName(midi);
      if (!noteName.includes("#")) count++;
    }
    return count;
  }

  midiToFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  frequencyToMidi(frequency) {
    return Math.round(69 + 12 * Math.log2(frequency / 440));
  }

  midiToNoteName(midi) {
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const octave = Math.floor(midi / 12) - 1;
    const noteIndex = midi % 12;
    return `${noteNames[noteIndex]}${octave}`;
  }

  frequencyToNoteName(frequency) {
    const midi = this.frequencyToMidi(frequency);
    return this.midiToNoteName(midi);
  }

  /**
   * Add visual expression indicator to a key
   */
  addExpressionIndicator(keyElement, part) {
    if (!part.expression || part.expression.type === 'none') return;
    
    const x = parseFloat(keyElement.getAttribute('x'));
    const width = parseFloat(keyElement.getAttribute('width'));
    const keyMidX = x + width / 2;
    
    switch (part.expression.type) {
      case 'vibrato':
        // Add indicator above the key
        const vibratoDiv = document.createElement('div');
        vibratoDiv.style.position = 'absolute';
        vibratoDiv.style.left = `${keyMidX - 15}px`;
        vibratoDiv.style.top = '10px';
        vibratoDiv.style.width = '30px';
        vibratoDiv.style.height = '20px';
        vibratoDiv.style.pointerEvents = 'none';
        
        // Create wavy line using CSS
        vibratoDiv.style.borderBottom = `3px solid ${EXPRESSION_COLORS.vibrato}`;
        vibratoDiv.style.borderRadius = '50%';
        vibratoDiv.style.transform = 'rotate(-5deg)';
        
        // Add animation
        vibratoDiv.style.animation = 'vibrato-wave 0.5s ease-in-out infinite alternate';
        
        this.topIndicators.appendChild(vibratoDiv);
        
        // Add CSS animation if not already present
        if (!document.getElementById('piano-animations')) {
          const style = document.createElement('style');
          style.id = 'piano-animations';
          style.textContent = `
            @keyframes vibrato-wave {
              from { transform: rotate(-5deg) translateY(0); }
              to { transform: rotate(5deg) translateY(-3px); }
            }
          `;
          document.head.appendChild(style);
        }
        break;
        
      case 'tremolo':
        // Add indicators below the key
        const tremoloDiv = document.createElement('div');
        tremoloDiv.style.position = 'absolute';
        tremoloDiv.style.left = `${keyMidX - 15}px`;
        tremoloDiv.style.top = '10px';
        tremoloDiv.style.width = '30px';
        tremoloDiv.style.height = '20px';
        tremoloDiv.style.display = 'flex';
        tremoloDiv.style.justifyContent = 'space-around';
        tremoloDiv.style.alignItems = 'center';
        tremoloDiv.style.pointerEvents = 'none';
        
        // Create three vertical lines
        for (let i = 0; i < 3; i++) {
          const line = document.createElement('div');
          line.style.width = '2px';
          line.style.height = '15px';
          line.style.backgroundColor = EXPRESSION_COLORS.tremolo;
          line.style.animation = `tremolo-pulse ${0.3 + i * 0.1}s ease-in-out infinite`;
          tremoloDiv.appendChild(line);
        }
        
        this.bottomIndicators.appendChild(tremoloDiv);
        
        // Add CSS animation if not already present
        if (!document.querySelector('#piano-animations')?.textContent.includes('tremolo-pulse')) {
          const style = document.getElementById('piano-animations') || document.createElement('style');
          style.id = 'piano-animations';
          style.textContent += `
            @keyframes tremolo-pulse {
              0%, 100% { opacity: 0.3; transform: scaleY(0.7); }
              50% { opacity: 1; transform: scaleY(1); }
            }
          `;
          if (!document.getElementById('piano-animations')) {
            document.head.appendChild(style);
          }
        }
        break;
        
      case 'trill':
        // Add arrow in the top zone pointing to target
        if (part.expression.targetNote) {
          const targetFreq = this.noteNameToFrequency(part.expression.targetNote);
          let targetElement = this.keys.get(targetFreq);
          if (!targetElement) {
            // Find by approximation
            for (const [freq, elem] of this.keys) {
              if (Math.abs(freq - targetFreq) < 0.1) {
                targetElement = elem;
                break;
              }
            }
          }
          
          if (targetElement) {
            const targetX = parseFloat(targetElement.getAttribute('x'));
            const targetWidth = parseFloat(targetElement.getAttribute('width'));
            const targetMidX = targetX + targetWidth / 2;
            
            // Create SVG for the arrow
            const arrowSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            arrowSvg.style.position = 'absolute';
            arrowSvg.style.left = `${Math.min(keyMidX, targetMidX) - 10}px`;
            arrowSvg.style.top = '5px';
            arrowSvg.style.width = `${Math.abs(targetMidX - keyMidX) + 20}px`;
            arrowSvg.style.height = '30px';
            arrowSvg.style.pointerEvents = 'none';
            
            const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
            const startX = keyMidX < targetMidX ? 10 : parseFloat(arrowSvg.style.width) - 10;
            const endX = keyMidX < targetMidX ? parseFloat(arrowSvg.style.width) - 10 : 10;
            
            arrow.setAttribute("d", 
              `M${startX},20 Q${(startX + endX) / 2},5 ${endX},20 l${keyMidX < targetMidX ? '-5,-3 m5,3 l-5,3' : '5,-3 m-5,3 l5,3'}`
            );
            arrow.setAttribute("stroke", EXPRESSION_COLORS.trill);
            arrow.setAttribute("stroke-width", "2");
            arrow.setAttribute("fill", "none");
            
            arrowSvg.appendChild(arrow);
            this.topIndicators.appendChild(arrowSvg);
          }
        }
        break;
    }
  }

  /**
   * Convert note name to frequency
   */
  noteNameToFrequency(noteName) {
    // Parse note name like "C4", "C#4", etc.
    const match = noteName.match(/^([A-G])(#?)(\d+)$/);
    if (!match) return 0;
    
    const [, note, sharp, octaveStr] = match;
    const octave = parseInt(octaveStr);
    
    // Convert to MIDI note number
    const noteMap = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let midi = (octave + 1) * 12 + noteMap[note];
    if (sharp) midi += 1;
    
    // Convert to frequency
    return this.midiToFrequency(midi);
  }

  /**
   * Cleanup
   */
  destroy() {
    // Remove event listeners
    if (this.svg) {
      this.svg.removeEventListener("mousedown", this.handleMouseDown);
    }
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("mouseup", this.handleMouseUp);

    // Remove feedback element
    if (this.feedbackElement && this.feedbackElement.parentNode) {
      this.feedbackElement.parentNode.removeChild(this.feedbackElement);
    }

    this.keys.clear();
    this.isInitialized = false;

    Logger.log("PianoKeyboard destroyed", "lifecycle");
  }
}

// Create global instance
export const pianoKeyboard = new PianoKeyboard();

// Make available globally for backward compatibility
if (typeof globalThis !== "undefined") {
  globalThis.PianoKeyboard = PianoKeyboard;
  globalThis.pianoKeyboard = pianoKeyboard;
}