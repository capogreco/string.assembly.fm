/**
 * AppState Module for String Assembly FM
 * Centralized state management with reactive updates
 */

import { eventBus } from '../core/EventBus.js';

export class AppState {
  constructor() {
    this.#state = {
      // Current program state
      currentProgram: null,

      // Chord and expression state
      currentChordState: null,
      currentChord: [],

      // Program banks storage
      programBanks: new Map(),

      // Harmonic ratio selections
      harmonicSelections: {
        'vibrato-numerator': new Set([1]),
        'vibrato-denominator': new Set([1]),
        'trill-numerator': new Set([1]),
        'trill-denominator': new Set([1]),
        'tremolo-numerator': new Set([1]),
        'tremolo-denominator': new Set([1])
      },

      // Connection state
      connectionStatus: 'disconnected',
      connectedSynths: new Map(),

      // UI state
      selectedExpression: 'none',
      parametersChanged: new Set(),

      // Performance state
      averageLatency: 0,
      lastHeartbeat: null
    };

    this.#subscribers = new Map();
    this.#history = [];
    this.#maxHistorySize = 50;
  }

  #state = {};
  #subscribers = new Map();
  #history = [];
  #maxHistorySize = 50;

  /**
   * Get state value by key
   * @param {string} key - State key
   * @returns {*} State value
   */
  get(key) {
    return this.#state[key];
  }

  /**
   * Set state value and notify subscribers
   * @param {string} key - State key
   * @param {*} value - New value
   * @param {boolean} silent - Skip notifications if true
   */
  set(key, value, silent = false) {
    const oldValue = this.#state[key];

    // Don't update if value hasn't changed (shallow comparison)
    if (oldValue === value) {
      return;
    }

    // Store previous state for history
    this.#addToHistory(key, oldValue, value);

    // Update state
    this.#state[key] = value;

    if (!silent) {
      // Notify specific key subscribers
      this.#notifySubscribers(key, value, oldValue);

      // Emit global state change event
      eventBus.emit('state:changed', {
        key,
        value,
        oldValue,
        timestamp: Date.now()
      });

      // Log state changes in debug mode
      if (window.Logger) {
        window.Logger.log(`State updated: ${key}`, 'lifecycle');
      }
    }
  }

  /**
   * Update multiple state values atomically
   * @param {Object} updates - Object with key-value pairs to update
   * @param {boolean} silent - Skip notifications if true
   */
  update(updates, silent = false) {
    const changes = [];

    // Collect all changes first
    for (const [key, value] of Object.entries(updates)) {
      const oldValue = this.#state[key];
      if (oldValue !== value) {
        changes.push({ key, value, oldValue });
        this.#addToHistory(key, oldValue, value);
        this.#state[key] = value;
      }
    }

    if (!silent && changes.length > 0) {
      // Notify subscribers for each change
      for (const change of changes) {
        this.#notifySubscribers(change.key, change.value, change.oldValue);
      }

      // Emit batch update event
      eventBus.emit('state:batchChanged', {
        changes,
        timestamp: Date.now()
      });

      if (window.Logger) {
        window.Logger.log(`Batch state update: ${changes.length} changes`, 'lifecycle');
      }
    }
  }

  /**
   * Subscribe to state changes for a specific key
   * @param {string} key - State key to watch
   * @param {Function} callback - Callback function (newValue, oldValue, key)
   * @returns {Function} Unsubscribe function
   */
  subscribe(key, callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }

    if (!this.#subscribers.has(key)) {
      this.#subscribers.set(key, new Set());
    }

    this.#subscribers.get(key).add(callback);

    // Return unsubscribe function
    return () => {
      const keySubscribers = this.#subscribers.get(key);
      if (keySubscribers) {
        keySubscribers.delete(callback);
        if (keySubscribers.size === 0) {
          this.#subscribers.delete(key);
        }
      }
    };
  }

  /**
   * Subscribe to all state changes
   * @param {Function} callback - Callback function (key, newValue, oldValue)
   * @returns {Function} Unsubscribe function
   */
  subscribeAll(callback) {
    return eventBus.on('state:changed', (data) => {
      callback(data.key, data.value, data.oldValue);
    });
  }

  /**
   * Get entire state object (read-only copy)
   * @returns {Object} State snapshot
   */
  getState() {
    return JSON.parse(JSON.stringify(this.#state));
  }

  /**
   * Reset state to initial values
   * @param {boolean} silent - Skip notifications if true
   */
  reset(silent = false) {
    const oldState = this.getState();

    this.#state = {
      currentProgram: null,
      currentChordState: null,
      currentChord: [],
      programBanks: new Map(),
      harmonicSelections: {
        'vibrato-numerator': new Set([1]),
        'vibrato-denominator': new Set([1]),
        'trill-numerator': new Set([1]),
        'trill-denominator': new Set([1]),
        'tremolo-numerator': new Set([1]),
        'tremolo-denominator': new Set([1])
      },
      connectionStatus: 'disconnected',
      connectedSynths: new Map(),
      selectedExpression: 'none',
      parametersChanged: new Set(),
      averageLatency: 0,
      lastHeartbeat: null
    };

    this.#history = [];

    if (!silent) {
      eventBus.emit('state:reset', {
        oldState,
        timestamp: Date.now()
      });

      if (window.Logger) {
        window.Logger.log('State reset to initial values', 'lifecycle');
      }
    }
  }

  /**
   * Get state change history
   * @param {number} limit - Maximum number of history entries to return
   * @returns {Array} History entries
   */
  getHistory(limit = 10) {
    return this.#history.slice(-limit);
  }

  /**
   * Clear state change history
   */
  clearHistory() {
    this.#history = [];
  }

  /**
   * Add entry to state history
   * @private
   */
  #addToHistory(key, oldValue, newValue) {
    this.#history.push({
      key,
      oldValue,
      newValue,
      timestamp: Date.now()
    });

    // Keep history size manageable
    if (this.#history.length > this.#maxHistorySize) {
      this.#history = this.#history.slice(-this.#maxHistorySize);
    }
  }

  /**
   * Notify subscribers of state changes
   * @private
   */
  #notifySubscribers(key, newValue, oldValue) {
    const keySubscribers = this.#subscribers.get(key);
    if (keySubscribers) {
      for (const callback of keySubscribers) {
        try {
          callback(newValue, oldValue, key);
        } catch (error) {
          if (window.Logger) {
            window.Logger.log(
              `Error in state subscriber for '${key}': ${error}`,
              'error'
            );
          }
        }
      }
    }
  }

  /**
   * Helper methods for common state operations
   */

  // Harmonic selections helpers
  addHarmonicSelection(selector, value) {
    const selections = this.get('harmonicSelections');
    if (selections[selector]) {
      selections[selector].add(value);
      this.set('harmonicSelections', selections);
    }
  }

  removeHarmonicSelection(selector, value) {
    const selections = this.get('harmonicSelections');
    if (selections[selector]) {
      selections[selector].delete(value);
      this.set('harmonicSelections', selections);
    }
  }

  clearHarmonicSelections(selector) {
    const selections = this.get('harmonicSelections');
    if (selections[selector]) {
      selections[selector].clear();
      selections[selector].add(1); // Always keep at least 1:1
      this.set('harmonicSelections', selections);
    }
  }

  // Chord helpers
  addNoteToChord(frequency) {
    const chord = [...this.get('currentChord')];
    if (!chord.includes(frequency)) {
      chord.push(frequency);
      chord.sort((a, b) => a - b);
      this.set('currentChord', chord);
    }
  }

  removeNoteFromChord(frequency) {
    const chord = this.get('currentChord').filter(f => f !== frequency);
    this.set('currentChord', chord);
  }

  clearChord() {
    this.set('currentChord', []);
    this.set('currentChordState', null);
  }

  // Parameter change tracking
  markParameterChanged(paramId) {
    const changed = new Set(this.get('parametersChanged'));
    changed.add(paramId);
    this.set('parametersChanged', changed);
  }

  clearParameterChanges() {
    this.set('parametersChanged', new Set());
  }

  // Connection state helpers
  addConnectedSynth(synthId, synthData) {
    const synths = new Map(this.get('connectedSynths'));
    synths.set(synthId, synthData);
    this.set('connectedSynths', synths);
  }

  removeConnectedSynth(synthId) {
    const synths = new Map(this.get('connectedSynths'));
    synths.delete(synthId);
    this.set('connectedSynths', synths);
  }

  updateSynthLatency(synthId, latency) {
    const synths = new Map(this.get('connectedSynths'));
    const synthData = synths.get(synthId);
    if (synthData) {
      synthData.latency = latency;
      synthData.lastPing = Date.now();
      synths.set(synthId, synthData);
      this.set('connectedSynths', synths);

      // Update average latency
      this.#updateAverageLatency();
    }
  }

  #updateAverageLatency() {
    const synths = this.get('connectedSynths');
    const latencies = Array.from(synths.values())
      .map(s => s.latency)
      .filter(l => l != null);

    if (latencies.length > 0) {
      const average = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
      this.set('averageLatency', Math.round(average));
    } else {
      this.set('averageLatency', 0);
    }
  }
}

// Create global instance
export const appState = new AppState();

// Make available globally for backward compatibility
if (typeof window !== 'undefined') {
  window.AppState = AppState;
  window.appState = appState;
}
