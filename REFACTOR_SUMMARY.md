# Expression Transition Refactor Summary

## Overview
We've successfully refactored the bowed string synthesizer worklet to implement smooth, click-free transitions between expression modes (vibrato, tremolo, trill) using a hub-and-spoke model with rate-dominant transitions.

## Key Changes Implemented

### 1. State Machine Architecture
- Added `expressionState` object to track:
  - `current`: Currently active expression
  - `target`: Where we're transitioning to
  - `finalTarget`: Ultimate destination for two-stage transitions
  - `phase`: Current transition phase (IDLE, STOPPING, WAITING, STARTING)
  - `stopProgress` & `startProgress`: Transition progress tracking

### 2. Hub-and-Spoke Model
- All transitions must go through NONE
- Direct transitions (e.g., VIBRATO → TREMOLO) automatically route through NONE
- Ensures clean separation between expression modes

### 3. Rate-Dominant Transitions
- Expression rate (speed) is the primary driver of transitions
- Depth/intensity follows separate curves:
  - **Starting**: Depth comes in quickly (reaches full at 50% rate progress)
  - **Stopping**: Depth lingers longer (slower fade using power curves)

### 4. Natural Stopping Points
- **Vibrato**: Can stop at any phase point
- **Tremolo**: Stops at stroke boundaries (phase < 0.05, > 0.95, or mid-stroke)
- **Trill**: Stops between notes (phase < 0.05 or between 0.45-0.55)

### 5. Removed Phase Resets
- All phase accumulators continue running even when expressions are "off"
- Eliminates clicks caused by sudden phase jumps
- Phases only advance when effective rate > 0

### 6. New Message Handler
- Added `setExpression` message type
- Enforces hub-and-spoke routing
- Handles interrupted transitions smoothly

### 7. Master Progress Tracking
- `vibratoMasterProgress`, `tremoloMasterProgress`, `trillMasterProgress`
- Unified progress values (0-1) for each expression
- Used to derive rate and depth modulation factors

## Expression Processing Changes

### Old Approach:
```javascript
// Mutually exclusive with hard switches
if (vibratoEnabled && !trillEnabled && !tremoloEnabled) {
  this.vibratoActive = true;
  // ...
} else {
  this.vibratoPhase = 0.0; // Click!
}
```

### New Approach:
```javascript
// Smooth transitions with rate-dominant control
if (this.vibratoMasterProgress > 0.001) {
  const vibratoRateModFactor = this.vibratoMasterProgress;
  const effectiveVibratoRate = vibratoRate * vibratoRateModFactor;
  
  // Depth follows different curve
  let vibratoDepthModFactor = /* curve calculation */;
  const effectiveVibratoDepth = vibratoDepth * vibratoDepthModFactor;
  
  // Always update phase, apply modulation based on effective values
}
```

## Testing Features

### Debug Output
- Sends state and progress information every 1000 samples
- Helps monitor transition phases and progress values

### Test HTML Interface
- Expression control buttons
- Test sequences for basic transitions, hub-and-spoke, and interruptions
- Real-time status display
- Debug log for tracking transitions

## Benefits Achieved

1. **Click-Free Transitions**: No more abrupt state changes
2. **Musical Naturalness**: Expressions slow down/speed up like real performance
3. **Predictable Behavior**: Clear state machine with well-defined phases
4. **Smooth Interruptions**: Can reverse transitions mid-flight
5. **Physical Realism**: Models how violinists actually transition between techniques

## Usage

### Basic Transition:
```javascript
audioWorkletNode.port.postMessage({
  type: 'setExpression',
  expression: 'VIBRATO' // or 'TREMOLO', 'TRILL', 'NONE'
});
```

### Transition Flow Examples:
- **NONE → VIBRATO**: Direct transition with rate ramping up, depth coming in quickly
- **VIBRATO → TREMOLO**: Automatically routes through NONE (VIBRATO → NONE → TREMOLO)
- **Interrupted**: VIBRATO → (partial) → NONE → (reverse) → VIBRATO

## Next Steps

1. **Fine-tune transition curves**: Adjust the math functions for rate/depth mapping
2. **Test with real musical contexts**: Verify transitions sound natural in performance
3. **Consider adding transition speed control**: Allow fast/slow transition modes
4. **Extend to other parameters**: Apply similar smoothing to bow parameters if needed