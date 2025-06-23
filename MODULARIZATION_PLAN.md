# String Assembly FM Controller - Modularization Plan

## Overview
Transform the monolithic 2,321-line `ctrl-main-logic.js` into a clean, modular ES6 architecture with clear separation of concerns.

## Current State Analysis

### File Statistics
- **Lines:** 2,321
- **Size:** 69KB
- **Functions:** 88 symbols
- **Global State:** Multiple scattered variables
- **Duplicate Functions:** ~15 wrapper functions

### Major Components Identified
1. **Logging System** (25 lines)
2. **State Management** (AppState, ProgramManager)
3. **Network Layer** (WebSocket, WebRTC)
4. **UI Management** (Parameter controls, Piano, Display)
5. **Expression System** (Chord management, Harmonic ratios)
6. **Utility Functions** (Frequency conversion, Timing)
7. **Legacy Wrappers** (Backward compatibility)

## Proposed Module Structure

```
public/js/
├── modules/
│   ├── core/
│   │   ├── Logger.js          (50 lines)
│   │   ├── Config.js          (30 lines)
│   │   └── EventBus.js        (40 lines)
│   ├── state/
│   │   ├── AppState.js        (80 lines)
│   │   └── ProgramManager.js  (200 lines)
│   ├── network/
│   │   ├── WebSocketManager.js (150 lines)
│   │   ├── WebRTCManager.js    (250 lines)
│   │   └── MessageHandler.js   (100 lines)
│   ├── ui/
│   │   ├── UIManager.js        (150 lines)
│   │   ├── ParameterControls.js (200 lines)
│   │   ├── PianoKeyboard.js    (150 lines)
│   │   └── StatusDisplay.js    (80 lines)
│   ├── audio/
│   │   ├── ExpressionManager.js (180 lines)
│   │   ├── ChordManager.js      (120 lines)
│   │   └── HarmonicRatios.js    (100 lines)
│   └── utils/
│       ├── AudioUtilities.js    (100 lines)
│       ├── TransitionTiming.js  (50 lines)
│       └── Constants.js         (30 lines)
├── legacy/
│   └── compatibility.js         (100 lines)
└── app.js                       (150 lines) // Main entry point
```

**Total:** ~2,010 lines (13% reduction through deduplication)

## Module Specifications

### 1. Core Modules

#### Logger.js
```javascript
export class Logger {
  static categories = {
    connections: false,
    messages: false,
    parameters: false,
    expressions: false,
    performance: false,
    lifecycle: true,
    errors: true
  };
  
  static log(message, category = 'lifecycle') { }
  static enable(category) { }
  static disable(category) { }
}
```

#### Config.js
```javascript
export const Config = {
  WS_URL: window.location.origin.replace(/^http/, 'ws'),
  RTC_CONFIG: {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  },
  DEBUG: false
};
```

#### EventBus.js
```javascript
export class EventBus {
  on(event, handler) { }
  off(event, handler) { }
  emit(event, data) { }
}
```

### 2. State Modules

#### AppState.js
```javascript
export class AppState {
  #state = {
    currentProgram: null,
    currentChordState: null,
    programBanks: new Map(),
    harmonicSelections: { }
  };
  
  get(key) { }
  set(key, value) { }
  subscribe(callback) { }
}
```

#### ProgramManager.js
```javascript
export class ProgramManager {
  constructor(appState, storage) { }
  loadBanksFromStorage() { }
  saveBanksToStorage() { }
  saveToBank(bankId) { }
  loadFromBank(bankId) { }
  createExampleProgram() { }
}
```

### 3. Network Modules

#### WebSocketManager.js
```javascript
export class WebSocketManager {
  constructor(url, eventBus) { }
  connect() { }
  disconnect() { }
  send(message) { }
  onMessage(handler) { }
  onStatusChange(handler) { }
}
```

#### WebRTCManager.js
```javascript
export class WebRTCManager {
  constructor(config, eventBus) { }
  createPeerConnection(peerId) { }
  handleOffer(offer, peerId) { }
  handleAnswer(answer, peerId) { }
  handleIceCandidate(candidate, peerId) { }
  setupDataChannels(peer) { }
}
```

### 4. UI Modules

#### UIManager.js
```javascript
export class UIManager {
  constructor(eventBus) { }
  initialize() { }
  updateStatus(status) { }
  updateSynthList(peers) { }
  updateLatency(latency) { }
}
```

