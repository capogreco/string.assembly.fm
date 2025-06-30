String Assembly FM System Specification (Draft)**

### **Overview**
String Assembly FM is a distributed bowed string synthesizer where one controller manages multiple synth clients via WebRTC, with WebSocket for discovery/signaling.

### **Architecture**

#### **Client Types**
1. **Controller** (`/ctrl`) - Parameter control, chord selection, expression assignment
2. **Synth** (`/index.html`) - Audio synthesis engine
3. **Ensemble** (`/ensemble`) - Multiple synth instances for testing/development

#### **Entry Points**
- `public/js/apps/controller-app.js` - Controller initialization
- `public/js/apps/synth-app.js` - Single synth initialization
- `public/js/apps/ensemble-app.js` - Multi-synth initialization
- `public/js/module-loader.js` - Detects page type and loads correct app

### **Connection Model**

#### **Discovery & Signaling**
- WebSocket (`ws://` or `wss://`) for discovery and WebRTC signaling
- Server tracks active controllers and synths
- Automatic reconnection on disconnect (2 second delay)

#### **Data Transport**
- WebRTC data channels for low-latency parameter updates
- Controller → Synth unidirectional program flow
- ICE servers configurable (defaults to Google STUN)

### **Program Distribution Model**

#### **Push-Only Architecture**
- Controllers automatically push programs to newly connected synths
- Synths NEVER request programs
- Programs can arrive at any time and are stored until needed

#### **Program Message Structure**
```javascript
{
  type: "program",
  program: {
    parameters: { bowPressure, bowSpeed, ... },
    parts: {
      "synth-id": {
        frequency: 440.0,
        note: "A4",
        expression: { type: "vibrato", ... }
      }
    },
    transitions: { duration, stagger, durationSpread, glissando }
  },
  power: boolean,
  timestamp: number
}
```

### **State Management**

#### **Unified AppState Structure**
```javascript
{
  performance: {
    currentProgram: { parameters, parts, chord, transitions }
  },
  system: {
    audio: { power, masterGain, calibrated },
    debug: { enabled, categories }
  },
  connections: {
    synths: Map<synthId, { connected, latency }>,
    websocket: { connected, reconnecting }
  },
  ui: {
    piano: { selectedNotes, playingNotes },
    parameters: { changed, focused },
    banking: { currentBank, lastSaved }
  },
  banking: {
    banks: Map<bankNumber, Array<Program>>
  }
}
```

### **Sound Production Rules**

A synth produces sound when **ALL** conditions are met:
1. ✅ Has received a valid program
2. ✅ Power is ON in the program
3. ✅ Has a part assignment for its ID
4. ✅ Not in calibration mode
5. ✅ AudioContext initialized (user gesture completed)
6. ✅ Bow pressure > 0 (physics constraint)

### **Key Behaviors**

#### **Connection Timing Independence**
- System works regardless of controller/synth start order
- Synths joining late receive current program immediately
- Controllers joining late send program to all synths

#### **Empty Program Handling**
- No chord selected = empty parts assignments = all synths silent
- Synths with no assignment in current program go silent
- No lingering sounds from previous programs

#### **Calibration Flow**
1. User clicks "Calibrate Volume"
2. Pink noise plays at reference level
3. User adjusts device volume
4. User clicks "Join Instrument"
5. Synth applies any stored program

#### **Expression System**
- **Vibrato**: Vertical drag on piano key
- **Trill**: Horizontal drag between keys
- **Tremolo**: Downward drag on piano key
- Harmonic ratio groups allow multiple selections (min 1)

### **Configuration**
All config centralized in `public/js/config/system.config.js`:
- Network settings (reconnect delays, ICE servers)
- Audio parameters (ranges, defaults, worklet paths)
- UI constants (colors, ranges)
- System defaults (ensemble count, storage keys)

### **Message Protocol**
Defined in `public/js/protocol/MessageProtocol.js`:
- `PROGRAM`: Complete performance state
- `COMMAND`: Power on/off
- `SAVE_TO_BANK` / `LOAD_FROM_BANK`: Banking operations
- WebRTC signaling: `OFFER`, `ANSWER`, `ICE`

### **Component Responsibilities**

#### **PartManager**
- Chord-to-synth distribution (stochastic/harmonic)
- Transition calculations
- Expression parameter application

#### **NetworkCoordinator**
- WebRTC connection management
- Program broadcasting
- Connection state tracking

#### **SynthClient**
- Unified synth behavior for all contexts
- Program storage and application
- Calibration management
- Audio graph setup

#### **PianoKeyboard**
- Note visualization
- Gesture detection
- Expression assignment

### **Future Considerations**
- Reverb and detune controls (UI exists, not implemented)
- Larger ensemble support (currently 6-12 synths)
- Expression parameter recording/playback
- MIDI input support

This specification reflects the system after recent architectural improvements including state consolidation, unified config, simplified program distribution, and removal of legacy code.
