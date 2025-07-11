# Reverb Arc Parameter Implementation Guide

## Overview
This guide provides complete instructions for implementing reverb as the fourth Arc parameter in string.assembly.fm. The reverb will use a single encoder to control multiple correlated reverb characteristics, creating a journey from dry studio to cathedral space.

## Architecture Overview

### Signal Flow
```
Synth Worklet → Reverb Worklet → Audio Output
                ↑
         Arc Parameter (0-1)
```

### Key Components
1. **Reverb Processor** - FDN reverb worklet from reference implementation
2. **Arc Integration** - Fourth encoder mapping to reverb space parameter
3. **Parameter Mapping** - Single value controls multiple reverb characteristics
4. **Network Protocol** - Command routing from controller to synths

## Implementation Steps

### Step 1: Copy Reverb Processor

Copy the reverb processor from the reference implementation:
```bash
cp string.assembly.fm/reference/bowed_synthesis_test/app/reverb-processor.js \
   string.assembly.fm/public/worklets/reverb-processor.js
```

### Step 2: Add Reverb Space Mapping Function

Create `string.assembly.fm/public/js/modules/audio/ReverbController.js`:

```javascript
/**
 * ReverbController - Manages reverb parameter mapping for Arc control
 */
export class ReverbController {
  /**
   * Maps a single Arc value (0-1) to multiple reverb parameters
   * Creates a coherent journey from dry to massive cathedral
   * 
   * @param {number} arcValue - Arc encoder value (0.0 to 1.0)
   * @returns {Object} Object with all reverb parameters
   */
  static mapArcToReverbSpace(arcValue) {
    // Non-linear scaling for better control distribution
    const position = Math.pow(arcValue, 1.2); // Slightly exponential
    
    let params = {};
    
    if (position < 0.05) {
      // Nearly dry - just a hint of space
      params = {
        mix: position * 4,              // 0.0 → 0.2
        roomSize: 0.1,                  // Tiny
        decay: 0.1,                     // Very short
        damping: 0.9,                   // Very damped
        preDelay: 0,                    // No pre-delay
        diffusion: 0.3,                 // Low diffusion
        modulation: 0.05,               // Minimal movement
        earlyLevel: 0.9                 // Mostly early reflections
      };
      
    } else if (position < 0.25) {
      // Small room - intimate space
      const local = (position - 0.05) / 0.2;
      params = {
        mix: 0.2 + local * 0.15,       // 0.2 → 0.35
        roomSize: 0.1 + local * 0.2,   // 0.1 → 0.3
        decay: 0.1 + local * 0.3,      // 0.1 → 0.4
        damping: 0.9 - local * 0.3,    // 0.9 → 0.6
        preDelay: local * 10,           // 0 → 10ms
        diffusion: 0.3 + local * 0.3,  // 0.3 → 0.6
        modulation: 0.05 + local * 0.1, // 0.05 → 0.15
        earlyLevel: 0.9 - local * 0.3  // 0.9 → 0.6
      };
      
    } else if (position < 0.5) {
      // Medium room - chamber/studio
      const local = (position - 0.25) / 0.25;
      params = {
        mix: 0.35 + local * 0.1,       // 0.35 → 0.45
        roomSize: 0.3 + local * 0.25,  // 0.3 → 0.55
        decay: 0.4 + local * 0.2,      // 0.4 → 0.6
        damping: 0.6 - local * 0.15,   // 0.6 → 0.45
        preDelay: 10 + local * 15,     // 10 → 25ms
        diffusion: 0.6 + local * 0.15, // 0.6 → 0.75
        modulation: 0.15 + local * 0.05,// 0.15 → 0.2
        earlyLevel: 0.6 - local * 0.15 // 0.6 → 0.45
      };
      
    } else if (position < 0.75) {
      // Large hall
      const local = (position - 0.5) / 0.25;
      params = {
        mix: 0.45 + local * 0.05,      // 0.45 → 0.5 (plateau)
        roomSize: 0.55 + local * 0.2,  // 0.55 → 0.75
        decay: 0.6 + local * 0.15,     // 0.6 → 0.75
        damping: 0.45 - local * 0.1,   // 0.45 → 0.35
        preDelay: 25 + local * 10,     // 25 → 35ms
        diffusion: 0.75 + local * 0.1, // 0.75 → 0.85
        modulation: 0.2 + local * 0.05, // 0.2 → 0.25
        earlyLevel: 0.45 - local * 0.1 // 0.45 → 0.35
      };
      
    } else {
      // Cathedral - maximum space
      const local = (position - 0.75) / 0.25;
      params = {
        mix: 0.5,                       // Keep mix at 50% max
        roomSize: 0.75 + local * 0.15, // 0.75 → 0.9
        decay: 0.75 + local * 0.15,    // 0.75 → 0.9 (capped)
        damping: 0.35 - local * 0.1,   // 0.35 → 0.25
        preDelay: 35 + local * 15,     // 35 → 50ms
        diffusion: 0.85 + local * 0.05,// 0.85 → 0.9
        modulation: 0.25 + local * 0.05,// 0.25 → 0.3
        earlyLevel: 0.35 - local * 0.05// 0.35 → 0.3
      };
    }
    
    return params;
  }

  /**
   * Get human-readable description for current reverb setting
   * @param {number} arcValue - Arc encoder value (0.0 to 1.0)
   * @returns {string} Description of the space
   */
  static getSpaceDescription(arcValue) {
    const position = Math.pow(arcValue, 1.2);
    
    if (position < 0.05) return "Dry Studio";
    if (position < 0.25) return "Small Room";
    if (position < 0.5) return "Chamber";
    if (position < 0.75) return "Concert Hall";
    return "Cathedral";
  }
}
```