#### ParameterControls.js
```javascript
export class ParameterControls {
  constructor(paramIds, eventBus) { }
  initialize() { }
  getValue(paramId) { }
  setValue(paramId, value) { }
  onParameterChange(handler) { }
}
```

### 5. Audio Modules

#### ExpressionManager.js
```javascript
export class ExpressionManager {
  constructor(eventBus, chordManager) { }
  selectFrequency(freq) { }
  clearChord() { }
  assignNoteToSynth(synthId) { }
  getCurrentExpressions() { }
}
```

#### ChordManager.js
```javascript
export class ChordManager {
  constructor(eventBus) { }
  addNote(frequency) { }
  removeNote(frequency) { }
  clear() { }
  getCurrentChord() { }
  distributeNotes(synthCount) { }
}
```

## Implementation Plan

### Phase 1: Setup Infrastructure (2 hours)
1. Create module directory structure
2. Set up ES6 module loader (or bundler config)
3. Create base classes (Logger, EventBus, Config)
4. Set up module exports/imports

### Phase 2: Extract Core Systems (3 hours)
1. Extract and enhance Logger
2. Create centralized Config
3. Implement EventBus for decoupling
4. Extract all constants to Constants.js

### Phase 3: Refactor State Management (3 hours)
1. Extract AppState as a proper class
2. Refactor ProgramManager to use AppState
3. Remove global variables
4. Implement state subscription pattern

### Phase 4: Modularize Network Layer (4 hours)
1. Extract WebSocketManager
2. Extract WebRTCManager
3. Create MessageHandler for protocol
4. Remove duplicate connection code

### Phase 5: Refactor UI Components (4 hours)
1. Extract UIManager
2. Create ParameterControls module
3. Extract PianoKeyboard
4. Create StatusDisplay module

### Phase 6: Audio System Modules (3 hours)
1. Extract ExpressionManager
2. Create ChordManager
3. Extract HarmonicRatios
4. Move audio utilities

### Phase 7: Integration & Testing (3 hours)
1. Create main app.js entry point
2. Wire up all modules
3. Create legacy compatibility layer
4. Test all functionality

### Phase 8: Cleanup (2 hours)
1. Remove old ctrl-main-logic.js
2. Update HTML imports
3. Remove duplicate code
4. Update documentation

## Migration Strategy

### Step 1: Parallel Development
- Keep ctrl-main-logic.js running
- Build modules alongside
- Test incrementally

### Step 2: Gradual Migration
```javascript
// In ctrl-main-logic.js
import { Logger } from './modules/core/Logger.js';
import { AppState } from './modules/state/AppState.js';

// Replace gradually
window.log = Logger.log;
window.appState = new AppState();
```

### Step 3: Feature Flag
```javascript
const USE_MODULAR = localStorage.getItem('use-modular') === 'true';

if (USE_MODULAR) {
  import('./app.js');
} else {
  import('./ctrl-main-logic.js');
}
```

## Benefits

### Code Quality
- **Maintainability:** Clear module boundaries
- **Testability:** Each module can be unit tested
- **Reusability:** Modules can be reused in other projects
- **Type Safety:** Ready for TypeScript migration

### Performance
- **Tree Shaking:** Only load needed modules
- **Lazy Loading:** Load modules on demand
- **Caching:** Better browser caching per module

### Developer Experience
- **Findability:** Easy to locate functionality
- **Debugging:** Clearer stack traces
- **Onboarding:** New developers understand structure

## Success Metrics
- [ ] File size reduced by 30%+ (logging cleanup + deduplication)
- [ ] No global variables (except legacy compatibility)
- [ ] All functionality preserved
- [ ] Load time improved
- [ ] Zero console errors
- [ ] Passes all manual tests

## Risk Mitigation
1. **Backward Compatibility:** Keep legacy wrappers temporarily
2. **Testing:** Test each module in isolation
3. **Rollback Plan:** Feature flag for quick rollback
4. **Incremental Release:** Deploy modules gradually

## Estimated Timeline
- **Total Duration:** 24 hours of development
- **Calendar Time:** 1-2 weeks (working part-time)
- **Testing:** Additional 4 hours
- **Documentation:** 2 hours

## Next Steps
1. Get approval for architecture
2. Set up build tooling (if needed)
3. Create module skeleton
4. Begin Phase 1 implementation