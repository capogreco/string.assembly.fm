# Violinist-Style Expression Transition Implementation

## Overview
This document outlines the implementation of realistic expression transitions that mimic how a violinist naturally moves between vibrato, tremolo, and trill techniques.

## Core Principles

1. **Sequential, Not Parallel**: Only one expression active at a time.
2. **Hub-and-Spoke Model**: All transitions must pass through NONE as the central state. No direct transitions between expressions (e.g., VIBRATO → TREMOLO must go VIBRATO → NONE → TREMOLO).
3. **Rate-Dominant Transitions**: The speed/rate of an expression is the primary element ramped during starts and stops, with intensity/depth following a related but potentially different curve.
4. **Natural Stopping Points**: Each expression aims to complete its current cycle or reach a natural pause point before ceasing.
5. **Physical Realism**: Model the physical constraints and common techniques of violin playing.
6. **Musical Timing**: Transitions are designed to occur at musically appropriate moments and speeds.

## Implementation Architecture

### 1. Expression State Machine

```javascript
// Add to constructor
this.expressionState = {
  current: 'NONE',
  target: 'NONE',
  finalTarget: null, // For two-stage transitions (e.g., VIBRATO → NONE → TREMOLO)
  phase: 'IDLE', // IDLE, STOPPING, WAITING, STARTING
  stopProgress: 0.0,
  startProgress: 0.0
};

// Natural transition parameters
// stopRate/startRate control the speed of the overall transition envelope progress.
this.transitionParams = {
  vibrato: {
    stopRate: 0.002,    // Speed of transition envelope fading out
    startRate: 0.003,   // Speed of transition envelope fading in
    canStopAt: () => true  // For vibrato, the fade can begin at any phase point
  },
  tremolo: {
    stopRate: 0.01,     // Speed of transition envelope fading out
    startRate: 0.005,   // Speed of transition envelope fading in
    canStopAt: () => {  // Tremolo aims to stop at stroke boundaries
      return this.tremoloPhase < 0.05 || this.tremoloPhase > 0.95 ||
             (this.tremoloPhase > 0.45 && this.tremoloPhase < 0.55);
    }
  },
  trill: {
    stopRate: 0.02,     // Speed of transition envelope fading out
    startRate: 0.01,    // Speed of transition envelope fading in
    canStopAt: () => {  // Trill aims to stop between notes or at cycle completion
      return this.trillPhase < 0.05 || 
             (this.trillPhase > 0.45 && this.trillPhase < 0.55);
    }
  }
};
```

### 2. Transition Logic

