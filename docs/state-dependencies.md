# State Dependencies Analysis

## Overview
This document maps which components depend on which state properties, helping us understand the impact of state consolidation changes.

## Current State Dependencies

### 1. performance.currentProgram

#### Readers:
- **ParameterControls**: Displays parameter values in UI
- **NetworkCoordinator**: Sends program to synths
- **ProgramState**: Manages save/load operations
- **PartManager**: Distributes parts based on program

#### Writers:
- **ParameterControls**: Updates from slider/input changes
- **ProgramState**: Loads from banks, captures from UI
- **PianoKeyboard**: Updates chord frequencies
- **PianoExpressionHandler**: Updates note expressions

#### Subscribers:
- **ParameterControls**: `appState.subscribe('currentProgram', callback)`
- **UIManager**: Updates sync status indicator

#### Events:
- `programState:changed` - When any property changes
- `programState:parameterChanged` - When specific parameter changes
- `parameter:changed` - Legacy event

### 2. performance.activeProgram

#### Readers:
- **ProgramState**: For save operations, sync checking
- **NetworkCoordinator**: Reference for what's sent

#### Writers:
- **ProgramState**: `setActiveProgram()` after sending
- **NetworkCoordinator**: Indirectly through ProgramState

#### Subscribers:
- None directly (accessed through methods)

#### Events:
- `programState:synced` - When active program is set

### 3. performance.partAssignments

#### Readers:
- **NetworkCoordinator**: To send correct notes to synths
- **ChordManager**: To track distribution
- **UI Status**: To show assignment count

#### Writers:
- **PartManager**: Main owner, distributes assignments
- **ChordManager**: Updates distribution map

#### Subscribers:
- None directly (event-based updates)

#### Events:
- `partManager:assignmentsUpdated`
- `chord:distributed`

### 4. performance.transitions

#### Readers:
- **NetworkCoordinator**: Includes in program messages
- **PartManager**: Stores transition settings

#### Writers:
- **ParameterControls**: From transition sliders
- **PartManager**: Updates from UI

#### Subscribers:
- None (included in program messages)

#### Events:
- `parameter:changed` for individual transition parameters

### 5. performance.currentProgram.chord

#### Readers:
- **PianoKeyboard**: Display selected notes
- **PartManager**: For distribution
- **ChordManager**: For assignment
- **NetworkCoordinator**: To send with program

#### Writers:
- **PianoKeyboard**: User selection
- **PianoExpressionHandler**: Drag operations
- **ProgramState**: Bank loading

#### Subscribers:
- **ChordManager**: `appState.subscribe('currentChord', callback)`
- **PianoKeyboard**: Via event listener

#### Events:
- `piano:chordChanged`
- `chord:changed`
- `programState:chordChanged`

### 6. performance.currentProgram.harmonicSelections

#### Readers:
- **HarmonicRatioSelector**: Display selections
- **PartManager**: For expression calculations
- **NetworkCoordinator**: Send with program

#### Writers:
- **HarmonicRatioSelector**: User clicks
- **ProgramState**: Bank loading

#### Subscribers:
- **ParameterControls**: `appState.subscribe('harmonicSelections', callback)`

#### Events:
- `harmonics:selectionChanged`
- `programState:harmonicSelectionsChanged`

### 7. connections.synths

#### Readers:
- **UIManager**: Show connection count, status
- **NetworkCoordinator**: Track active connections
- **PartManager**: For distribution decisions
- **ChordManager**: For assignment

#### Writers:
- **NetworkCoordinator**: Add/remove connections
- **WebRTCManager**: Connection state changes

#### Subscribers:
- **UIManager**: For status updates
- **ChordManager**: For redistribution

#### Events:
- `network:synthConnected`
- `network:synthDisconnected`
- `webrtc:peerConnected`
- `webrtc:peerDisconnected`

### 8. connections.websocket

#### Readers:
- **UIManager**: Show connection status
- **NetworkCoordinator**: Check before operations

#### Writers:
- **WebSocketManager**: Connection state changes
- **NetworkCoordinator**: Updates status

#### Subscribers:
- **UIManager**: `appState.subscribe('connectionStatus', callback)`

#### Events:
- `websocket:connected`
- `websocket:disconnected`
- `websocket:error`

### 9. connections.metrics

#### Readers:
- **UIManager**: Display latency, averages
- **Logging**: Performance monitoring

#### Writers:
- **NetworkCoordinator**: From ping/pong
- **AppState**: Calculates averages

#### Subscribers:
- **UIManager**: For display updates

#### Events:
- `network:latencyUpdate`

### 10. ui.piano

#### Readers:
- **PianoKeyboard**: Visual state
- **PianoExpressionHandler**: For interactions

