# String Assembly FM - State Audit

## Overview
This document contains a comprehensive audit of all state storage locations in the String Assembly FM codebase as of June 2025.

## 1. AppState Properties

Located in: `/public/js/modules/state/AppState.js`

### Current State Structure:
```javascript
{
  // Chord state - kept for compatibility
  currentChord: [],

  // Harmonic selections - kept for compatibility  
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
  lastHeartbeat: null,
  
  // Legacy compatibility
  currentProgram: null,
  activeProgram: null,
  programBanks: new Map()
}
```

### Key Methods:
- `subscribe(key, callback)` - Subscribe to specific state changes
- `subscribeAll(callback)` - Subscribe to all state changes
- `addConnectedSynth(synthId, synthData)`
- `updateSynthLatency(synthId, latency)`
- `markParameterChanged(paramId)` - Deprecated

### Subscribers:
- Multiple components subscribe to various state properties
- Uses EventBus for global state change notifications

## 2. ProgramState

Located in: `/public/js/modules/state/ProgramState.js`

### State Structure:
```javascript
{
  // Current UI state (what user sees/edits)
  currentProgram: {
    // Core synthesis parameters
    parameters: {},
    
    // Musical state
    chord: {
      frequencies: [],
      expressions: {} // noteName -> expression data
    },
    
    // Harmonic selections for expressions
    harmonicSelections: {
      'vibrato-numerator': [1],
      'vibrato-denominator': [1],
      'trill-numerator': [1],
      'trill-denominator': [1],
      'tremolo-numerator': [1],
      'tremolo-denominator': [1]
    },
    
    // UI state
    selectedExpression: 'none',
    powerOn: true,
    
    // Metadata
    metadata: {
      version: '2.0',
      timestamp: Date.now(),
      name: ''
    }
  },
  
  // Active program (what's running on synths)
  activeProgram: null,
  
  // Saved banks
  banks: new Map(),
  
  // Storage key for localStorage
  storageKey: 'string-assembly-banks'
}
```

### Key Methods:
- `captureFromUI()` - Captures current state from DOM
- `applyToUI()` - Applies program state to DOM
- `isInSync()` - Checks if current matches active
- `saveToBank(bankId)` - Saves active program
- `loadFromBank(bankId)` - Loads and applies program

### Events Emitted:
- `programState:changed`
- `programState:synced`
- `programState:bankSaved`
- `programState:bankLoaded`
- `programState:chordChanged`
- `programState:harmonicSelectionsChanged`

## 3. Component Local State

### PianoKeyboard (`/public/js/modules/ui/PianoKeyboard.js`)
```javascript
{
  pianoElement: null,
  keys: new Map(), // frequency -> key data
  currentChord: new Set(), // Currently selected frequencies
  isInitialized: false,
  keyWidth: 20,
  whiteKeyHeight: 60,
  blackKeyHeight: 40,
  startNote: 24, // C1 MIDI note
  octaves: 7,
  endNote: calculated,
  expressionHandler: PianoExpressionHandler instance
}
```

### PianoExpressionHandler (`/public/js/modules/piano/PianoExpressionHandler.js`)
```javascript
{
  pianoKeyboard: reference,
  noteExpressions: Map(), // noteName -> expression object
  dragStartNote: null,
  dragStartY: null,
  isDragging: false,
  currentExpression: null,
  isInitialized: false
}
```

### ParameterControls (`/public/js/modules/ui/ParameterControls.js`)
```javascript
{
  eventBus: reference,
  appState: reference,
  paramElements: new Map(), // paramId -> element data
  isInitialized: false,
  changeDebounceTime: 50,
  changeTimeouts: new Map(),
  harmonicComponents: [] // HarmonicRatioSelector instances
}
```

### NetworkCoordinator (`/public/js/modules/network/NetworkCoordinator.js`)
```javascript
{
  wsManager: WebSocketManager instance,
  rtcManager: WebRTCManager instance,
  eventBus: reference,
  appState: reference,
  isInitialized: false,
  heartbeatInterval: null,
  latencyCheckInterval: null,
  connectedSynths: Map()
}
```

### WebSocketManager (`/public/js/modules/network/WebSocketManager.js`)
```javascript
{
  config: {
    url: websocket URL,
    reconnectDelay: 2000,
    heartbeatInterval: 5000
  },
  ws: WebSocket instance,
  isConnected: false,
  reconnectTimer: null,
  heartbeatTimer: null,
  eventBus: reference,
  messageQueue: []
}
```

### WebRTCManager (`/public/js/modules/network/WebRTCManager.js`)
```javascript
{
  config: ICE configuration,
  connections: Map(), // peerId -> RTCPeerConnection
  dataChannels: Map(), // peerId -> RTCDataChannel
  eventBus: reference,
  pendingCandidates: Map()
}
```

### ChordManager (`/public/js/modules/audio/ChordManager.js`)
```javascript
{
  eventBus: reference,
  appState: reference,
  currentChord: [],
  chordDistribution: Map(), // synthId -> note assignment
  distributionAlgorithm: 'stochastic',
  isInitialized: false
}
```