### Step 3: Update Arc Manager

In `string.assembly.fm/public/js/modules/hardware/ArcManager.js`, update the encoder mapping:

```javascript
// In handleEncoderDelta method, add case for encoder 3:
case 3:
  parameterName = 'reverb';
  break;
```

### Step 4: Update Controller Arc Handler

In `string.assembly.fm/public/js/apps/controller-app.js`, add reverb handling:

```javascript
// In setupArcEventHandlers function, update the parameterMap:
const parameterMap = {
  'volume': 'masterGain',
  'brightness': 'brightness',
  'detune': 'detune',
  'reverb': 'reverb'  // Add this line
};

// The existing throttling and sending logic will handle reverb automatically
```

### Step 5: Update Message Protocol

In `string.assembly.fm/public/js/protocol/MessageProtocol.js`, ensure reverb command is defined:

```javascript
export const CommandNames = {
  POWER: 'power',
  SAVE: 'save',
  LOAD: 'load',
  // Arc parameter commands
  VOLUME: 'volume',
  BRIGHTNESS: 'brightness',
  DETUNE: 'detune',
  REVERB: 'reverb'  // Already defined in the code
};
```

### Step 6: Update Synth Client

In `string.assembly.fm/public/js/modules/synth/SynthClient.js`:

1. Add reverb node property:
```javascript
constructor(synthId, options = {}) {
  // ... existing code ...
  this.reverbNode = null;
  // ... rest of constructor
}
```

2. Add reverb handling in `handleControllerMessage`:
```javascript
} else if (message.name === 'reverb') {
  // Handle reverb parameter from Arc
  Logger.log(`[${this.synthId}] Setting reverb to: ${message.value}`, 'parameters');
  this.setReverb(message.value);
}
```

