# Arc Parameters Implementation Summary

## Overview
This document summarizes the implementation of Monome Arc hardware control for three parameters in the string.assembly.fm synthesizer: volume, brightness, and detune.

## Implementation Details

### 1. Volume Control
- **Arc Encoder**: First encoder (index 0)
- **Parameter Range**: 0.0 to 1.0
- **Implementation**: Uses AudioParam ramping with 200ms transitions
- **Throttling**: 100ms between updates
- **Behavior**: Smooth volume fades without clicks or pops

### 2. Brightness Control
- **Arc Encoder**: Second encoder (index 1)
- **Parameter Range**: 0.0 to 1.0
- **Implementation**: Direct parameter updates (no ramping) to avoid filter artifacts
- **Throttling**: 100ms between updates
- **Behavior**: Immediate filter cutoff changes, processed at k-rate in the worklet

### 3. Detune Control
- **Arc Encoder**: Third encoder (index 2)
- **Parameter Range**: 0.0 to 1.0
- **Implementation**: 
  - Uses Simplex noise for organic meandering
  - Quadratic response curve for fine control near zero
  - Maximum detune of ±12 semitones (1 octave)
  - Noise rate: 0.005555555556 Hz (3-minute period)
  - Affects both excitation and string resonator frequencies
- **Throttling**: 100ms between updates
- **Behavior**: Natural pitch drift that creates ensemble-like detuning

## Technical Architecture

### Message Flow
1. Arc hardware → ArcManager (via Web Serial API)
2. ArcManager → EventBus ("arc:parameterChanged" events)
3. Controller → NetworkCoordinator (throttled sends)
4. WebRTC DataChannel → Synth clients
5. SynthClient → SynthCore → AudioWorklet

### Throttling Strategy
- Immediate send on first change
- Subsequent changes throttled to 1 per 100ms
- Pending values sent after throttle period expires
- Parameter-specific throttle times supported

### Cross-Browser Compatibility
- Firefox-friendly AudioParam scheduling
- Current value captured before cancelScheduledValues
- Tested in Firefox, Chrome, and Brave

## Key Implementation Files

### Controller Side
- `/public/js/modules/hardware/ArcManager.js` - Arc hardware interface
- `/public/js/apps/controller-app.js` - Arc event handling and throttling
- `/public/js/protocol/MessageProtocol.js` - Command definitions

### Synth Side
- `/public/js/apps/synth-app.js` - Command reception
- `/public/js/modules/synth/SynthClient.js` - Parameter methods
- `/src/synth/synth-core.js` - AudioParam ramping
- `/src/worklets/bowed_string_worklet.js` - DSP implementation

## Simplex Noise Implementation
The detune parameter uses a custom Simplex noise implementation:
- 2D noise sampled with time and seed dimensions
- Independent noise per synth instance
- Continuous background generation (even when detune = 0)
- Efficient gradient-based algorithm
- Natural, organic movement patterns

## Future Considerations
- A-rate brightness processing for smoother filter sweeps (see `/docs/proposals/brightness-a-rate-proposal.md`)
- Additional Arc parameters (reverb is provisioned but not implemented)
- Parameter recording and automation
- Preset morphing with Arc control