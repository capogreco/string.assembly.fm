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
    
    // Piano configuration - will be set based on instrument
    this.startNote = 48; // Default C3
    this.endNote = 84;   // Default C6
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
    } else {
      // Use default range if no body type selector
      this.updatePianoRange("0"); // Default to violin
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
    
    // Calculate key dimensions first to determine appropriate height
    const whiteKeyCount = this.countWhiteKeys(this.startNote, this.endNote);
    const containerWidth = this.container.clientWidth || 800;
    
    // Calculate white key width
    let whiteKeyWidth = containerWidth / whiteKeyCount;
    
    // Maintain reasonable aspect ratio (keys should be about 6:1 height:width)
    const idealAspectRatio = 6;
    let height = Math.min(200, whiteKeyWidth * idealAspectRatio);
    height = Math.max(120, height); // But not too small
    
    // If keys would be too wide, constrain width and center the piano
    const maxKeyWidth = 35;
    if (whiteKeyWidth > maxKeyWidth) {
      whiteKeyWidth = maxKeyWidth;
      const pianoWidth = whiteKeyWidth * whiteKeyCount;
      const leftMargin = (containerWidth - pianoWidth) / 2;
      pianoContainer.style.paddingLeft = `${leftMargin}px`;
      pianoContainer.style.paddingRight = `${leftMargin}px`;
    }
    
    const width = whiteKeyWidth * whiteKeyCount;
    
    // Update grid container height
    gridContainer.style.gridTemplateRows = `40px ${height}px 40px`;
    pianoContainer.style.height = `${height}px`;
    
    // Create SVG for piano keys
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
          
          // If this is a trill, also highlight the target note
          if (part.expression?.type === 'trill' && part.expression.targetNote) {
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
              // Use a paler shade of blue for the target
              targetElement.setAttribute("fill", "#87CEEB"); // Sky blue
            }
          }
          
          Logger.log(`Set key ${part.frequency}Hz to color ${color} (${part.expression?.type})`, "piano");
        } else {
          Logger.log(`Could not find key element for frequency ${part.frequency}Hz`, "warn");
        }
      });
    }

  }


  /**
   * Initialize body type from DOM
   */
  initializeBodyType() {
    const currentBodyType = this.bodyTypeSelect.value;
    this.appState.set("bodyType", currentBodyType);
    
    // Set initial piano range
    this.updatePianoRange(currentBodyType);

    // Listen for changes
    this.bodyTypeSelect.addEventListener("change", (e) => {
      const newBodyType = e.target.value;
      this.appState.set("bodyType", newBodyType);
      
      // Update piano range and recreate keyboard
      this.updatePianoRange(newBodyType);
      this.createPianoKeyboard();
      
      // Re-render current parts
      const partManager = this.appState.get("partManager");
      if (partManager) {
        const parts = partManager.getParts();
        this.renderParts(parts);
      }
    });
  }
  
  /**
   * Update piano range based on instrument
   */
  updatePianoRange(bodyType) {
    const range = this.getInstrumentRange(bodyType);
    
    // Add a bit of padding to show context
    this.startNote = Math.max(0, range.low - 2);
    this.endNote = Math.min(127, range.high + 2);
    
    // Round to octave boundaries for visual clarity
    // Find the C below the start note
    while (this.startNote % 12 !== 0 && this.startNote > 0) {
      this.startNote--;
    }
    // Find the B above the end note
    while (this.endNote % 12 !== 11 && this.endNote < 127) {
      this.endNote++;
    }
    
    // Special handling for violin to start from G
    if (bodyType === "0") { // Violin
      // Start from G3 (MIDI 55) instead of C3
      this.startNote = 55; // G3
      // To get roughly 5 octaves like the others, go up to around B7
      this.endNote = 107;  // B7
    }
    
    Logger.log(`Piano range updated for ${range.name}: MIDI ${this.startNote}-${this.endNote}`, "piano");
  }

  /**
   * Get instrument range
   */
  getInstrumentRange(bodyType) {
    // MIDI note numbers based on http://hyperphysics.phy-astr.gsu.edu/hbase/Music/orchins.html
    // Note: Using practical playing ranges, not theoretical extremes
    const ranges = {
      "0": { name: "Violin", low: 55, high: 91 },      // G3 to G6 (36 notes)
      "1": { name: "Viola", low: 48, high: 84 },       // C3 to C6 (36 notes)
      "2": { name: "Cello", low: 36, high: 72 }        // C2 to C5 (36 notes)
    };
    return ranges[bodyType] || ranges["0"];
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
        vibratoDiv.style.left = `${x + 2}px`; // Align with key left edge plus small padding
        vibratoDiv.style.top = '10px';
        vibratoDiv.style.width = `${width - 4}px`; // Fit within key width with padding
        vibratoDiv.style.height = '25px';
        vibratoDiv.style.pointerEvents = 'none';
        vibratoDiv.style.textAlign = 'center';
        
        // Create sine wave SVG with depth indicator
        const depth = Math.round((part.expression.depth || 0.01) * 100);
        const amplitude = 2 + (depth / 30); // Scale amplitude based on depth
        const waveWidth = Math.max(width - 4, 20); // Ensure minimum width
        
        vibratoDiv.innerHTML = `
          <svg width="${waveWidth}" height="12" style="display: block; margin: 0 auto;">
            <path d="M 0 6 Q ${waveWidth * 0.25} ${6 - amplitude} ${waveWidth * 0.5} 6 T ${waveWidth} 6" 
                  stroke="${EXPRESSION_COLORS.vibrato}" 
                  stroke-width="2" 
                  fill="none"/>
          </svg>
          <div style="
            font-size: 8px;
            color: ${EXPRESSION_COLORS.vibrato};
            font-weight: bold;
            margin-top: 1px;
          ">${depth}%</div>
        `;
        
        this.topIndicators.appendChild(vibratoDiv);
        break;
        
      case 'tremolo':
        // Add indicators below the key
        const tremoloDiv = document.createElement('div');
        tremoloDiv.style.position = 'absolute';
        tremoloDiv.style.left = `${x + 2}px`; // Align with key left edge plus small padding
        tremoloDiv.style.top = '5px';
        tremoloDiv.style.width = `${width - 4}px`; // Fit within key width with padding
        tremoloDiv.style.height = '30px';
        tremoloDiv.style.display = 'flex';
        tremoloDiv.style.flexDirection = 'column';
        tremoloDiv.style.alignItems = 'center';
        tremoloDiv.style.pointerEvents = 'none';
        
        const articulation = Math.round((part.expression.articulation || 0.8) * 100);
        const dashLength = 2 + (articulation / 60); // Scale dash length based on articulation
        const gapLength = 1.5 + ((100 - articulation) / 60); // Smaller gaps for higher articulation
        const lineWidth = Math.max(width - 4, 20); // Ensure minimum width
        
        // Create perforated line SVG
        const lineContainer = document.createElement('div');
        lineContainer.innerHTML = `
          <svg width="${lineWidth}" height="12" style="display: block; margin: 0 auto;">
            <line x1="0" y1="6" x2="${lineWidth}" y2="6" 
                  stroke="${EXPRESSION_COLORS.tremolo}" 
                  stroke-width="2"
                  stroke-dasharray="${dashLength} ${gapLength}"
                  opacity="${0.7 + (articulation / 300)}"/>
          </svg>
          <div style="
            font-size: 8px;
            color: ${EXPRESSION_COLORS.tremolo};
            font-weight: bold;
            margin-top: 1px;
          ">${articulation}%</div>
        `;
        
        tremoloDiv.appendChild(lineContainer);
        this.bottomIndicators.appendChild(tremoloDiv);
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