### PartManager (`/public/js/modules/state/PartManager.js`)
```javascript
{
  eventBus: reference,
  appState: reference,
  isInitialized: false,
  partAssignments: Map(), // synthId -> assignment
  noteExpressions: Map(), // noteName -> expression
  transitionSettings: {
    duration: 0,
    stagger: 0,
    durationSpread: 0
  },
  currentChord: []
}
```

### ProgramManager (`/public/js/modules/state/ProgramManager.js`)
```javascript
{
  state: appState reference,
  storage: localStorage reference,
  eventBus: reference,
  storageKey: 'string-assembly-banks',
  isApplyingProgram: false,
  programState: reference // Delegates to ProgramState
}
```

### UIManager (`/public/js/modules/ui/UIManager.js`)
```javascript
{
  eventBus: reference,
  appState: reference,
  isInitialized: false,
  statusElements: {
    connectionStatus: element,
    connectionDetails: element,
    latency: element,
    synthCount: element
  },
  updateInterval: null
}
```

### HarmonicRatioSelector (`/public/js/modules/ui/HarmonicRatioSelector.js`)
```javascript
{
  expression: string,
  appState: reference,
  eventBus: reference,
  container: element,
  numeratorButtons: Map(),
  denominatorButtons: Map(),
  isInitialized: false
}
```

## 4. DOM State

### Input Elements
- Parameter sliders: `<input type="range" id="paramName">`
- Power checkbox: `<input type="checkbox" id="power">`
- Expression radios: `<input type="radio" name="expression">`
- Body type select: `<select id="bodyType">`
- String material select: `<select id="stringMaterial">`

### CSS Classes for State
- `.selected` - Selected harmonic buttons, active piano keys
- `.active` - Active expression groups
- `.changed` - Changed parameters
- `.sent` - Parameters sent to synths
- `.focused` - Focused control groups
- `.connected` - Connection status
- `.out-of-range` - Piano keys out of instrument range
- `.keyboard-pressed` - Keyboard-activated piano keys

### Data Attributes
- `data-note` - MIDI note number on piano keys
- `data-frequency` - Frequency on piano keys
- `data-note-name` - Note name on piano keys
- `data-expression` - Expression type on selectors
- `data-type` - 'numerator' or 'denominator'
- `data-value` - Harmonic ratio value

## 5. Module Static State

### Logger (`/public/js/modules/core/Logger.js`)
```javascript
{
  initialized: false,
  logContainer: element,
  isEnabled: localStorage.getItem('debug-logging') === 'true',
  selectedCategories: Set from localStorage
}
```

### EventBus (`/public/js/modules/core/EventBus.js`)
```javascript
{
  #events: Map() // event name -> Set of listeners
}
```

## 6. LocalStorage State

### Keys Used:
- `string-assembly-banks` - Saved program banks
- `debug-logging` - Debug logging enabled state
- `debug-categories` - Selected debug categories
- `user-preferences` - Future user preferences

### Structure of Banks Storage:
```javascript
{
  "1": { /* Program object */ },
  "2": { /* Program object */ },
  // ... up to 16 banks
}
```

## 7. Global Window State

### Window Properties Set:
- `window.AppState` - AppState class
- `window.appState` - AppState instance
- `window.programState` - ProgramState instance
- `window.ProgramManager` - ProgramManager class
- `window.programManager` - ProgramManager instance
- `window.ChordManager` - ChordManager class
- `window.chordManager` - ChordManager instance
- `window.Logger` - Logger instance
- `window.eventBus` - EventBus instance
- `window.modular` - Object containing all module instances
- Various other module classes and instances

## 8. State Update Patterns

### Direct DOM Manipulation:
- Parameter value changes
- CSS class additions/removals
- Display text updates

### Event-Based Updates:
- EventBus for cross-module communication
- Custom events for specific state changes
- Subscription patterns for reactive updates

### Polling:
- Connection status updates
- Latency measurements
- Heartbeat checks

## 9. State Dependencies

### Circular References:
- AppState ↔ ProgramState (during migration)
- Components → AppState → Components

### State Flow:
1. User interaction → DOM change
2. DOM change → Component captures state
3. Component → Updates AppState/ProgramState
4. State change → EventBus notification
5. Subscribers → Update their local state/UI

## 10. Issues Identified

1. **State Duplication**: 
   - Chord state exists in AppState, ProgramState, PartManager, ChordManager
   - Harmonic selections in AppState and ProgramState
   - Connection state in AppState and NetworkCoordinator

2. **Inconsistent State Management**:
   - Some modules use AppState, others have local state
   - Mix of direct DOM manipulation and state-based updates

3. **Legacy Compatibility**:
   - Deprecated methods still in use
   - Multiple state locations for backward compatibility

4. **No Single Source of Truth**:
   - State scattered across modules
   - Difficult to track state flow

5. **DOM as State Storage**:
   - CSS classes used for state
   - Input values as source of truth

## Next Steps

This audit reveals significant state fragmentation. The consolidation plan should:
1. Define a single source of truth
2. Establish clear state ownership
3. Remove duplication
4. Standardize update patterns
5. Improve debugging capabilities