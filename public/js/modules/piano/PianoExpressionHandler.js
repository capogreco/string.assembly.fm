/**
 * PianoExpressionHandler Module for String Assembly FM
 * Handles gesture detection and expression visualization for the piano roll
 * Adapted from SVGInteractiveExpression
 */

import { Part } from '../audio/Part.js';

export class PianoExpressionHandler {
  constructor(pianoKeyboard) {
    this.pianoKeyboard = pianoKeyboard;
    this.svg = pianoKeyboard.pianoElement;

    // Expression state
    this.expressions = new Map(); // note -> expression data
    this.chordNotes = new Set(); // notes that are part of the current chord
    this.relatedNotes = new Map(); // note -> {relatedTo: note, type: 'trill-target'}

    // Gesture tracking
    this.isDragging = false;
    this.dragStartNote = null;
    this.dragStartFrequency = null;
    this.dragStartPos = null;
    this.currentDragPos = null;
    this.dragStartElement = null;
    this.currentHoverElement = null; // Track element under cursor for trill preview

    // Visual indicators (SVG elements stored per note and type)
    // e.g., this.indicators.get(noteName) = { trill: pathElement, vibrato: textElement }
    this.indicators = new Map();

    // Gesture thresholds
    this.DRAG_THRESHOLD = 10; // pixels before drag is recognized
    this.VIBRATO_THRESHOLD = -30; // pixels up for vibrato
    this.TREMOLO_THRESHOLD = 30; // pixels down for tremolo
    this.HORIZONTAL_THRESHOLD = 15; // pixels horizontal to prioritize trill

    // Expression colors
    this.EXPRESSION_COLORS = {
      none: "#9b59b6", // Purple for chord notes without expression
      trill: "#3498db", // Blue
      vibrato: "#e74c3c", // Red
      tremolo: "#f39c12", // Orange
    };

    // Lighter shades for related notes (trill targets, etc)
    this.EXPRESSION_COLORS_LIGHT = {
      none: "#c39bd3",
      trill: "#85c1e2",
      vibrato: "#f1948a",
      tremolo: "#f8c471",
    };

    this.isInitialized = false;

    // Canvas overlay for visual feedback
    this.overlay = null;
    this.overlayCtx = null;
    this.canvasPadding = 40; // Extra space for indicators outside piano

    this.initialize();
  }

  /**
   * Calculate expression depth from drag distance
   */
  calculateExpressionDepth(dy, threshold) {
    return Math.min(1.0, Math.abs(dy - threshold) / 50);
  }