#### Writers:
- **PianoKeyboard**: User interactions
- **PianoExpressionHandler**: Drag operations

#### Subscribers:
- None (internal to component)

#### Events:
- `piano:notePressed`
- `piano:noteReleased`

### 11. ui.parameters

#### Readers:
- **ParameterControls**: Show changed state
- **NetworkCoordinator**: Check what to send
- **UIManager**: Sync status

#### Writers:
- **ParameterControls**: Track changes
- **NetworkCoordinator**: Clear after send

#### Subscribers:
- **UIManager**: For sync indicator

#### Events:
- `parameter:changed`
- `parameter:sent`

### 12. ui.expressions

#### Readers:
- **ParameterControls**: Show/hide groups
- **PianoExpressionHandler**: Current mode

#### Writers:
- **ParameterControls**: Radio selection
- **ProgramState**: Bank loading

#### Subscribers:
- **ParameterControls**: `appState.subscribe('selectedExpression', callback)`

#### Events:
- `expression:changed`

### 13. banking.banks

#### Readers:
- **Banking UI**: Display saved banks
- **ProgramState**: Load operations
- **Keyboard shortcuts**: Number keys

#### Writers:
- **ProgramState**: Save/clear operations
- **ProgramManager**: Legacy compatibility

#### Subscribers:
- **Banking UI**: Updates display

#### Events:
- `programState:bankSaved`
- `programState:bankLoaded`
- `programState:banksCleared`

### 14. system.audio

#### Readers:
- **NetworkCoordinator**: Include in messages
- **UIManager**: Power state display

#### Writers:
- **ParameterControls**: Power checkbox
- **Master controls**: Volume, power

#### Subscribers:
- None currently

#### Events:
- `system:powerChanged`
- `system:volumeChanged`

## Dependency Graph

```
┌─────────────────────────────────────────────────────────┐
│                     AppState (Root)                     │
└────────────────────────┬────────────────────────────────┘
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
    ▼                    ▼                    ▼
┌─────────┐        ┌──────────┐        ┌────────────┐
│Performance│      │Connections│        │   Banking   │
└─────┬─────┘      └─────┬─────┘        └──────┬──────┘
      │                  │                      │
      ├──► PartManager   ├──► NetworkCoord     ├──► ProgramState
      │                  │                      │
      ├──► ChordManager  ├──► WebSocketMgr     └──► Banking UI
      │                  │
      ├──► ParamControls └──► WebRTCManager
      │
      └──► PianoKeyboard
```

## Circular Dependencies

### 1. AppState ↔ ProgramState
- **Issue**: Both reference each other during migration
- **Solution**: Complete migration to single source

### 2. PartManager ↔ ChordManager
- **Issue**: Both manage chord distribution
- **Solution**: Merge into single PartManager

### 3. NetworkCoordinator ↔ Managers
- **Issue**: Circular event flow
- **Solution**: Unidirectional data flow

## State Flow Patterns

### 1. User Input → State → UI
```
User Action → Component → State Update → Subscribers → UI Update
Example: Slider → ParameterControls → AppState → NetworkCoordinator → Send
```

### 2. Network → State → UI
```
WebSocket Message → Manager → State Update → Subscribers → UI Update
Example: Synth Connect → NetworkCoordinator → AppState → UIManager → Display
```

### 3. Bank Operations
```
Load Bank → ProgramState → Update Multiple States → UI Updates → Events
Example: Bank 1 → Load → Parameters, Chord, Expressions → UI → Send Event
```

## High-Impact State Properties

Properties that affect many components (migration priority):

1. **performance.currentProgram** (8+ components)
2. **connections.synths** (6+ components)
3. **performance.currentProgram.chord** (5+ components)
4. **ui.parameters.changed** (4+ components)
5. **banking.banks** (3+ components)

## Low-Impact State Properties

Properties with limited scope (can migrate last):

1. **ui.modals** (1 component)
2. **system.debug** (Logger only)
3. **history** (Future feature)
4. **ui.piano.instrumentRange** (PianoKeyboard only)

## Migration Risks

### High Risk:
- **performance.currentProgram**: Central to everything
- **connections.synths**: Real-time updates critical
- **Event flow**: Must maintain compatibility

### Medium Risk:
- **banking.banks**: LocalStorage persistence
- **ui.parameters**: User interaction feedback
- **performance.partAssignments**: Distribution logic

### Low Risk:
- **ui.modals**: Simple boolean states
- **system.debug**: Independent subsystem
- **metrics**: Calculated values

## Recommendations

1. **Start with Low-Impact**: Build confidence
2. **Test Thoroughly**: Each migration step
3. **Maintain Compatibility**: During transition
4. **Monitor Performance**: Watch for regressions
5. **Document Changes**: Update as you go