```javascript
_updateExpressionState() {
  const state = this.expressionState;
  
  switch(state.phase) {
    case 'IDLE':
      // Check if we need to start a transition
      if (state.current !== state.target) {
        // Enforce hub-and-spoke: must go through NONE
        if (state.current !== 'NONE' && state.target !== 'NONE') {
          // Can't go directly between expressions - must stop current first
          state.target = 'NONE';
          state.finalTarget = event.data.expression; // Store ultimate destination
        }
        state.phase = 'STOPPING';
        state.stopProgress = 0.0;
      }
      break;
      
    case 'STOPPING':
      if (state.current === 'NONE') {
        // No expression to stop, go directly to starting
        state.phase = 'STARTING';
        state.startProgress = 0.0;
      } else {
        // Handle interrupted transitions
        if (state.target === state.current) {
          // User wants to go back - reverse direction
          state.phase = 'STARTING';
          state.startProgress = 1.0 - state.stopProgress;
          break;
        }
        
        const params = this.transitionParams[state.current.toLowerCase()];
        
        // Check if we can stop at this point
        if (params.canStopAt()) {
          state.stopProgress += params.stopRate;
          
          if (state.stopProgress >= 1.0) {
            // Fully stopped
            state.phase = 'WAITING';
            this._resetExpressionState(state.current);
          }
        }
      }
      break;
      
    case 'WAITING':
      // Brief pause between expressions
      state.current = 'NONE';
      
      // Check if we have a final target to reach
      if (state.finalTarget && state.finalTarget !== 'NONE') {
        state.target = state.finalTarget;
        state.finalTarget = null;
      }
      
      state.phase = 'STARTING';
      state.startProgress = 0.0;
      break;
      
    case 'STARTING':
      if (state.target === 'NONE') {
        // No expression to start
        state.current = 'NONE';
        state.phase = 'IDLE';
      } else {
        // Handle interrupted transitions
        if (state.target === 'NONE' && state.current !== 'NONE') {
          // User wants to go back to NONE - reverse
          state.phase = 'STOPPING';
          state.stopProgress = 1.0 - state.startProgress;
          break;
        }
        
        const params = this.transitionParams[state.target.toLowerCase()];
        state.startProgress += params.startRate;
        
        if (state.startProgress >= 1.0) {
          // Fully started
          state.current = state.target;
          state.phase = 'IDLE';
          state.startProgress = 1.0;
        }
      }
      break;
  }
}

_resetExpressionState(expression) {
  // Maintain phase continuity but reset other state
  switch(expression) {
    case 'VIBRATO':
      // Don't reset phase, just state flags
      this.vibratoActive = false;
      break;
    case 'TREMOLO':
      this.tremoloActive = false;
      this.tremoloStrokeCount = 0;
      this.lastTremoloState = 0;
      break;
    case 'TRILL':
      this.trillActive = false;
      this.lastTrillState = 0;
      break;
  }
}
```

### 3. Modified Expression Processing

The core idea is that a master `transitionProgress` (derived from `state.stopProgress` or `state.startProgress`) is calculated by `_updateExpressionState()`. This `transitionProgress` (ranging 0 to 1, where 1 means fully active) is then mapped to specific rate and depth/intensity modulation factors for each expression.

