/**
 * EventBus Module for String Assembly FM
 * Provides decoupled communication between modules
 */

export class EventBus {
  constructor() {
    this.events = new Map();
    this.debug = false;
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   * @param {Object} options - Subscription options
   * @returns {Function} Unsubscribe function
   */
  on(event, handler, options = {}) {
    if (typeof handler !== 'function') {
      throw new Error('Event handler must be a function');
    }

    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }

    const subscription = {
      handler,
      once: options.once || false,
      priority: options.priority || 0,
      context: options.context || null
    };

    this.events.get(event).add(subscription);

    if (this.debug && window.Logger) {
      window.Logger.log(`Subscribed to event: ${event}`, 'lifecycle');
    }

    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  /**
   * Subscribe to an event once
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   * @param {Object} options - Subscription options
   * @returns {Function} Unsubscribe function
   */
  once(event, handler, options = {}) {
    return this.on(event, handler, { ...options, once: true });
  }

  /**
   * Unsubscribe from an event
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function to remove
   */
  off(event, handler) {
    if (!this.events.has(event)) {
      return;
    }

    const subscribers = this.events.get(event);
    for (const subscription of subscribers) {
      if (subscription.handler === handler) {
        subscribers.delete(subscription);
        if (this.debug && window.Logger) {
          window.Logger.log(`Unsubscribed from event: ${event}`, 'lifecycle');
        }
        break;
      }
    }

    // Clean up empty event sets
    if (subscribers.size === 0) {
      this.events.delete(event);
    }
  }

  /**
   * Remove all subscribers for an event
   * @param {string} event - Event name
   */
  removeAllListeners(event) {
    if (this.events.has(event)) {
      this.events.delete(event);
      if (this.debug && window.Logger) {
        window.Logger.log(`Removed all listeners for event: ${event}`, 'lifecycle');
      }
    }
  }

  /**
   * Emit an event to all subscribers
   * @param {string} event - Event name
   * @param {*} data - Event data
   * @returns {boolean} True if event had listeners
   */
  emit(event, data = null) {
    if (!this.events.has(event)) {
      return false;
    }

    const subscribers = Array.from(this.events.get(event));

    // Sort by priority (higher priority first)
    subscribers.sort((a, b) => b.priority - a.priority);

    let hasListeners = false;

    for (const subscription of subscribers) {
      try {
        hasListeners = true;

        // Call handler with proper context
        if (subscription.context) {
          subscription.handler.call(subscription.context, data, event);
        } else {
          subscription.handler(data, event);
        }

        // Remove one-time listeners
        if (subscription.once) {
          this.events.get(event).delete(subscription);
        }
      } catch (error) {
        if (window.Logger) {
          window.Logger.log(
            `Error in event handler for '${event}': ${error}`,
            'error'
          );
        }
      }
    }

    // Clean up empty event sets
    if (this.events.get(event).size === 0) {
      this.events.delete(event);
    }

    if (this.debug && window.Logger) {
      window.Logger.log(
        `Emitted event: ${event} to ${subscribers.length} listeners`,
        'lifecycle'
      );
    }

    return hasListeners;
  }

  /**
   * Get list of all event names
   * @returns {string[]} Array of event names
   */
  getEventNames() {
    return Array.from(this.events.keys());
  }

  /**
   * Get number of listeners for an event
   * @param {string} event - Event name
   * @returns {number} Number of listeners
   */
  listenerCount(event) {
    return this.events.has(event) ? this.events.get(event).size : 0;
  }

  /**
   * Get total number of listeners across all events
   * @returns {number} Total listener count
   */
  getTotalListeners() {
    let total = 0;
    for (const subscribers of this.events.values()) {
      total += subscribers.size;
    }
    return total;
  }

  /**
   * Enable or disable debug logging
   * @param {boolean} enabled - Whether to enable debug logging
   */
  setDebug(enabled) {
    this.debug = enabled;
  }

  /**
   * Clear all event listeners
   */
  clear() {
    const eventCount = this.events.size;
    this.events.clear();

    if (this.debug && window.Logger) {
      window.Logger.log(`Cleared all events (${eventCount} events)`, 'lifecycle');
    }
  }

  /**
   * Create a namespaced event emitter
   * @param {string} namespace - Namespace prefix
   * @returns {Object} Namespaced event emitter
   */
  namespace(namespace) {
    return {
      on: (event, handler, options) =>
        this.on(`${namespace}:${event}`, handler, options),
      once: (event, handler, options) =>
        this.once(`${namespace}:${event}`, handler, options),
      off: (event, handler) =>
        this.off(`${namespace}:${event}`, handler),
      emit: (event, data) =>
        this.emit(`${namespace}:${event}`, data),
      removeAllListeners: (event) =>
        this.removeAllListeners(`${namespace}:${event}`)
    };
  }
}

// Create global event bus instance
export const eventBus = new EventBus();

// Make available globally for backward compatibility
if (typeof window !== 'undefined') {
  window.EventBus = EventBus;
  window.eventBus = eventBus;
}