3. Add reverb setter method:
```javascript
/**
 * Set reverb amount with parameter mapping
 * @param {number} value - Reverb amount (0-1)
 */
setReverb(value) {
  if (!this.audioInitialized || !this.reverbNode) {
    Logger.log(`[${this.synthId}] Cannot set reverb - not initialized`, 'warn');
    return;
  }
  
  // Import the mapping function
  const { ReverbController } = await import('../audio/ReverbController.js');
  
  // Get all correlated parameters for this arc position
  const spaceParams = ReverbController.mapArcToReverbSpace(value);
  
  // Apply all parameters with appropriate ramping
  for (const [paramName, paramValue] of Object.entries(spaceParams)) {
    const param = this.reverbNode.parameters.get(paramName);
    if (param) {
      // Longer ramp for size changes, shorter for others
      const rampTime = paramName === 'roomSize' ? 0.3 : 0.1;
      param.linearRampToValueAtTime(
        paramValue, 
        this.audioContext.currentTime + rampTime
      );
    }
  }
  
  const description = ReverbController.getSpaceDescription(value);
  Logger.log(`[${this.synthId}] Reverb set to ${(value * 100).toFixed(0)}% - ${description}`, 'parameters');
}
```

### Step 7: Update SynthCore

In `string.assembly.fm/src/synth/synth-core.js`:

1. Add reverb initialization in `initialize` method:
```javascript
// After existing worklet loading
await this.audioContext.audioWorklet.addModule('/worklets/reverb-processor.js');

// Create reverb node
this.reverbNode = new AudioWorkletNode(this.audioContext, 'fdn-reverb-processor');

// Store reference for external access
this.synthClient.reverbNode = this.reverbNode;
```

2. Update audio routing in `connectAudioGraph` method:
```javascript
// Update connection chain
this.biquadFilter.disconnect();
this.biquadFilter.connect(this.reverbNode);
this.reverbNode.connect(this.gainNode);
// gainNode already connects to destination
```

### Step 8: Add UI Feedback (Optional)

In `string.assembly.fm/public/ctrl.html`, add reverb indicator in Arc Parameters section:

```html
<div class="arc-param" data-param="reverb">
  <div class="param-label">Reverb</div>
  <div class="param-value">
    <span id="reverbValue">0</span>%
    <div class="param-description" id="reverbDescription">Dry Studio</div>
  </div>
</div>
```

Update the Arc event handler to show the space description:

```javascript
// In controller-app.js setupArcEventHandlers
if (parameterMap[data.parameter] === 'reverb') {
  const description = ReverbController.getSpaceDescription(data.value);
  const descElement = document.getElementById('reverbDescription');
  if (descElement) {
    descElement.textContent = description;
  }
}
```

## Testing Procedure

### 1. Initial Setup
- Connect Arc hardware
- Open controller and at least one synth
- Verify first three encoders still work (volume, brightness, detune)

### 2. Reverb Testing
- Turn fourth encoder slowly from 0 to 100%
- Verify smooth transitions between spaces:
  - 0-5%: Nearly dry
  - 5-25%: Small room
  - 25-50%: Chamber
  - 50-75%: Concert hall
  - 75-100%: Cathedral

### 3. Edge Cases
- Rapid encoder movements
- Switching between extremes
- Testing with different synthesis parameters
- Multiple synths with different reverb settings

### 4. Performance
- Monitor CPU usage with reverb at maximum
- Check for audio glitches during parameter changes
- Verify no clicks or pops during transitions

## Troubleshooting

### Common Issues

1. **No reverb effect**
   - Check worklet file is loaded
   - Verify audio routing in SynthCore
   - Check reverb node exists in synth client

2. **Clicking during changes**
   - Increase ramp times for parameters
   - Check for parameter value bounds
   - Verify smooth interpolation in mapping

3. **CPU overload**
   - Reduce reverb complexity (fewer delay lines)
   - Optimize worklet processing
   - Consider sample rate reduction for reverb

4. **Network delays**
   - Check throttling is working (100ms)
   - Verify WebRTC connection quality
   - Monitor message queuing

## Performance Considerations

- Reverb adds ~5-10% CPU per synth
- Memory usage increases by ~2MB per reverb instance
- Network traffic minimal (throttled to 10 messages/second)

## Future Enhancements

1. **Reverb Freeze** - Hold current reverb tail indefinitely
2. **Per-Synth Reverb** - Different spaces for each synth
3. **Modulation Sync** - Sync reverb modulation to expressions
4. **Spectral Reverb** - Frequency-dependent reverb times