```javascript
// In process() method, after _updateExpressionState();

// Master transition progress for the currently transitioning expression
let masterTransitionProgress = 0.0;
const state = this.expressionState;

if (state.phase === 'IDLE' && state.current !== 'NONE') {
  masterTransitionProgress = 1.0; // Fully active
} else if (state.phase === 'STARTING') {
  masterTransitionProgress = state.startProgress;
} else if (state.phase === 'STOPPING') {
  masterTransitionProgress = 1.0 - state.stopProgress;
}
masterTransitionProgress = Math.max(0.0, Math.min(1.0, masterTransitionProgress));

// --- Process Vibrato ---
// vibratoRateParam and vibratoDepthParam are the target values from AudioParams
let effectiveVibratoRate = 0.0;
let effectiveVibratoDepth = 0.0;

if (state.current === 'VIBRATO' || (state.phase === 'STARTING' && state.target === 'VIBRATO') || (state.phase === 'STOPPING' && state.current === 'VIBRATO')) {
  // Rate is primarily driven by masterTransitionProgress
  const vibratoRateModFactor = masterTransitionProgress;
  effectiveVibratoRate = vibratoRateParam * vibratoRateModFactor;

  // Depth ramps differently: comes in faster, fades out later
  let vibratoDepthModFactor = 0.0;
  if (state.phase === 'STARTING') {
    // Depth comes in quicker than rate: e.g., reaches full depth when rate is at 50%
    vibratoDepthModFactor = Math.min(1.0, masterTransitionProgress * 2.0); 
  } else if (state.phase === 'STOPPING') {
    // Depth stays fuller longer: e.g., only starts fading significantly when rate is below 50%
    vibratoDepthModFactor = Math.pow(masterTransitionProgress, 0.5); 
  } else { // IDLE and current is VIBRATO
    vibratoDepthModFactor = 1.0;
  }
  effectiveVibratoDepth = vibratoDepthParam * vibratoDepthModFactor;

  // Always update phase, even if rate is zero (phase just won't advance)
  this.vibratoPhase += effectiveVibratoRate / this.sampleRate;
  if (this.vibratoPhase >= 1.0) this.vibratoPhase -= 1.0;
  
  if (effectiveVibratoDepth > 0.001) { // Only apply modulation if depth is significant
    const vibratoValue = Math.sin(2 * Math.PI * this.vibratoPhase);
    pitchModulation = 1.0 + vibratoValue * effectiveVibratoDepth * 0.06;
    ampModulation = 1.0 + vibratoValue * effectiveVibratoDepth * 0.2;
  }
}


// --- Process Tremolo --- (conceptual example, specific curves TBD)
// tremoloSpeedParam and tremoloDepthParam are target values
let effectiveTremoloSpeed = 0.0;
let effectiveTremoloDepth = 0.0; // This is for amplitude modulation intensity

if (state.current === 'TREMOLO' || (state.phase === 'STARTING' && state.target === 'TREMOLO') || (state.phase === 'STOPPING' && state.current === 'TREMOLO')) {
  const tremoloRateModFactor = masterTransitionProgress;
  effectiveTremoloSpeed = tremoloSpeedParam * tremoloRateModFactor;

  let tremoloDepthModFactor = 0.0;
  // Example: Depth ramps similarly to vibrato or with its own curve
  if (state.phase === 'STARTING') {
    tremoloDepthModFactor = Math.min(1.0, masterTransitionProgress * 1.5); 
  } else if (state.phase === 'STOPPING') {
    tremoloDepthModFactor = Math.pow(masterTransitionProgress, 0.6);
  } else { // IDLE
    tremoloDepthModFactor = 1.0;
  }
  effectiveTremoloDepth = tremoloDepthParam * tremoloDepthModFactor;
  
  this.tremoloPhase += effectiveTremoloSpeed / this.sampleRate;
  // ... rest of tremolo calculations using effectiveTremoloSpeed and effectiveTremoloDepth
  // Ensure that the amplitude modulation part of tremolo uses effectiveTremoloDepth.
}


// --- Process Trill --- (conceptual example, specific curves TBD)
// trillSpeedParam and trillArticulationParam are target values
let effectiveTrillSpeed = 0.0;
// For trill, "depth" might be how much it affects amplitude or the clarity of articulation
let effectiveTrillIntensity = 0.0; 

if (state.current === 'TRILL' || (state.phase === 'STARTING' && state.target === 'TRILL') || (state.phase === 'STOPPING' && state.current === 'TRILL')) {
  const trillRateModFactor = masterTransitionProgress;
  effectiveTrillSpeed = trillSpeedParam * trillRateModFactor;

  let trillIntensityModFactor = 0.0;
  if (state.phase === 'STARTING') {
    trillIntensityModFactor = Math.min(1.0, masterTransitionProgress * 2.0);
  } else if (state.phase === 'STOPPING') {
    trillIntensityModFactor = Math.pow(masterTransitionProgress, 0.5);
  } else { // IDLE
    trillIntensityModFactor = 1.0;
  }
  // This 'effectiveTrillIntensity' would then scale the trill's effect on pitch/amp.
  // The trillArticulationParam itself might not be ramped, but its *effect* is.

  this.trillPhase += effectiveTrillSpeed / this.sampleRate;
  // ... rest of trill calculations using effectiveTrillSpeed and scaling its output by effectiveTrillIntensity.
}

// After individual processing, the pitchModulation and ampModulation are applied.
// If no expression is active or in transition, pitchModulation remains 1.0 and ampModulation remains 1.0.
```

### 4. Message Handler Updates

```javascript
_handleMessage(event) {
  if (event.data.type === "startBowing") {
    this.isBowing = true;
    this.bowEnvelopeTarget = 1.0;
  } else if (event.data.type === "stopBowing") {
    this.isBowing = false;
    this.bowEnvelopeTarget = 0.0;
  } else if (event.data.type === "setExpression") {
    const newTarget = event.data.expression; // 'NONE', 'VIBRATO', 'TREMOLO', 'TRILL'
    const state = this.expressionState;
    
    // Hub-and-spoke enforcement
    if (state.current !== 'NONE' && newTarget !== 'NONE' && state.current !== newTarget) {
      // Must go through NONE first
      state.target = 'NONE';
      state.finalTarget = newTarget;
    } else {
      state.target = newTarget;
      state.finalTarget = null;
    }
  }
}
```

