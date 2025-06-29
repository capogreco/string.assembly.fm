/**
 * AppState Module for String Assembly FM
 * Centralized state management with reactive updates
 * 
 * Migration Status (Phase 4 - COMPLETE):
 * ✓ Performance state: Migrated to performance.currentProgram.*
 * ✓ Part assignments: Migrated to performance.currentProgram.parts.assignments
 * ✓ Expression state: Migrated to performance.currentProgram.chord.expressions
 * ✓ Piano UI state: Mapped via compatibility layer
 * ✓ Parameter tracking: Mapped via compatibility layer
 * ✓ Banking state: Migrated to banking.banks and banking.metadata
 * ✓ Component cleanup: PartManager and ProgramState use AppState
 * ✓ Deprecation warnings: Added to compatibility layer
 * 
 * State Structure:
 * - performance: Musical performance state (programs, parts, transitions)
 * - system: Infrastructure state (audio, debug)
 * - connections: Network state (websocket, synths, metrics)
 * - ui: User interface state (piano, parameters, expressions, banking, modals)
 * - banking: Program storage (banks, metadata)
 * - history: State change history for undo/redo
 * 
 * Compatibility layer provides backward compatibility during migration.
 * To remove: Set REMOVE_COMPATIBILITY_LAYER to true and fix any warnings.
 */

import { eventBus } from '../core/EventBus.js';

export class AppState {
  constructor() {
    // Initialize with the new unified structure
    this.#state = {
      // Performance State (Musical)
      performance: {
        currentProgram: {
          parameters: {}, // Will be populated by ProgramState
          chord: {
            frequencies: [],
            noteNames: [],
            expressions: {} // { noteName: { type, parameters } }
          },
          harmonicSelections: this.#initializeHarmonicSelections(),
          parts: {
            assignments: new Map() // Map<synthId, { frequency, expression }>
          }
        },
        activeProgram: null, // What's running on synths
        transitions: {
          duration: 1.0,
          stagger: 0.0,
          durationSpread: 0.0,
          glissando: false
        },
        timestamp: Date.now()
      },

      // System State (Infrastructure)
      system: {
        audio: {
          masterGain: 0.8,
          power: true,
          calibrated: false
        },
        debug: {
          enabled: false,
          categories: [],
          logHistory: []
        }
      },

      // Connection State
      connections: {
        websocket: {
          connected: false,
          reconnecting: false,
          reconnectAttempts: 0,
          lastError: null
        },
        synths: new Map(), // Map<synthId, { connected, latency, lastSeen }>
        metrics: {
          connectedCount: 0,
          averageLatency: 0,
          lastHeartbeat: null
        },
        controllerId: null
      },

      // UI State
      ui: {
        piano: {
          selectedNotes: [], // Note names being displayed
          playingNotes: [],  // Notes currently sounding
          instrumentRange: { min: 20, max: 20000 }
        },
        parameters: {
          changed: new Set(), // Parameters modified since last sync
          focused: null       // Currently focused parameter
        },
        expressions: {
          selected: 'none',
          activeGroups: []
        },
        banking: {
          currentBank: 1,
          lastSaved: null,
          lastLoaded: null
        },
        modals: {
          saveDialog: false,
          loadDialog: false,
          settingsOpen: false
        }
      },

      // Banking State
      banking: {
        banks: new Map(), // Map<bankNumber, Program>
        metadata: {
          lastModified: Date.now(),
          version: '2.0'
        }
      },

      // History (for future undo/redo)
      history: {
        past: [],
        future: [],
        maxSize: 50,
        enabled: false
      },

      // ==============================================
      // LEGACY COMPATIBILITY - TO BE REMOVED
      // ==============================================
      currentChord: [],
      harmonicSelections: this.#initializeHarmonicSelections(),
      connectionStatus: 'disconnected',
      connectedSynths: new Map(),
      selectedExpression: 'none',
      parametersChanged: new Set(),
      averageLatency: 0,
      lastHeartbeat: null,
      currentProgram: null,
      activeProgram: null,
      programBanks: new Map()
    };

    this.#subscribers = new Map();
    this.#history = [];
    this.#maxHistorySize = 50;

