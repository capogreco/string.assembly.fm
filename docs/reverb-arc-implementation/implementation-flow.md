# Reverb Arc Implementation Flow

## Signal Flow Diagram

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ Arc Encoder │────►│  Controller  │────►│   Network    │
│   (0-1)     │     │   (WebRTC)   │     │ Coordinator  │
└─────────────┘     └──────────────┘     └──────────────┘
                                                  │
                                                  ▼
                                         ┌──────────────┐
                                         │ Synth Client │
                                         └──────────────┘
                                                  │
                                                  ▼
                                         ┌──────────────┐
                                         │   Reverb     │
                                         │  Controller  │
                                         └──────────────┘
                                                  │
                                          ┌───────┴───────┐
                                          ▼               ▼
                                   ┌──────────┐    ┌──────────┐
                                   │ Mapping  │    │  Space   │
                                   │ Function │    │  Desc.   │
                                   └──────────┘    └──────────┘
                                          │
                                          ▼
                                   ┌──────────────┐
                                   │    Reverb    │
                                   │   Worklet    │
                                   └──────────────┘
```

## Data Flow

### 1. Arc Input
```javascript
// Arc encoder sends delta
{
  encoder: 3,
  delta: 0.02
}
```

### 2. Controller Processing
```javascript
// ArcManager accumulates value
currentValue = 0.45 + 0.02 = 0.47

// Emit event
eventBus.emit('arc:parameterChanged', {
  parameter: 'reverb',
  value: 0.47
})
```

### 3. Network Transmission
```javascript
// Throttled message (max 10/sec)
{
  type: 'command',
  name: 'reverb',
  value: 0.47,
  timestamp: 1234567890
}
```

### 4. Synth Reception
```javascript
// SynthClient.handleControllerMessage
if (message.name === 'reverb') {
  this.setReverb(message.value);
}
```

### 5. Parameter Mapping
```javascript
// ReverbController.mapArcToReverbSpace(0.47)
{
  mix: 0.44,
  roomSize: 0.52,
  decay: 0.58,
  damping: 0.47,
  preDelay: 23,
  diffusion: 0.73,
  modulation: 0.19,
  earlyLevel: 0.47
}
```

### 6. Worklet Application
```javascript
// Apply each parameter with ramping
reverbNode.parameters.get('mix')
  .linearRampToValueAtTime(0.44, currentTime + 0.1);
reverbNode.parameters.get('roomSize')
  .linearRampToValueAtTime(0.52, currentTime + 0.3);
// ... etc
```

## File Structure

```
string.assembly.fm/
├── public/
│   ├── worklets/
│   │   └── reverb-processor.js        # FDN reverb worklet
│   │
│   ├── js/
│   │   ├── modules/
│   │   │   ├── hardware/
│   │   │   │   └── ArcManager.js      # Add encoder 3 mapping
│   │   │   │
│   │   │   ├── audio/
│   │   │   │   └── ReverbController.js # NEW: Parameter mapping
│   │   │   │
│   │   │   └── synth/
│   │   │       └── SynthClient.js      # Add setReverb method
│   │   │
│   │   └── apps/
│   │       └── controller-app.js       # Already handles arc events
│   │
│   └── ctrl.html                       # Optional: Add UI feedback
│
└── src/
    └── synth/
        └── synth-core.js               # Add reverb node creation
```

## Key Implementation Points

### 1. Throttling
- Arc events are already throttled at 100ms intervals
- First change sends immediately
- Subsequent changes queue and send after throttle period

### 2. Parameter Ramping
- `mix`: 100ms ramp time
- `roomSize`: 300ms ramp time (prevents artifacts)
- All others: 100ms ramp time

### 3. Audio Routing
```javascript
// In SynthCore.connectAudioGraph()
// Before:
biquadFilter → gainNode → destination

// After:
biquadFilter → reverbNode → gainNode → destination
```

### 4. Memory Management
- Reverb node created once during initialization
- Parameters updated via AudioParam automation
- No allocation during parameter changes

### 5. Error Handling
```javascript
// In setReverb method
if (!this.reverbNode) {
  Logger.log('Cannot set reverb - not initialized', 'warn');
  return;
}
```

## Testing Checkpoints

1. **Arc Detection**
   - [ ] Fourth encoder generates events
   - [ ] Events show parameter: 'reverb'
   - [ ] Values range 0.0 to 1.0

2. **Network Flow**
   - [ ] Controller sends reverb commands
   - [ ] Commands are throttled properly
   - [ ] Synths receive commands

3. **Audio Processing**
   - [ ] Reverb worklet loads
   - [ ] Audio routes through reverb
   - [ ] No clicks during changes

4. **Parameter Mapping**
   - [ ] All 8 parameters update
   - [ ] Smooth transitions
   - [ ] Correct space descriptions

5. **Performance**
   - [ ] CPU usage acceptable
   - [ ] No audio dropouts
   - [ ] Network not flooded