# State Consolidation Plan

## Current State Locations

### 1. AppState (`/public/js/modules/state/AppState.js`)
- **Purpose**: Originally central state store, now being migrated
- **Contents**: Chord, connections, UI state, legacy program data
- **Update Pattern**: Direct set/get with subscriptions
- **Issues**: Contains deprecated properties, dual source of truth with ProgramState

### 2. ProgramState (`/public/js/modules/state/ProgramState.js`)
- **Purpose**: Single source of truth for program data
- **Contents**: Current/active programs, banks, parameters
- **Update Pattern**: Methods with event emission
- **Issues**: Overlaps with AppState, captures from DOM

### 3. Component Local State
- **PianoKeyboard**: currentChord Set, keys Map, UI state
- **ParameterControls**: paramElements Map, change timeouts
- **NetworkCoordinator**: connection tracking
- **ChordManager**: chord distribution, assignments
- **PartManager**: part assignments, expressions, transitions
- **WebSocketManager**: connection state, message queue
- **WebRTCManager**: peer connections, data channels

### 4. DOM State
- **Input Values**: Parameter sliders, checkboxes, selects
- **CSS Classes**: selected, active, changed, sent, connected
- **Data Attributes**: note info, expression types, values

### 5. LocalStorage
- **Banks**: Program storage
- **Debug Settings**: Logger configuration
- **User Preferences**: Future use

## Proposed Unified Structure

```javascript
const UnifiedAppState = {
  // ==========================================
  // PERFORMANCE STATE (Musical/Audio)
  // ==========================================
  performance: {
    // Current program being edited/displayed
    currentProgram: {
      // Synthesis parameters (sliders)
      parameters: {
        stringMaterial: 0.5,
        stringDamping: 0.3,
        bowPosition: 0.5,
        bowSpeed: 0.4,
        bowForce: 0.6,
        brightness: 0.5,
        vibratoRate: 5.0,
        trillSpeed: 10.0,
        trillArticulation: 0.5,
        tremoloSpeed: 15.0,
        tremoloArticulation: 0.7,
        bodyResonance: 0.7,
        // Note: masterGain, power, transitions are system-level
      },
      
      // Chord and expression assignments
      chord: {
        frequencies: [440, 554.37, 659.25], // A4, C#5, E5
        noteNames: ['A4', 'C#5', 'E5'], // Derived, for convenience
        expressions: {
          'A4': { type: 'vibrato', depth: 0.5, rate: 4 },
          'C#5': { type: 'trill', interval: 2, speed: 8 },
          'E5': { type: 'none' }
        }
      },
      
      // Harmonic ratio selections for expressions
      harmonicSelections: {
        'vibrato-numerator': [1, 2, 3],
        'vibrato-denominator': [1],
        'trill-numerator': [1],
        'trill-denominator': [1],
        'tremolo-numerator': [1],
        'tremolo-denominator': [1]
      },
      
      // Metadata
      metadata: {
        name: 'Current Edit',
        timestamp: Date.now(),
        version: '2.0'
      }
    },
    
    // Active program (what's actually playing on synths)
    activeProgram: null, // Same structure as currentProgram when synced
    
    // Part assignments (which synth plays which note)
    partAssignments: {
      'synth-001': {
        noteFrequency: 440,
        noteName: 'A4',
        expression: { type: 'vibrato', depth: 0.5, rate: 4 },
        harmonicRatio: { numerator: 1, denominator: 1 }
      },
      'synth-002': {
        noteFrequency: 554.37,
        noteName: 'C#5',
        expression: { type: 'trill', interval: 2, speed: 8 },
        harmonicRatio: { numerator: 1, denominator: 1 }
      }
    },
    
    // Transition settings (for parameter changes)
    transitions: {
      duration: 1.0,        // seconds
      stagger: 0.0,         // 0-1 (percentage)
      durationSpread: 0.0,  // 0-1 (percentage)
      glissando: false      // boolean
    }
  },
  
  // ==========================================
  // SYSTEM STATE (Infrastructure/Global)
  // ==========================================
  system: {
    // Master audio controls
    audio: {
      masterGain: 0.8,    // 0-1
      power: true,        // boolean
      calibrated: false,  // boolean
      // Future additions:
      // reverb: 0.0,
      // detune: 0,
      // pan: 0
    },
    
    // Debug/logging state
    debug: {
      enabled: false,
      categories: ['lifecycle', 'network', 'performance'],
      logHistory: [] // Limited size array
    }
  },
  
  // ==========================================
  // CONNECTION STATE (Network/Communication)
  // ==========================================
  connections: {
    // WebSocket connection
    websocket: {
      connected: false,
      reconnecting: false,
      reconnectAttempts: 0,
      lastError: null
    },
    
    // Connected synths
    synths: {
      // Map-like object for easier serialization
      'synth-001': {
        id: 'synth-001',
        connected: true,
        connectedAt: Date.now(),
        latency: 23,
        lastPing: Date.now(),
        connectionHealth: 'good', // excellent|good|fair|poor
        audioEnabled: true,
        instrumentJoined: true,
        state: {
          powered: true,
          volume: 0.8
        }
      }
      // ... more synths
    },
    
    // Aggregate connection metrics
    metrics: {
      connectedCount: 1,
      averageLatency: 23,
      lastHeartbeat: Date.now()
    }
  },
  
  // ==========================================
  // UI STATE (Interface/Display)
  // ==========================================
  ui: {
    // Piano keyboard state
    piano: {
      selectedNotes: ['A4', 'C#5', 'E5'], // Note names being displayed
      playingNotes: [],                    // Notes currently sounding
      instrumentRange: {                   // Based on bodyType
        min: 65.41,  // C2
        max: 1046.50 // C6
      }
    },
    
    // Parameter tracking
    parameters: {
      changed: ['bowSpeed', 'bowForce'], // Parameters modified since last sync
      focused: null                      // Currently focused parameter
    },
    
    // Expression UI
    expressions: {
      selected: 'vibrato',               // Currently selected in radio buttons
      activeGroups: ['vibrato', 'trill'] // Which parameter groups to show
    },
    
    // Banking
    banking: {
      currentBank: 1,     // 1-16
      lastSaved: null,    // Bank number of last save
      lastLoaded: null    // Bank number of last load
    },
    
    // Modal/overlay states
    modals: {
      saveDialog: false,
      loadDialog: false,
      settingsOpen: false
    }
  },
  
  // ==========================================
  // BANKING STATE (Storage/Presets)
  // ==========================================
  banking: {
    // All saved banks (1-16)
    banks: {
      1: { /* Program object */ },
      2: { /* Program object */ },
      // ... up to 16
    },
    
    // Banking metadata
    metadata: {
      lastModified: Date.now(),
      version: '2.0'
    }
  },
  
  // ==========================================
  // HISTORY (Undo/Redo Support)
  // ==========================================
  history: {
    past: [],      // Array of state snapshots
    future: [],    // Array of state snapshots
    maxSize: 50,   // Limit history size
    enabled: true  // Can be disabled for performance
  }
}
```

