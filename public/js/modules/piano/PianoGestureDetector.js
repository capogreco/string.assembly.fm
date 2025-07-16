/**
 * PianoGestureDetector - Pure gesture detection for piano interactions
 * No state management, just converts mouse/touch gestures into expression data
 */

export class PianoGestureDetector {
  constructor() {
    // Gesture thresholds
    this.CLICK_THRESHOLD = 10; // pixels - below this is a click, not a drag
    this.VIBRATO_THRESHOLD = -30; // pixels up for vibrato
    this.TREMOLO_THRESHOLD = 30; // pixels down for tremolo  
    this.TRILL_THRESHOLD = 15; // pixels horizontal for trill
  }

  /**
   * Detect gesture type from start and end points
   * @param {Object} startPoint - {x, y, frequency, element}
   * @param {Object} endPoint - {x, y, element}
   * @returns {Object|null} Expression object or null for click
   */
  detectGesture(startPoint, endPoint) {
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Just a click - no expression
    if (distance < this.CLICK_THRESHOLD) {
      return null;
    }
    
    // Prioritize horizontal movement for trill
    if (Math.abs(dx) > this.TRILL_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      const targetNote = this.getTargetNoteFromElement(endPoint.element);
      if (targetNote) {
        return {
          type: 'trill',
          targetNote: targetNote,
          interval: this.calculateInterval(startPoint.noteName, targetNote)
        };
      }
    }
    
    // Vertical movements
    if (dy < this.VIBRATO_THRESHOLD) {
      // Upward drag - vibrato
      const depth = this.calculateDepth(Math.abs(dy), Math.abs(this.VIBRATO_THRESHOLD));
      return {
        type: 'vibrato',
        depth: depth
      };
    }
    
    if (dy > this.TREMOLO_THRESHOLD) {
      // Downward drag - tremolo
      const articulation = this.calculateDepth(dy, this.TREMOLO_THRESHOLD);
      return {
        type: 'tremolo',
        articulation: articulation
      };
    }
    
    // Not enough movement for any expression
    return null;
  }

  /**
   * Calculate expression depth/intensity from drag distance
   * @param {number} distance - Pixels dragged
   * @param {number} threshold - Threshold that was exceeded
   * @returns {number} Depth value between 0.01 and 1.0
   */
  calculateDepth(distance, threshold) {
    // Map distance beyond threshold to 0.01-1.0 range
    const excess = Math.abs(distance) - Math.abs(threshold);
    const depth = Math.min(1.0, Math.max(0.01, excess / 50));
    return depth;
  }

  /**
   * Get note name from key element
   * @param {Element} element - Piano key element
   * @returns {string|null} Note name or null
   */
  getTargetNoteFromElement(element) {
    if (!element) return null;
    
    // Try to get from data attribute
    const noteName = element.getAttribute('data-note-name');
    if (noteName) return noteName;
    
    // Try to find parent key element
    const key = element.closest('[data-note-name]');
    if (key) {
      return key.getAttribute('data-note-name');
    }
    
    return null;
  }

  /**
   * Calculate musical interval between two notes
   * @param {string} note1 - First note (e.g., "C4")
   * @param {string} note2 - Second note (e.g., "D4")
   * @returns {number} Interval in semitones
   */
  calculateInterval(note1, note2) {
    if (!note1 || !note2) return 0;
    
    const noteOrder = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    
    // Parse notes
    const parseNote = (note) => {
      const match = note.match(/^([A-G]#?)(\d+)$/);
      if (!match) return null;
      
      const [, noteName, octave] = match;
      const noteIndex = noteOrder.indexOf(noteName);
      if (noteIndex === -1) return null;
      
      return {
        index: noteIndex,
        octave: parseInt(octave)
      };
    };
    
    const parsed1 = parseNote(note1);
    const parsed2 = parseNote(note2);
    
    if (!parsed1 || !parsed2) return 0;
    
    // Calculate interval in semitones
    const octaveDiff = parsed2.octave - parsed1.octave;
    const noteDiff = parsed2.index - parsed1.index;
    
    return octaveDiff * 12 + noteDiff;
  }

  /**
   * Get visual feedback info for current drag state
   * @param {Object} startPoint - {x, y}
   * @param {Object} currentPoint - {x, y}
   * @returns {Object} Visual feedback data
   */
  getDragFeedback(startPoint, currentPoint) {
    const dx = currentPoint.x - startPoint.x;
    const dy = currentPoint.y - startPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < this.CLICK_THRESHOLD) {
      return { type: 'none', message: '' };
    }
    
    // Check for potential expressions
    if (Math.abs(dx) > this.TRILL_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      return { type: 'trill', message: 'Trill' };
    }
    
    if (dy < this.VIBRATO_THRESHOLD) {
      const depth = this.calculateDepth(Math.abs(dy), Math.abs(this.VIBRATO_THRESHOLD));
      return { 
        type: 'vibrato', 
        message: `Vibrato ${Math.round(depth * 100)}%` 
      };
    }
    
    if (dy > this.TREMOLO_THRESHOLD) {
      const articulation = this.calculateDepth(dy, this.TREMOLO_THRESHOLD);
      return { 
        type: 'tremolo', 
        message: `Tremolo ${Math.round(articulation * 100)}%` 
      };
    }
    
    return { type: 'pending', message: 'Drag more...' };
  }
}

// Create singleton instance
export const pianoGestureDetector = new PianoGestureDetector();