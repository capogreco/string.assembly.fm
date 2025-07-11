/**
 * Part Module for String Assembly FM
 * Represents a single part in a chord (frequency + expression)
 */

export class Part {
  /**
   * Create a new Part
   * @param {number} frequency - Frequency in Hz
   * @param {Object} expression - Expression object {type, ...params}
   * @param {string} [id] - Optional ID, will be generated if not provided
   */
  constructor(frequency, expression = { type: 'none' }, id = null) {
    this.id = id || Part.generateId();
    this.frequency = frequency;
    this.expression = expression;
    
    // Make the part immutable
    Object.freeze(this);
  }
  
  /**
   * Generate a unique ID for a part
   * @returns {string} Unique part ID
   */
  static generateId() {
    return `part-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Create a new part with updated properties
   * @param {Object} updates - Properties to update
   * @returns {Part} New Part instance with updates
   */
  update(updates) {
    return new Part(
      updates.frequency !== undefined ? updates.frequency : this.frequency,
      updates.expression !== undefined ? updates.expression : this.expression,
      this.id // Keep the same ID
    );
  }
  
  /**
   * Create a Part from a plain object
   * @param {Object} obj - Object with frequency, expression, and optional id
   * @returns {Part} New Part instance
   */
  static fromObject(obj) {
    return new Part(obj.frequency, obj.expression, obj.id);
  }
  
  /**
   * Convert to plain object for serialization
   * @returns {Object} Plain object representation
   */
  toObject() {
    return {
      id: this.id,
      frequency: this.frequency,
      expression: this.expression
    };
  }
  
  /**
   * Check if this part has an expression (other than 'none')
   * @returns {boolean} True if part has an active expression
   */
  hasExpression() {
    return this.expression && this.expression.type !== 'none';
  }
  
  /**
   * Get a display string for this part
   * @param {Function} frequencyToNoteName - Function to convert frequency to note name
   * @returns {string} Display string
   */
  getDisplayString(frequencyToNoteName) {
    const noteName = frequencyToNoteName(this.frequency);
    
    if (!this.hasExpression()) {
      return noteName;
    }
    
    switch (this.expression.type) {
      case 'vibrato':
        return `${noteName}v${Math.round((this.expression.depth || 0) * 100)}`;
      case 'tremolo':
        return `${noteName}t${Math.round((this.expression.depth || 0) * 100)}`;
      case 'trill':
        return `${noteName}(→${this.expression.targetNote || '?'})`;
      default:
        return noteName;
    }
  }
}

// Export for use in other modules
export default Part;