## Migration Strategy

### Phase 1: Preparation
1. Create new AppState structure with all properties
2. Add migration utilities for data transformation
3. Set up proper TypeScript/JSDoc types

### Phase 2: Parallel Operation
1. Update AppState to new structure
2. Create adapters for backward compatibility
3. Add state sync between old and new

### Phase 3: Component Migration
Each component migration follows this pattern:
1. Add new state subscriptions
2. Update to use new state structure
3. Remove old state dependencies
4. Test thoroughly

### Component Migration Order:
1. **NetworkCoordinator** → `connections.*`
2. **UIManager** → `ui.*`, `connections.metrics`
3. **ParameterControls** → `performance.currentProgram.parameters`, `ui.parameters`
4. **PianoKeyboard** → `performance.currentProgram.chord`, `ui.piano`
5. **ProgramState** → `performance.*`, `banking.*`
6. **PartManager** → `performance.partAssignments`, `performance.transitions`
7. **ChordManager** → Merge into PartManager
8. **Banking UI** → `banking.*`, `ui.banking`

### Phase 4: Cleanup
1. Remove deprecated properties
2. Remove compatibility layers
3. Update documentation
4. Add comprehensive tests

## State Update Patterns

### 1. Direct Updates (Immediate UI Response)
```javascript
appState.update({
  'ui.parameters.focused': 'bowSpeed',
  'ui.piano.playingNotes': ['A4']
});
```

### 2. Transactional Updates (All or Nothing)
```javascript
appState.transaction(() => {
  appState.set('performance.currentProgram', newProgram);
  appState.set('ui.parameters.changed', []);
  appState.set('ui.banking.lastLoaded', bankId);
});
```

### 3. Derived State (Computed Properties)
```javascript
// Automatically computed when dependencies change
appState.derive('connections.metrics.connectedCount', 
  ['connections.synths'], 
  (synths) => Object.values(synths).filter(s => s.connected).length
);
```

### 4. Async State Updates
```javascript
appState.asyncUpdate('banking.banks', async (banks) => {
  await saveToLocalStorage(banks);
  return banks;
});
```

## Benefits of Unified Structure

1. **Single Source of Truth**: All state in one place
2. **Predictable Updates**: Clear update patterns
3. **Better Debugging**: State snapshots, time travel
4. **Type Safety**: Can add TypeScript definitions
5. **Persistence**: Easy to save/restore entire state
6. **Testing**: Mock state for unit tests
7. **Performance**: Batch updates, selective re-renders
8. **Maintainability**: Clear ownership and structure