### 5. External Control API

```javascript
// In the main JS controller
class BowedStringSynthController {
  async setExpression(expression) {
    // Validate expression
    const validExpressions = ['NONE', 'VIBRATO', 'TREMOLO', 'TRILL'];
    if (!validExpressions.includes(expression)) {
      throw new Error(`Invalid expression: ${expression}`);
    }
    
    // Send to worklet
    this.port.postMessage({
      type: 'setExpression',
      expression: expression
    });
  }
  
  async transitionToVibrato() {
    await this.setExpression('VIBRATO');
  }
  
  async transitionToTremolo() {
    await this.setExpression('TREMOLO');
  }
  
  async transitionToTrill() {
    await this.setExpression('TRILL');
  }
  
  async transitionToNone() {
    await this.setExpression('NONE');
  }
}
```

## Transition Behavior Examples

These examples describe the perceived effect based on rate-dominant transitions. All transitions between different expressions go through NONE.

### Vibrato → Tremolo (via NONE)
1. **Vibrato Stopping:** Vibrato *rate* gradually decreases. The *depth* may remain relatively wide initially, then also decrease as the rate becomes very slow, finally settling to a plain note.
2. **NONE State:** Brief moment of plain sustained note with no expression.
3. **Tremolo Starting:** Tremolo begins with slow bow strokes, potentially with noticeable intensity/depth already. The *speed* of strokes then increases to the target rate.

### Tremolo → Trill (via NONE)
1. **Tremolo Stopping:** Tremolo *speed* (stroke rate) gradually decreases, aiming to complete its current stroke cleanly. The *intensity* of strokes may reduce later in this process.
2. **NONE State:** Bow settles to a plain sustained note with no expression.
3. **Trill Starting:** Trill begins with slow alternations between notes, possibly with clear articulation/intensity. The *speed* of alternation then increases to the target rate.

### Trill → Vibrato (via NONE)
1. **Trill Stopping:** Trill *speed* (alternation rate) gradually decreases, aiming to complete its current note pair or cycle. The perceived *intensity* or articulation effect of the trill reduces, resolving to a single note.
2. **NONE State:** Settles on a plain sustained note (typically the main note of the trill) with no expression.
3. **Vibrato Starting:** Vibrato begins with a very slow oscillation, potentially with its target *depth* (width) established early. The *rate* of oscillation then gradually increases.

### Interrupted Transitions
- **Vibrato → NONE → Vibrato:** If user requests vibrato again while stopping, the transition reverses smoothly from its current progress point.
- **Expression → Different Expression:** Always completes transition to NONE first, then starts the new expression.

## Testing Checklist

- [ ] No clicks during any transition
- [ ] Natural deceleration of vibrato
- [ ] Tremolo completes strokes before stopping
- [ ] Trill finishes note pairs cleanly
- [ ] Smooth onset of each expression
- [ ] Musical timing feels natural
- [ ] State machine handles rapid changes gracefully
- [ ] Expression parameters maintain musical values

## Benefits

1. **Realistic**: Matches physical violin technique
2. **Musical**: Respects natural timing and phrasing
3. **Clean**: No mixing complexity or overlapping effects
4. **Predictable**: Clear state at all times
5. **Extensible**: Easy to add new expressions

## Future Enhancements

1. **Gesture Recording**: Record and playback expression sequences
2. **Tempo Sync**: Align tremolo/trill to musical tempo
3. **Dynamic Transitions**: Vary transition speed based on musical context
4. **Expression Presets**: Save favorite vibrato/tremolo/trill settings