  /**
   * Calculate musical interval between two notes in semitones
   */
  calculateInterval(note1, note2) {
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

    const parseNote = (noteStr) => {
      const match = noteStr.match(/^([A-G]#?)(\d)$/);
      if (!match) return null;
      const noteName = match[1];
      const octave = parseInt(match[2]);
      const noteIndex = noteOrder.indexOf(noteName);
      return octave * 12 + noteIndex;
    };

    const midi1 = parseNote(note1);
    const midi2 = parseNote(note2);

    if (midi1 === null || midi2 === null) return 0;
    return Math.abs(midi2 - midi1);
  }

  /**
   * Initialize the expression handler
   */
  initialize() {
    if (this.isInitialized) return;

    // Create canvas overlay for visual feedback
    this.createOverlay();

    // Set up event listeners
    this.setupEventListeners();

    // Sync with current chord state
    this.syncWithAppState();

    this.isInitialized = true;

    if (window.Logger) {
      window.Logger.log("PianoExpressionHandler initialized", "lifecycle");
    }
  }

  /**
   * Create canvas overlay for visual feedback
   */
  createOverlay() {
    if (!this.svg || !this.svg.parentElement) return;

    // Clean up any existing expression canvases in the parent
    const parent = this.svg.parentElement;
    const existingCanvases = parent.querySelectorAll(
      "canvas[data-expression-canvas]",
    );
    existingCanvases.forEach((canvas) => {
      canvas.remove();
    });

    const svgRect = this.svg.getBoundingClientRect();

    this.overlay = document.createElement("canvas");
    this.overlay.style.position = "absolute";
    this.overlay.style.pointerEvents = "none";
    this.overlay.style.zIndex = "1000";
    this.overlay.setAttribute("data-expression-canvas", "piano-expressions");

    // Size with padding for indicators
    this.overlay.width = svgRect.width + this.canvasPadding * 2;
    this.overlay.height = svgRect.height + this.canvasPadding * 2;

    // Position canvas over SVG with padding
    parent.style.position = "relative";
    this.overlay.style.left = `-${this.canvasPadding}px`;
    this.overlay.style.top = `-${this.canvasPadding}px`;

    parent.appendChild(this.overlay);
    this.overlayCtx = this.overlay.getContext("2d");

    if (window.Logger) {
      window.Logger.log("Canvas overlay created for piano expressions", "ui");
    }
  }

  /**
   * Render visual indicators on canvas overlay
   */
  render() {
    if (!this.overlay || !this.overlayCtx) return;

    // Clear canvas
    this.overlayCtx.clearRect(0, 0, this.overlay.width, this.overlay.height);

    // Draw expression indicators
    this.drawExpressionIndicators();

    // Draw current drag feedback
    if (this.isDragging) {
      this.drawDragFeedback();
    }
  }

  /**
   * Draw expression indicators for all notes
   */
  drawExpressionIndicators() {
    if (!this.overlayCtx) return;

    for (const [note, expression] of this.expressions) {
      const keyElement = this.findKeyElement(note);
      if (!keyElement) continue;

      switch (expression.type) {
        case "vibrato":
          this.drawVibratoIndicator(keyElement, expression);
          break;
        case "tremolo":
          this.drawTremoloIndicator(keyElement, expression);
          break;
        case "trill":
          this.drawTrillConnection(keyElement, expression);
          break;
      }
    }
  }

  /**
   * Draw vibrato indicator above key
   */
  drawVibratoIndicator(keyElement, expression) {
    const ctx = this.overlayCtx;
    const svgRect = this.svg.getBoundingClientRect();
    const keyRect = keyElement.getBoundingClientRect();

    const x =
      keyRect.left - svgRect.left + keyRect.width / 2 + this.canvasPadding;
    const y = keyRect.top - svgRect.top + this.canvasPadding;

    ctx.save();
    ctx.fillStyle = this.EXPRESSION_COLORS.vibrato;
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";

    const depthPercent = Math.round(expression.depth * 100);
    ctx.fillText(`${depthPercent}%`, x, y - 10);
    ctx.restore();
  }

  /**
   * Draw tremolo indicator below key
   */
  drawTremoloIndicator(keyElement, expression) {
    const ctx = this.overlayCtx;
    const svgRect = this.svg.getBoundingClientRect();
    const keyRect = keyElement.getBoundingClientRect();

    const x =
      keyRect.left - svgRect.left + keyRect.width / 2 + this.canvasPadding;
    const y = keyRect.top - svgRect.top + keyRect.height + this.canvasPadding;

    ctx.save();
    ctx.fillStyle = this.EXPRESSION_COLORS.tremolo;
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";

    const depthPercent = Math.round(expression.depth * 100);
    ctx.fillText(`${depthPercent}%`, x, y + 15);
    ctx.restore();
  }

  /**
   * Draw trill connection between keys
   */
  drawTrillConnection(keyElement, expression) {
    const ctx = this.overlayCtx;
    const svgRect = this.svg.getBoundingClientRect();
    const startRect = keyElement.getBoundingClientRect();

    const targetElement = this.findKeyElement(expression.targetNote);
    if (!targetElement) return;

    const endRect = targetElement.getBoundingClientRect();

    // Convert to canvas coordinates
    const startX =
      startRect.left - svgRect.left + startRect.width / 2 + this.canvasPadding;
    const startY = startRect.top - svgRect.top + this.canvasPadding;
    const endX =
      endRect.left - svgRect.left + endRect.width / 2 + this.canvasPadding;
    const endY = endRect.top - svgRect.top + this.canvasPadding;

    ctx.save();
    ctx.strokeStyle = this.EXPRESSION_COLORS.trill;
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 3]);

    // Draw curved line
    const controlY = Math.min(startY, endY) - 30;
    const controlX = (startX + endX) / 2;

    ctx.beginPath();
    ctx.moveTo(startX, startY - 5);
    ctx.quadraticCurveTo(controlX, controlY, endX, endY - 5);
    ctx.stroke();

    // Draw arrow head
    ctx.setLineDash([]);
    const angle = Math.atan2(endY - controlY, endX - controlX);
    const arrowSize = 10;

    ctx.beginPath();
    ctx.moveTo(endX, endY - 5);
    ctx.lineTo(
      endX - arrowSize * Math.cos(angle - Math.PI / 6),
      endY - 5 - arrowSize * Math.sin(angle - Math.PI / 6),
    );
    ctx.moveTo(endX, endY - 5);
    ctx.lineTo(
      endX - arrowSize * Math.cos(angle + Math.PI / 6),
      endY - 5 - arrowSize * Math.sin(angle + Math.PI / 6),
    );
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draw real-time drag feedback
   */
  drawDragFeedback() {
    if (!this.isDragging || !this.overlayCtx || !this.dragStartElement) return;

    const ctx = this.overlayCtx;
    const svgRect = this.svg.getBoundingClientRect();
    const keyRect = this.dragStartElement.getBoundingClientRect();

    const dx = this.currentDragPos.x - this.dragStartPos.x;
    const dy = this.currentDragPos.y - this.dragStartPos.y;

    // Draw depth indicator for vibrato/tremolo
    if (
      this.potentialExpressionType === "vibrato" ||
      this.potentialExpressionType === "tremolo"
    ) {
      const threshold =
        this.potentialExpressionType === "vibrato"
          ? this.VIBRATO_THRESHOLD
          : this.TREMOLO_THRESHOLD;
      const depth = this.calculateExpressionDepth(dy, threshold);
      const depthPercent = Math.round(depth * 100);

      const x =
        keyRect.left - svgRect.left + keyRect.width / 2 + this.canvasPadding;
      const y =
        this.potentialExpressionType === "vibrato"
          ? keyRect.top - svgRect.top + this.canvasPadding - 10
          : keyRect.top -
            svgRect.top +
            keyRect.height +
            this.canvasPadding +
            15;

      ctx.save();
      ctx.fillStyle = this.EXPRESSION_COLORS[this.potentialExpressionType];
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${depthPercent}%`, x, y);
      ctx.restore();
    }

    // Draw drag line for trill
    if (this.potentialExpressionType === "trill") {
      const startX =
        keyRect.left - svgRect.left + keyRect.width / 2 + this.canvasPadding;
      const startY =
        keyRect.top - svgRect.top + keyRect.height / 2 + this.canvasPadding;

      // Convert mouse position to canvas coordinates
      const svgBounds = this.svg.getBoundingClientRect();
      const endX = this.currentDragPos.x - svgBounds.left + this.canvasPadding;
      const endY = this.currentDragPos.y - svgBounds.top + this.canvasPadding;

      // Check if there's a valid target key at current position
      const targetKey = this.getKeyFromPosition(
        this.currentDragPos.x,
        this.currentDragPos.y,
      );
      const hasValidTarget = targetKey && targetKey.note !== this.dragStartNote;

      ctx.save();
      // Use different color/style for invalid trill areas
      ctx.strokeStyle = hasValidTarget
        ? this.EXPRESSION_COLORS.trill
        : "#ff6b6b";
      ctx.lineWidth = 2;
      ctx.setLineDash(hasValidTarget ? [3, 2] : [1, 4]);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Show "invalid" indicator for out-of-range areas
      if (!hasValidTarget) {
        ctx.fillStyle = "#ff6b6b";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("✗", endX, endY);
      }

      ctx.restore();
    }
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

    // Listen for chord changes from PianoKeyboard
    this.pianoKeyboard.eventBus.on("piano:chordChanged", (data) => {
      this.handleChordChange(data);
    });
  }

  /**
   * Handle mouse down event
   */
  handleMouseDown(e) {
    const keyData = this.getKeyFromEvent(e);
    if (!keyData) return;

    this.startDrag(keyData, e.clientX, e.clientY);
    e.preventDefault();
  }

  /**
   * Handle touch start event
   */
  handleTouchStart(e) {
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    const keyData = this.getKeyFromEvent(touch);
    if (!keyData) return;

    this.startDrag(keyData, touch.clientX, touch.clientY);
    e.preventDefault();
  }

  /**
   * Get key data from event
   */
  getKeyFromEvent(e) {
    const target = e.target;

    if (window.Logger) {
      window.Logger.log(
        `DEBUG getKeyFromEvent: target=${target.tagName}, has data-note-name=${target.hasAttribute("data-note-name")}`,
        "expressions",
      );
    }

    // Check if it's a piano key
    if (target.tagName === "rect" && target.hasAttribute("data-note-name")) {
      // Check if the key is out-of-range (disabled)
      if (
        target.classList.contains("out-of-range") ||
        target.style.pointerEvents === "none"
      ) {
        return null; // Don't process clicks/drags on disabled keys
      }

      const noteName = target.getAttribute("data-note-name");
      const frequency = parseFloat(target.getAttribute("data-frequency"));

      if (window.Logger) {
        window.Logger.log(
          `DEBUG getKeyFromEvent: noteName=${noteName}, frequency=${frequency}`,
          "expressions",
        );
      }

      return {
        element: target,
        note: noteName,
        frequency: frequency,
      };
    }

    if (window.Logger) {
      window.Logger.log(
        `DEBUG getKeyFromEvent: Not a valid piano key, returning null`,
        "expressions",
      );
    }

    return null;
  }

  /**
   * Start drag gesture
   */
  startDrag(keyData, x, y) {
    // keyData = { element, note (name), frequency }

    // Instrument range check
    const instrumentRange = this.pianoKeyboard.getCurrentInstrumentRange();
    if (
      !instrumentRange ||
      keyData.frequency < instrumentRange.low ||
      keyData.frequency > instrumentRange.high
    ) {
      if (window.Logger) {
        const currentBodyType = this.pianoKeyboard.appState.get("bodyType");
        const bodyTypeName =
          currentBodyType !== undefined &&
          this.pianoKeyboard.getInstrumentRanges()[currentBodyType]
            ? this.pianoKeyboard.getInstrumentRanges()[currentBodyType].name
            : "None";
        window.Logger.log(
          `Note ${keyData.note} (${keyData.frequency.toFixed(
            2,
          )}Hz) is out of range for current instrument: ${bodyTypeName}. Interaction ignored.`,
          "info",
        );
      }
      return; // Do not start drag or any interaction
    }

    this.isDragging = true;
    this.dragStartNote = keyData.note;
    this.dragStartFrequency = keyData.frequency;
    this.dragStartElement = keyData.element;
    this.dragStartPos = { x, y };
    this.currentDragPos = { x, y };

    // Initial visual feedback for drag start (brightness)
    this.dragStartElement.style.filter = "brightness(1.2)";
    this.potentialExpressionType = null; // Reset potential expression
  }

  /**
   * Handle mouse/touch move
   */
  handleMouseMove(e) {
    if (!this.isDragging) return;
    this.updateDrag(e.clientX, e.clientY);
    e.preventDefault(); // Prevent text selection, etc.
  }

  handleTouchMove(e) {
    if (!this.isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    this.updateDrag(touch.clientX, touch.clientY);
    e.preventDefault();
  }

  /**
   * Update drag position and provide real-time feedback
   */
  updateDrag(x, y) {
    if (!this.isDragging) return;

    this.currentDragPos = { x, y };

    const dx = this.currentDragPos.x - this.dragStartPos.x;
    const dy = this.currentDragPos.y - this.dragStartPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    let newPotentialType = null;

    if (distance > this.DRAG_THRESHOLD) {
      // Determine potential expression type
      if (Math.abs(dx) > this.HORIZONTAL_THRESHOLD) {
        newPotentialType = "trill";
      } else if (dy < this.VIBRATO_THRESHOLD) {
        newPotentialType = "vibrato";
      } else if (dy > this.TREMOLO_THRESHOLD) {
        newPotentialType = "tremolo";
      } else {
        // Still a drag, but not a specific expression gesture yet
        newPotentialType = "drag";
      }

      if (this.potentialExpressionType !== newPotentialType) {
        this.potentialExpressionType = newPotentialType;

        // Update source note color based on potential expression
        let color = this.EXPRESSION_COLORS.none;
        if (this.potentialExpressionType === "trill") {
          color = this.EXPRESSION_COLORS.trill;
        } else if (this.potentialExpressionType === "vibrato") {
          color = this.EXPRESSION_COLORS.vibrato;
        } else if (this.potentialExpressionType === "tremolo") {
          color = this.EXPRESSION_COLORS.tremolo;
        }
        this.dragStartElement.setAttribute("fill", color);
      }
    } else {
      // Not a drag yet (or dragged back under threshold)
      if (this.potentialExpressionType) {
        this.potentialExpressionType = null;
        const originalFill =
          this.dragStartElement.getAttribute("data-original-fill") ||
          (this.dragStartElement.classList.contains("white-key")
            ? "white"
            : "#333");
        this.dragStartElement.setAttribute("fill", originalFill);
      }
    }

    // Handle trill target highlighting
    if (this.potentialExpressionType === "trill") {
      const targetKey = this.getKeyFromPosition(x, y);

      // Clear previous hover highlighting
      if (
        this.currentHoverElement &&
        this.currentHoverElement !== this.dragStartElement
      ) {
        this.clearHoverHighlight(this.currentHoverElement);
      }

      // Highlight new target if it's different from source
      if (targetKey && targetKey.note !== this.dragStartNote) {
        this.highlightTrillTarget(targetKey.element);
        this.currentHoverElement = targetKey.element;
      } else {
        this.currentHoverElement = null;
      }
    } else {
      // Clear any trill target highlighting for non-trill gestures
      if (this.currentHoverElement) {
        this.clearHoverHighlight(this.currentHoverElement);
        this.currentHoverElement = null;
      }
    }

    // Render visual feedback
    this.render();
  }

  /**
   * Handle mouse/touch up
   */
  handleMouseUp(e) {
    if (!this.isDragging) return;
    this.endDrag(e.clientX, e.clientY);
  }

  handleTouchEnd(e) {
    if (!this.isDragging) return;

    // Use last known position for touch end
    this.endDrag(this.currentDragPos.x, this.currentDragPos.y);
  }

  /**
   * End drag gesture and determine expression
   */
  endDrag(x, y) {
    const dx = x - this.dragStartPos.x;
    const dy = y - this.dragStartPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Determine expression type based on drag
    let expression = null;

    if (distance < this.DRAG_THRESHOLD) {
      // Simple click - toggle note in chord
      if (this.chordNotes.has(this.dragStartNote)) {
        this.removePartFromChord(this.dragStartNote);
      } else {
        // Create a part with no expression
        const part = new Part(this.dragStartFrequency, { type: "none" });
        this.createPartWithExpression(this.dragStartNote, part);
      }
    } else if (Math.abs(dx) > this.HORIZONTAL_THRESHOLD) {
      // Horizontal drag - trill
      const targetKey = this.getKeyFromPosition(x, y);
      if (targetKey && targetKey.note !== this.dragStartNote) {
        expression = {
          type: "trill",
          targetNote: targetKey.note,  // Keep for UI management
          targetFreq: targetKey.frequency,
          interval: this.calculateInterval(this.dragStartNote, targetKey.note),
          speed: 8, // Base speed, modified later by harmonic ratios
          articulation: 0.7, // Default articulation for trill
        };
        // Create a complete part and emit it
        const part = new Part(this.dragStartFrequency, expression);
        this.createPartWithExpression(this.dragStartNote, part);
      }
    } else if (dy < this.VIBRATO_THRESHOLD) {
      // Upward drag - vibrato
      expression = {
        type: "vibrato",
        depth: this.calculateExpressionDepth(dy, this.VIBRATO_THRESHOLD),
        rate: 4, // Base rate, modified later by harmonic ratios
      };
      // Create a complete part and emit it
      const part = new Part(this.dragStartFrequency, expression);
      this.createPartWithExpression(this.dragStartNote, part);
    } else if (dy > this.TREMOLO_THRESHOLD) {
      // Downward drag - tremolo
      const tremoloArticulation = document.getElementById('tremoloArticulation');
      expression = {
        type: "tremolo",
        depth: this.calculateExpressionDepth(dy, this.TREMOLO_THRESHOLD),
        speed: 10, // Base speed, modified later by harmonic ratios
        articulation: tremoloArticulation ? parseFloat(tremoloArticulation.value) : 0.8,
      };
      // Create a complete part and emit it
      const part = new Part(this.dragStartFrequency, expression);
      this.createPartWithExpression(this.dragStartNote, part);
    }

    // Set expression if determined
    if (expression) {
      // If it was a click that added a note, 'expression' is {type: 'none'}
      // If it was a drag, 'expression' is {type: 'trill/vibrato/tremolo', ...}
      this.setExpression(this.dragStartNote, expression);
    } else if (
      distance < this.DRAG_THRESHOLD &&
      !this.chordNotes.has(this.dragStartNote)
    ) {
      // If it was a click that REMOVED a note, expression is null.
      // Ensure the visual is restored to default if it wasn't handled by removeFromChord's updateKeyVisuals call.
      // This path (click that removed) should have already updated visuals via removeFromChord -> pianoKeyboard.remove -> event -> handleChordChange -> updateKeyVisuals
      // So, direct update here might be redundant unless there's a timing issue.
      // For safety, ensure its visual is default if no expression was set and it's not in chordNotes.
      this.updateKeyVisual(this.dragStartElement, this.dragStartNote);
    }

    // Clean up
    this.isDragging = false;
    if (this.dragStartElement) {
      // Ensure dragStartElement exists before trying to style it
      this.dragStartElement.style.filter = ""; // Remove brightness
    }

    // Clear trill target highlighting
    if (this.currentHoverElement) {
      this.clearHoverHighlight(this.currentHoverElement);
      this.currentHoverElement = null;
    }

    this.potentialExpressionType = null; // Reset potential type
    this.dragStartNote = null;
    this.dragStartFrequency = null;
    this.dragStartElement = null;

    // Clear drag feedback by re-rendering
    this.render();
  }

  /**
   * Get key from screen position
   */
  getKeyFromPosition(x, y) {
    const point = this.svg.createSVGPoint();
    point.x = x;
    point.y = y;

    // Convert to SVG coordinates
    const svgPoint = point.matrixTransform(this.svg.getScreenCTM().inverse());

    // Find key at position - check black keys first (they're on top)
    const allKeys = this.svg.querySelectorAll("rect[data-note-name]");
    const blackKeys = Array.from(allKeys).filter(
      (key) =>
        key.classList.contains("black-key") ||
        key.getAttribute("fill") === "#333" ||
        key.getAttribute("data-note-name").includes("#"),
    );
    const whiteKeys = Array.from(allKeys).filter(
      (key) => !blackKeys.includes(key),
    );

    // Check black keys first (higher z-index)
    for (const key of blackKeys) {
      const rect = key.getBBox();
      if (
        svgPoint.x >= rect.x &&
        svgPoint.x <= rect.x + rect.width &&
        svgPoint.y >= rect.y &&
        svgPoint.y <= rect.y + rect.height
      ) {
        // Check if key is in valid instrument range
        if (key.classList.contains("out-of-range")) {
          continue; // Skip out-of-range keys
        }
        return {
          element: key,
          note: key.getAttribute("data-note-name"),
          frequency: parseFloat(key.getAttribute("data-frequency")),
        };
      }
    }

    // Then check white keys
    for (const key of whiteKeys) {
      const rect = key.getBBox();
      if (
        svgPoint.x >= rect.x &&
        svgPoint.x <= rect.x + rect.width &&
        svgPoint.y >= rect.y &&
        svgPoint.y <= rect.y + rect.height
      ) {
        // Check if key is in valid instrument range
        if (key.classList.contains("out-of-range")) {
          continue; // Skip out-of-range keys
        }
        return {
          element: key,
          note: key.getAttribute("data-note-name"),
          frequency: parseFloat(key.getAttribute("data-frequency")),
        };
      }
    }

    return null;
  }

  /**
   * Add note to chord
   */
  addToChord(note, frequency) {
    if (!this.chordNotes.has(note)) {
      this.chordNotes.add(note);

      // Update PianoKeyboard's chord
      const currentChord =
        this.pianoKeyboard.appState.getNested('performance.currentProgram.chord.frequencies') || [];
      if (!currentChord.includes(frequency)) {
        this.pianoKeyboard.addNoteToChord(frequency);
      }
    }

    // Update chord display
    this.updateChordDisplay();
  }

  /**
   * Create a part with expression and add to chord
   * @param {string} note - Note name for UI tracking
   * @param {Part} part - Complete part object
   */
  createPartWithExpression(note, part) {
    if (!this.chordNotes.has(note)) {
      this.chordNotes.add(note);
      
      // Store expression locally for UI
      this.expressions.set(note, part.expression);
      
      // Store part ID for tracking
      if (!this.partIdsByNote) {
        this.partIdsByNote = new Map();
      }
      this.partIdsByNote.set(note, part.id);
      
      // Emit part creation event
      this.pianoKeyboard.eventBus.emit("part:added", {
        part: part,
        note: note, // For UI reference
        timestamp: Date.now(),
      });
    }

    // Update chord display and visuals
    this.updateChordDisplay();
    this.updateKeyVisual(this.findKeyElement(note), note);
  }
  
  /**
   * Remove a part from the chord
   * @param {string} note - Note name
   */
  removePartFromChord(note) {
    if (!this.chordNotes.has(note)) return;
    
    this.chordNotes.delete(note);
    
    // Get part ID
    const partId = this.partIdsByNote?.get(note);
    if (partId) {
      this.partIdsByNote.delete(note);
      
      // Emit part removal event
      this.pianoKeyboard.eventBus.emit("part:removed", {
        partId: partId,
        note: note, // For UI reference
        timestamp: Date.now(),
      });
    }
    
    // Clean up expression for this note
    const oldExpression = this.expressions.get(note);
    if (oldExpression) {
      if (oldExpression.type === "trill" && oldExpression.targetNote) {
        // Remove trill target from chord and related notes
        this.chordNotes.delete(oldExpression.targetNote);
        this.relatedNotes.delete(oldExpression.targetNote);
        // Update target note visual
        this.updateKeyVisual(
          this.findKeyElement(oldExpression.targetNote),
          oldExpression.targetNote,
        );
      }
      this.expressions.delete(note);
    }
    
    // Update visuals
    this.updateChordDisplay();
    this.updateKeyVisual(this.findKeyElement(note), note);
  }

  /**
   * Remove note from chord
   */
  removeFromChord(note) {
    this.chordNotes.delete(note);

    // Clean up expression for this note
    const oldExpression = this.expressions.get(note);
    if (oldExpression) {
      if (oldExpression.type === "trill" && oldExpression.targetNote) {
        // Remove trill target from chord and related notes
        this.chordNotes.delete(oldExpression.targetNote);
        this.relatedNotes.delete(oldExpression.targetNote);
        // Update target note visual
        this.updateKeyVisual(
          this.findKeyElement(oldExpression.targetNote),
          oldExpression.targetNote,
        );
      }
      this.expressions.delete(note);
      
      // Emit event to notify PartManager that expression was removed
      if (window.eventBus) {
        window.eventBus.emit("expression:changed", {
          note: note,
          expression: null, // null indicates removal
          timestamp: Date.now(),
        });
      }
    }

    // Find frequency for this note
    const keys = this.svg.querySelectorAll("rect[data-note-name]");
    for (const key of keys) {
      if (key.getAttribute("data-note-name") === note) {
        const frequency = parseFloat(key.getAttribute("data-frequency"));
        this.pianoKeyboard.removeNoteFromChord(frequency);
        break;
      }
    }

    // Clean up any related notes that reference this note
    this.relatedNotes.forEach((relation, relatedNote) => {
      if (relation.relatedTo === note) {
        this.relatedNotes.delete(relatedNote);
        // Update visual for related note
        this.updateKeyVisual(this.findKeyElement(relatedNote), relatedNote);
      }
    });

    // Update chord display and render
    this.updateChordDisplay();
    this.render();
  }

  /**
   * Set expression for a note
   */
  setExpression(note, expression) {
    // `note` is the source note (dragStartNote)
    // `expression` is the committed expression object e.g. {type: "none"}, {type: "trill", targetNote: ...} or null if removing via click.

    if (window.Logger) {
      window.Logger.log(
        `DEBUG setExpression: note=${note}, expression=${JSON.stringify(expression)}`,
        "expressions",
      );
      // In parts paradigm, expressions live on part assignments, not in appState
    }

    const oldExpression = this.expressions.get(note);

    // Clean up old expression
    if (oldExpression) {
      if (oldExpression.type === "trill" && oldExpression.targetNote) {
        this.relatedNotes.delete(oldExpression.targetNote);
        // Update the old target note visual
        this.updateKeyVisual(
          this.findKeyElement(oldExpression.targetNote),
          oldExpression.targetNote,
        );
      }
    }

    // Update local state
    if (
      !expression ||
      expression.type === "removed" ||
      expression.type === "none"
    ) {
      this.expressions.delete(note);
    } else {
      this.expressions.set(note, expression);
    }

    // Handle new trill target notes
    if (expression && expression.type === "trill" && expression.targetNote) {
      this.relatedNotes.set(expression.targetNote, {
        relatedTo: note,
        type: "trill-target",
      });
    }

    // In the parts paradigm, we don't store expressions separately in appState
    // They live on the part assignments in PartManager
    // We just emit the event and let PartManager handle it

    // Update visuals for the affected note and any related notes
    this.updateKeyVisual(this.findKeyElement(note), note);
    if (expression && expression.type === "trill" && expression.targetNote) {
      this.updateKeyVisual(
        this.findKeyElement(expression.targetNote),
        expression.targetNote,
      );
    }
    if (
      oldExpression &&
      oldExpression.type === "trill" &&
      oldExpression.targetNote
    ) {
      // Ensure old target is also visually updated if it's no longer a target
      this.updateKeyVisual(
        this.findKeyElement(oldExpression.targetNote),
        oldExpression.targetNote,
      );
    }

    // Update chord display and render canvas overlay
    this.updateChordDisplay();
    this.render();

    // Emit expression change event
    if (window.Logger) {
      window.Logger.log(
        `DEBUG: Emitting expression:changed event for note=${note}, expression=${expression?.type || 'null'}`,
        "expressions",
      );
    }

    this.pianoKeyboard.eventBus.emit("expression:changed", {
      note,
      expression,
      timestamp: Date.now(),
    });
  }

  /**
   * Update visual state of all keys
   */
  updateKeyVisuals() {
    const keys = this.svg.querySelectorAll("rect[data-note-name]");

    keys.forEach((key) => {
      const note = key.getAttribute("data-note-name");
      this.updateKeyVisual(key, note);
    });
  }

  /**
   * Update visual state of a single key
   */
  updateKeyVisual(element, note) {
    if (!element) return;

    // Check if key is out of range - if so, don't override the graying
    if (element.classList.contains("out-of-range")) {
      return; // Preserve range graying, don't override
    }

    // Get the original default fill color
    const originalFill =
      element.getAttribute("data-original-fill") ||
      (element.classList.contains("white-key") ? "white" : "#333");

    if (this.chordNotes.has(note)) {
      // Note is in chord - use expression color
      const expression = this.expressions.get(note) || { type: "none" };
      const relation = this.relatedNotes.get(note);
      let color;
      if (relation) {
        // Use lighter shade for related notes
        const mainNote = relation.relatedTo;
        const mainExpression = this.expressions.get(mainNote) || {
          type: "none",
        };
        color = this.EXPRESSION_COLORS_LIGHT[mainExpression.type];
      } else {
        // Use full color for main notes
        color = this.EXPRESSION_COLORS[expression.type];
      }
      element.setAttribute("fill", color);
    } else {
      // Restore ACTUAL default color
      element.setAttribute("fill", originalFill);
    }
  }

  /**
   * Find key element by note name
   */
  findKeyElement(note) {
    return this.svg.querySelector(`rect[data-note-name="${note}"]`);
  }

  /**
   * Remove a specific type of visual indicator for a note.
   * @param {string} noteName - The name of the note (e.g., "C4").
   * @param {string} indicatorType - The type of indicator (e.g., "trill", "vibrato").
   * @private
   */
  removeIndicator(noteName, indicatorType) {
    const noteIndicators = this.indicators.get(noteName);
    if (noteIndicators && noteIndicators[indicatorType]) {
      noteIndicators[indicatorType].remove(); // Remove SVG element from DOM
      delete noteIndicators[indicatorType];
      if (Object.keys(noteIndicators).length === 0) {
        this.indicators.delete(noteName); // Remove entry for note if no indicators left
      }
    }
  }

  /**
   * Highlight a key as potential trill target
   */
  highlightTrillTarget(element) {
    if (!element) return;

    // Store original fill if not already stored
    if (!element.getAttribute("data-original-fill")) {
      element.setAttribute("data-original-fill", element.getAttribute("fill"));
    }

    // Set light blue color for trill target preview
    element.setAttribute("fill", this.EXPRESSION_COLORS_LIGHT.trill);
  }

  /**
   * Clear hover highlighting from element
   */
  clearHoverHighlight(element) {
    if (!element) return;

    const note = element.getAttribute("data-note-name");

    // Restore proper color based on current state
    if (this.chordNotes.has(note)) {
      // Note is in chord - restore appropriate expression color
      this.updateKeyVisual(element, note);
    } else {
      // Not in chord - restore original color
      const originalFill =
        element.getAttribute("data-original-fill") ||
        (element.classList.contains("white-key") ? "white" : "#333");
      element.setAttribute("fill", originalFill);
    }
  }

  /**
   * Update chord display with expression indicators
   */
  updateChordDisplay() {
    const chordDisplay = document.getElementById("chord-display");
    if (!chordDisplay) return;

    if (this.chordNotes.size === 0) {
      chordDisplay.textContent = "None";
      return;
    }

    // In parts paradigm, get expressions from part assignments
    const partManager = this.pianoKeyboard.appState.get("partManager");
    const expressionsFromParts = {};
    
    if (partManager && partManager.synthAssignments) {
      for (const [synthId, assignment] of partManager.synthAssignments) {
        const noteName = this.pianoKeyboard.frequencyToNoteName(assignment.frequency);
        if (assignment.expression && assignment.expression.type !== "none") {
          expressionsFromParts[noteName] = assignment.expression;
        }
      }
    }

    const chordParts = [];
    for (const note of this.chordNotes) {
      // First check parts, then fall back to local expressions
      const expression = expressionsFromParts[note] || this.expressions.get(note);
      const relation = this.relatedNotes.get(note);

      if (relation && relation.type === "trill-target") {
        // This is a trill target, don't show it separately
        continue;
      }

      if (expression) {
        switch (expression.type) {
          case "vibrato":
            const vibratoDepth = Math.round(expression.depth * 100);
            chordParts.push(`${note}v${vibratoDepth}`);
            break;
          case "tremolo":
            const tremoloDepth = Math.round(expression.depth * 100);
            chordParts.push(`${note}t${tremoloDepth}`);
            break;
          case "trill":
            chordParts.push(`${note}(→${expression.targetNote})`);
            break;
          default:
            chordParts.push(note);
        }
      } else {
        chordParts.push(note);
      }
    }

    chordDisplay.textContent = chordParts.join(" ");
  }

  /**
   * Handle chord change from PianoKeyboard
   */
  handleChordChange(data) {
    // Sync chord notes
    this.chordNotes.clear();
    if (data.noteNames) {
      data.noteNames.forEach((note) => this.chordNotes.add(note));
    }

    // Clean up expressions for removed notes
    const validNotes = new Set(data.noteNames || []);
    Array.from(this.expressions.keys()).forEach((note) => {
      if (!validNotes.has(note)) {
        this.expressions.delete(note);
        // Also remove any indicators for notes no longer in the chord
        this.removeIndicator(note, "trill");
        this.removeIndicator(note, "vibrato");
        this.removeIndicator(note, "tremolo");
      }
    });

    // Update visuals and chord display
    this.updateKeyVisuals();
    this.updateChordDisplay();
  }

  /**
   * Sync with current app state
   */
  syncWithAppState() {
    const currentChord = this.pianoKeyboard.appState.getNested('performance.currentProgram.chord.frequencies') || [];
    const noteNames = currentChord.map((freq) =>
      this.pianoKeyboard.frequencyToNoteName(freq),
    );

    // In parts paradigm, load expressions from part assignments
    const partManager = this.pianoKeyboard.appState.get("partManager");
    const savedExpressions = {};
    
    if (partManager && partManager.synthAssignments) {
      // Build expressions from part assignments
      for (const [synthId, assignment] of partManager.synthAssignments) {
        const noteName = this.pianoKeyboard.frequencyToNoteName(assignment.frequency);
        if (assignment.expression && assignment.expression.type !== "none") {
          savedExpressions[noteName] = assignment.expression;
        }
      }
    }

    // Clear current expressions and load saved ones
    this.expressions.clear();
    this.relatedNotes.clear();

    for (const [note, expression] of Object.entries(savedExpressions)) {
      if (expression && expression.type !== "none") {
        this.expressions.set(note, expression);

        // Handle trill relationships
        if (expression.type === "trill" && expression.targetNote) {
          this.relatedNotes.set(expression.targetNote, {
            relatedTo: note,
            type: "trill-target",
          });
        }
      }
    }

    this.handleChordChange({
      chord: currentChord,
      noteNames,
    });

    // Update visuals and chord display after loading state
    this.updateKeyVisuals();
    this.updateChordDisplay();
    this.render();
  }

  /**
   * Get all expressions
   */
  getAllExpressions() {
    const result = {};

    // Include all chord notes
    for (const note of this.chordNotes) {
      result[note] = this.expressions.get(note) || { type: "none" };
    }

    return result;
  }

  /**
   * Clear all expressions and chord
   */
  clearAll() {
    this.chordNotes.clear();
    this.expressions.clear();
    this.relatedNotes.clear();

    // Remove all visual indicators
    this.indicators.forEach((noteIndicators, noteName) => {
      Object.values(noteIndicators).forEach((indicatorElement) =>
        indicatorElement.remove(),
      );
    });
    this.indicators.clear();

    // Clear any hover highlighting
    if (this.currentHoverElement) {
      this.clearHoverHighlight(this.currentHoverElement);
      this.currentHoverElement = null;
    }

    // Clear canvas overlay
    if (this.overlayCtx) {
      this.overlayCtx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    }

    // Update visuals and chord display
    this.updateKeyVisuals();
    this.updateChordDisplay();

    // Update app state - create new empty object
    this.pianoKeyboard.appState.set("expressions", {});

    // Emit clear event
    this.pianoKeyboard.eventBus.emit("expression:cleared", {
      timestamp: Date.now(),
    });
  }

  /**
   * Destroy the expression handler
   */
  destroy() {
    // Remove event listeners
    this.svg.removeEventListener("mousedown", this.handleMouseDown);
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("mouseup", this.handleMouseUp);
    this.svg.removeEventListener("touchstart", this.handleTouchStart);
    document.removeEventListener("touchmove", this.handleTouchMove);
    document.removeEventListener("touchend", this.handleTouchEnd);

    this.isInitialized = false;
  }

  /**
   * Draw an SVG trill indicator (curved dashed line) between two notes.
   * @param {string} sourceNoteName - The starting note of the trill.
   * @param {string} targetNoteName - The target note of the trill.
   * @private
   */
  drawTrillIndicatorSVG(sourceNoteName, targetNoteName) {
    this.removeIndicator(sourceNoteName, "trill"); // Remove old one if any

    const sourceElement = this.findKeyElement(sourceNoteName);
    const targetElement = this.findKeyElement(targetNoteName);

    if (!sourceElement || !targetElement || !this.svg) return;

    // Use getBoundingClientRect for screen positions, then convert to SVG space if needed,
    // or use getBBox for intrinsic SVG coordinates if appending to the SVG directly.
    // For simplicity, let's use getBBox assuming the path is appended to the same SVG.
    const sourceRect = sourceElement.getBBox();
    const targetRect = targetElement.getBBox();

    // Midpoint at the top edge of the keys
    const startX = sourceRect.x + sourceRect.width / 2;
    const startY = sourceRect.y;
    const endX = targetRect.x + targetRect.width / 2;
    const endY = targetRect.y;

    // Control point for the quadratic Bezier curve (to make it arc upwards)
    const controlX = (startX + endX) / 2;
    const controlY = Math.min(startY, endY) - 20; // Arc 20px above the higher key's top

    const pathD = `M ${startX},${startY} Q ${controlX},${controlY} ${endX},${endY}`;

    const pathElement = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    pathElement.setAttribute("d", pathD);
    pathElement.setAttribute("stroke", this.EXPRESSION_COLORS.trill);
    pathElement.setAttribute("stroke-width", "2");
    pathElement.setAttribute("fill", "none");
    pathElement.setAttribute("stroke-dasharray", "4,2"); // Dashed line style
    pathElement.classList.add(
      "expression-indicator",
      `indicator-trill-${sourceNoteName.replace("#", "s")}`,
    ); // Sanitize ID

    this.svg.appendChild(pathElement); // Append to the main piano SVG

    // Store it so it can be removed later
    let noteIndicators = this.indicators.get(sourceNoteName);
    if (!noteIndicators) {
      noteIndicators = {};
      this.indicators.set(sourceNoteName, noteIndicators);
    }
    noteIndicators.trill = pathElement;
  }

  /**
   * Get all note expressions for saving
   * @returns {Object} Object with note names as keys and expression data as values
   */
  getAllExpressions() {
    const expressionsObj = {};
    this.expressions.forEach((expression, note) => {
      expressionsObj[note] = expression;
    });
    return expressionsObj;
  }

  /**
   * Restore note expressions from saved data
   * @param {Object} expressionsObj - Object with note names as keys and expression data as values
   */
  restoreExpressions(expressionsObj) {
    // Clear existing expressions
    this.expressions.clear();
    this.relatedNotes.clear();
    
    // Clear visual indicators
    this.indicators.forEach((indicators, note) => {
      Object.values(indicators).forEach(element => {
        if (element && element.parentNode) {
          element.parentNode.removeChild(element);
        }
      });
    });
    this.indicators.clear();
    
    // Update chord notes from current piano keyboard state
    this.chordNotes.clear();
    if (this.pianoKeyboard.currentChord) {
      this.pianoKeyboard.currentChord.forEach(freq => {
        const noteName = this.pianoKeyboard.frequencyToNoteName(freq);
        if (noteName) {
          this.chordNotes.add(noteName);
        }
      });
    }
    
    // Restore each expression
    if (expressionsObj) {
      Object.entries(expressionsObj).forEach(([note, expression]) => {
        if (expression && expression.type !== "none") {
          this.expressions.set(note, expression);
          
          // Also ensure the note is in the chord
          if (!this.chordNotes.has(note)) {
            this.chordNotes.add(note);
          }
          
          // Emit event so PartManager gets updated
          this.pianoKeyboard.eventBus.emit("expression:changed", {
            note,
            expression,
            timestamp: Date.now(),
          });
          
          // Handle trill target relationships
          if (expression.type === "trill" && expression.targetNote) {
            this.relatedNotes.set(expression.targetNote, {
              relatedTo: note,
              type: "trill-target",
            });
          }
        }
      });
    }
    
    // Update visuals
    this.updateKeyVisuals();
    this.updateChordDisplay();
    
    // Render canvas overlay to show expression indicators
    this.render();
  }
}

// Export for use in PianoKeyboard
export default PianoExpressionHandler;