    // Set up compatibility layer
    this.#setupCompatibilityLayer();
  }

  #state = {};
  #subscribers = new Map();
  #history = [];
  #maxHistorySize = 50;

  /**
   * Initialize harmonic selections with default values
   * @private
   */
  #initializeHarmonicSelections() {
    return {
      'vibrato-numerator': new Set([1]),
      'vibrato-denominator': new Set([1]),
      'trill-numerator': new Set([1]),
      'trill-denominator': new Set([1]),
      'tremolo-numerator': new Set([1]),
      'tremolo-denominator': new Set([1])
    };
  }

  /**
   * Set up compatibility layer for gradual migration
   * @private
   */
  #setupCompatibilityLayer() {
    // Create property descriptors for legacy access patterns
    const compatibilityMappings = {
      // System state mappings
      'power': 'system.audio.power',
      'masterGain': 'system.audio.masterGain',
      'volume': 'system.audio.masterGain',
      
      // Connection state mappings
      'connectionStatus': {
        get: () => this.#state.connections.websocket.connected ? 'connected' : 'disconnected',
        set: (v) => this.#state.connections.websocket.connected = (v === 'connected')
      },
      'averageLatency': 'connections.metrics.averageLatency',
      'lastHeartbeat': 'connections.metrics.lastHeartbeat',
      
      // UI state mappings
      'selectedExpression': 'ui.expressions.selected',
      'parametersChanged': 'ui.parameters.changed',
      'selectedNotes': 'ui.piano.selectedNotes',
      'playingNotes': 'ui.piano.playingNotes',
      
      // These are already at root level for compatibility
      // 'currentChord', 'harmonicSelections', 'connectedSynths', 'currentProgram', 'activeProgram', 'programBanks'
    };

    // Apply compatibility mappings
    Object.entries(compatibilityMappings).forEach(([oldKey, mapping]) => {
      if (typeof mapping === 'string') {
        // Simple path mapping
        Object.defineProperty(this, oldKey, {
          get: () => {
            console.warn(`DEPRECATED: Direct access to '${oldKey}', use getNested('${mapping}') instead`);
            return this.getNested(mapping);
          },
          set: (value) => {
            console.warn(`DEPRECATED: Direct set of '${oldKey}', use setNested('${mapping}', value) instead`);
            this.setNested(mapping, value);
          },
          configurable: true
        });
      } else if (typeof mapping === 'object') {
        // Custom getter/setter
        Object.defineProperty(this, oldKey, {
          get: () => {
            console.warn(`DEPRECATED: Direct access to '${oldKey}'`);
            return mapping.get();
          },
          set: (v) => {
            console.warn(`DEPRECATED: Direct set of '${oldKey}'`);
            mapping.set(v);
          },
          configurable: true
        });
      }
    });

    // Additional compatibility for complex state
    // Note: currentProgram is already at root level in the state object for compatibility
    
    // Expressions compatibility
    Object.defineProperty(this, 'expressions', {
      get: () => {
        console.warn("DEPRECATED: Direct access to 'expressions', use getNested('performance.currentProgram.chord.expressions') instead");
        return this.#state.performance.currentProgram.chord.expressions;
      },
      set: (v) => {
        console.warn("DEPRECATED: Direct set of 'expressions', use setNested('performance.currentProgram.chord.expressions', value) instead");
        this.#state.performance.currentProgram.chord.expressions = v;
      },
      configurable: true
    });
    
    // Per-note expressions (used by ChordManager)
    Object.defineProperty(this, 'perNoteExpressions', {
      get: () => {
        console.warn("DEPRECATED: Direct access to 'perNoteExpressions', use getNested('performance.currentProgram.chord.expressions') instead");
        return this.#state.performance.currentProgram.chord.expressions;
      },
      set: (v) => {
        console.warn("DEPRECATED: Direct set of 'perNoteExpressions', use setNested('performance.currentProgram.chord.expressions', value) instead");
        this.#state.performance.currentProgram.chord.expressions = v;
      },
      configurable: true
    });
    
    // Part assignments compatibility (used by PartManager)
    Object.defineProperty(this, 'partAssignments', {
      get: () => {
        console.warn("DEPRECATED: Direct access to 'partAssignments', use getNested('performance.currentProgram.parts.assignments') instead");
        return this.#state.performance.currentProgram.parts.assignments;
      },
      set: (v) => {
        console.warn("DEPRECATED: Direct set of 'partAssignments', use setNested('performance.currentProgram.parts.assignments', value) instead");
        this.#state.performance.currentProgram.parts.assignments = v;
      },
      configurable: true
    });

    if (window.Logger) {
      window.Logger.log('AppState compatibility layer initialized', 'lifecycle');
    }
  }

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
   * Get nested state value using dot notation path
   * @param {string} path - Dot notation path (e.g., 'system.audio.power')
   * @returns {*} State value at path
   */
  getNested(path) {
    const keys = path.split('.');
    let current = this.#state;
    
    for (const key of keys) {
      if (!current || current[key] === undefined) {
        return undefined;
      }
      current = current[key];
    }
    
    return current;
  }

  /**
   * Set nested state value using dot notation path
   * @param {string} path - Dot notation path (e.g., 'system.audio.power')
   * @param {*} value - New value to set
   * @param {boolean} silent - Skip notifications if true
   */
  setNested(path, value, silent = false) {
    const keys = path.split('.');
    let current = this.#state;
    
    // Navigate to the parent of the target
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    const lastKey = keys[keys.length - 1];
    const oldValue = current[lastKey];
    
    // Don't update if value hasn't changed
    if (oldValue === value) {
      return;
    }
    
    // Store previous state for history
    this.#addToHistory(path, oldValue, value);
    
    // Update state
    current[lastKey] = value;
    
    if (!silent) {
      // Notify subscribers using the full path
      this.#notifySubscribers(path, value, oldValue);
      
      // Also notify any subscribers to parent paths
      let parentPath = '';
      for (let i = 0; i < keys.length; i++) {
        parentPath = i === 0 ? keys[0] : parentPath + '.' + keys[i];
        const parentValue = this.getNested(parentPath);
        this.#notifySubscribers(parentPath, parentValue, parentValue);
      }

      // Emit global state change event
      eventBus.emit('state:changed', {
        key: path,
        value,
        oldValue,
        timestamp: Date.now()
      });

      // Log state changes in debug mode
      if (window.Logger) {
        window.Logger.log(`State updated: ${path}`, 'lifecycle');
      }
    }
  }

  /**
   * Get current program helper
   * @returns {Object} Current program state
   */
  getCurrentProgram() {
    return this.#state.performance.currentProgram;
  }

  /**
   * Get system state helper
   * @returns {Object} System state
   */
  getSystemState() {
    return this.#state.system;
  }

  /**
   * Get connections helper
   * @returns {Object} Connection state
   */
  getConnections() {
    return this.#state.connections;
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

    // Recreate initial state structure
    this.#state = {
      // Performance State (Musical)
      performance: {
        currentProgram: {
          parameters: {},
          chord: {
            frequencies: [],
            noteNames: [],
            expressions: {}
          },
          harmonicSelections: this.#initializeHarmonicSelections(),
          parts: {
            assignments: new Map()
          }
        },
        activeProgram: null,
        transitions: {
          duration: 1.0,
          stagger: 0.0,
          durationSpread: 0.0,
          glissando: false
        },
        timestamp: Date.now()
      },

      // System State (Infrastructure)
      system: {
        audio: {
          masterGain: 0.8,
          power: true,
          calibrated: false
        },
        debug: {
          enabled: false,
          categories: [],
          logHistory: []
        }
      },

      // Connection State
      connections: {
        websocket: {
          connected: false,
          reconnecting: false,
          reconnectAttempts: 0,
          lastError: null
        },
        synths: new Map(),
        metrics: {
          connectedCount: 0,
          averageLatency: 0,
          lastHeartbeat: null
        },
        controllerId: null
      },

      // UI State
      ui: {
        piano: {
          selectedNotes: [],
          playingNotes: [],
          instrumentRange: { min: 20, max: 20000 }
        },
        parameters: {
          changed: new Set(),
          focused: null
        },
        expressions: {
          selected: 'none',
          activeGroups: []
        },
        banking: {
          currentBank: 1,
          lastSaved: null,
          lastLoaded: null
        },
        modals: {
          saveDialog: false,
          loadDialog: false,
          settingsOpen: false
        }
      },

      // Banking State
      banking: {
        banks: new Map(),
        metadata: {
          lastModified: Date.now(),
          version: '2.0'
        }
      },

      // History
      history: {
        past: [],
        future: [],
        maxSize: 50,
        enabled: false
      },

      // Legacy compatibility
      currentChord: [],
      harmonicSelections: this.#initializeHarmonicSelections(),
      connectionStatus: 'disconnected',
      connectedSynths: new Map(),
      selectedExpression: 'none',
      parametersChanged: new Set(),
      averageLatency: 0,
      lastHeartbeat: null,
      currentProgram: null,
      activeProgram: null,
      programBanks: new Map()
    };

    this.#history = [];

    // Re-setup compatibility layer
    this.#setupCompatibilityLayer();

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
  /**
   * @deprecated Use programState.markChanged() instead
   */
  markParameterChanged(paramId) {
    const changed = new Set(this.get('parametersChanged'));
    changed.add(paramId);
    this.set('parametersChanged', changed);
  }

  /**
   * @deprecated Use programState methods instead
   */
  clearParameterChanges() {
    this.set('parametersChanged', new Set());
  }
  
  // Active program tracking
  /**
   * @deprecated Use programState.setActiveProgram() instead
   */
  setActiveProgram(program) {
    this.set('activeProgram', program);
    this.set('activeProgramTimestamp', Date.now());
    this.clearParameterChanges();
  }
  
  /**
   * @deprecated Use programState.activeProgram instead
   */
  getActiveProgram() {
    return this.get('activeProgram');
  }
  
  /**
   * @deprecated Use programState.isInSync() instead
   */
  hasUnsyncedChanges() {
    const parametersChanged = this.get('parametersChanged');
    return parametersChanged && parametersChanged.size > 0;
  }

  // Connection state helpers
  addConnectedSynth(synthId, synthData) {
    // Work with both old and new state locations
    const synths = new Map(this.get('connectedSynths'));
    const newSynths = new Map(this.getNested('connections.synths'));
    
    // Ensure all fields are initialized
    const enrichedData = {
      id: synthId,
      connectedAt: Date.now(),
      latency: null,
      state: null,
      audioEnabled: false,
      instrumentJoined: false,
      connectionHealth: 'good',
      lastPing: null,
      ...synthData
    };
    
    // Update both locations during migration
    synths.set(synthId, enrichedData);
    newSynths.set(synthId, enrichedData);
    
    this.set('connectedSynths', synths);
    this.setNested('connections.synths', newSynths);
    
    // Update connection count
    this.setNested('connections.metrics.connectedCount', newSynths.size);
  }

  removeConnectedSynth(synthId) {
    // Work with both old and new state locations
    const synths = new Map(this.get('connectedSynths'));
    const newSynths = new Map(this.getNested('connections.synths'));
    
    synths.delete(synthId);
    newSynths.delete(synthId);
    
    this.set('connectedSynths', synths);
    this.setNested('connections.synths', newSynths);
    
    // Update connection count
    this.setNested('connections.metrics.connectedCount', newSynths.size);
  }

  updateSynthLatency(synthId, latency) {
    // Work with both old and new state locations
    const synths = new Map(this.get('connectedSynths'));
    const newSynths = new Map(this.getNested('connections.synths'));
    
    const synthData = synths.get(synthId);
    const newSynthData = newSynths.get(synthId);
    
    if (synthData) {
      synthData.latency = latency;
      synthData.lastPing = Date.now();
      
      // Update connection health based on latency
      if (latency < 50) {
        synthData.connectionHealth = 'excellent';
      } else if (latency < 100) {
        synthData.connectionHealth = 'good';
      } else if (latency < 200) {
        synthData.connectionHealth = 'fair';
      } else {
        synthData.connectionHealth = 'poor';
      }
      
      synths.set(synthId, synthData);
      this.set('connectedSynths', synths);
    }
    
    if (newSynthData) {
      newSynthData.latency = latency;
      newSynthData.lastPing = Date.now();
      
      // Update connection health
      if (latency < 50) {
        newSynthData.connectionHealth = 'excellent';
      } else if (latency < 100) {
        newSynthData.connectionHealth = 'good';
      } else if (latency < 200) {
        newSynthData.connectionHealth = 'fair';
      } else {
        newSynthData.connectionHealth = 'poor';
      }
      
      newSynths.set(synthId, newSynthData);
      this.setNested('connections.synths', newSynths);
    }

    // Update average latency
    this.#updateAverageLatency();
  }
  
  updateSynthState(synthId, stateUpdate) {
    const synths = new Map(this.get('connectedSynths'));
    const synthData = synths.get(synthId);
    if (synthData) {
      // Update specific state fields
      if (stateUpdate.audioEnabled !== undefined) {
        synthData.audioEnabled = stateUpdate.audioEnabled;
      }
      if (stateUpdate.instrumentJoined !== undefined) {
        synthData.instrumentJoined = stateUpdate.instrumentJoined;
      }
      if (stateUpdate.state !== undefined) {
        synthData.state = stateUpdate.state;
      }
      
      synths.set(synthId, synthData);
      this.set('connectedSynths', synths);
    }
  }

  #updateAverageLatency() {
    // Use new state location
    const synths = this.getNested('connections.synths');
    const latencies = Array.from(synths.values())
      .map(s => s.latency)
      .filter(l => l != null);

    if (latencies.length > 0) {
      const average = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
      const rounded = Math.round(average);
      
      // Update both old and new locations
      this.set('averageLatency', rounded);
      this.setNested('connections.metrics.averageLatency', rounded);
    } else {
      this.set('averageLatency', 0);
      this.setNested('connections.metrics.averageLatency', 0);
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
