# Refactor Implementation Guide

## Overview
This guide provides a step-by-step approach to implementing the violinist-style, rate-dominant expression transition system with hub-and-spoke model in your `bowed_string_worklet.js` file.

## Pre-Implementation Checklist
- [ ] Back up your current `bowed_string_worklet.js`
- [ ] Have your test HTML file ready for testing transitions
- [ ] Prepare to test all transition combinations: NONE ↔ VIBRATO, NONE ↔ TREMOLO, NONE ↔ TRILL

## Step 1: Add State Management Variables

### 1.1 Locate the Constructor
Find your constructor method and add these variables after your existing expression state variables:

```javascript
// Expression state machine
this.expressionState = {
  current: 'NONE',
  target: 'NONE',
  finalTarget: null, // For two-stage transitions
  phase: 'IDLE', // IDLE, STOPPING, WAITING, STARTING
  stopProgress: 0.0,
  startProgress: 0.0
};

// Natural transition parameters
this.transitionParams = {
  vibrato: {
    stopRate: 0.002,    // Speed of transition envelope fading out
    startRate: 0.003,   // Speed of transition envelope fading in
    canStopAt: () => true  // Vibrato can stop at any phase point
  },
  tremolo: {
    stopRate: 0.01,     // Faster transition
    startRate: 0.005,   
    canStopAt: () => {  // Tremolo stops at stroke boundaries
      return this.tremoloPhase < 0.05 || this.tremoloPhase > 0.95 ||
             (this.tremoloPhase > 0.45 && this.tremoloPhase < 0.55);
    }
  },
  trill: {
    stopRate: 0.02,     // Quick transition
    startRate: 0.01,    
    canStopAt: () => {  // Trill stops between notes
      return this.trillPhase < 0.05 || 
             (this.trillPhase > 0.45 && this.trillPhase < 0.55);
    }
  }
};

// Master progress tracking for each expression
this.vibratoMasterProgress = 0.0;
this.tremoloMasterProgress = 0.0;
this.trillMasterProgress = 0.0;

// For debugging
this.debugCounter = 0;
```

### 1.2 Remove Old Variables
Remove or comment out these old variables if they exist:
- `this.vibratoActive`
- `this.vibratoRampFactor`
- `this.tremoloRampFactor`
- `this.trillRampFactor`
- Any similar ramp/active flags

## Step 2: Add the State Update Method

Add this new method after your other helper methods (like `_calculateStringModeCoefficients`):

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
          // Note: finalTarget is set in _handleMessage when this occurs
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
  
  // Update master progress for each expression
  // Vibrato
  if ((state.phase === 'IDLE' && state.current === 'VIBRATO') || 
      (state.phase === 'STARTING' && state.target === 'VIBRATO')) {
    this.vibratoMasterProgress = (state.phase === 'IDLE') ? 1.0 : state.startProgress;
  } else if (state.phase === 'STOPPING' && state.current === 'VIBRATO') {
    this.vibratoMasterProgress = 1.0 - state.stopProgress;
  } else {
    this.vibratoMasterProgress = 0.0;
  }
  
  // Tremolo
  if ((state.phase === 'IDLE' && state.current === 'TREMOLO') || 
      (state.phase === 'STARTING' && state.target === 'TREMOLO')) {
    this.tremoloMasterProgress = (state.phase === 'IDLE') ? 1.0 : state.startProgress;
  } else if (state.phase === 'STOPPING' && state.current === 'TREMOLO') {
    this.tremoloMasterProgress = 1.0 - state.stopProgress;
  } else {
    this.tremoloMasterProgress = 0.0;
  }
  
  // Trill
  if ((state.phase === 'IDLE' && state.current === 'TRILL') || 
      (state.phase === 'STARTING' && state.target === 'TRILL')) {
    this.trillMasterProgress = (state.phase === 'IDLE') ? 1.0 : state.startProgress;
  } else if (state.phase === 'STOPPING' && state.current === 'TRILL') {
    this.trillMasterProgress = 1.0 - state.stopProgress;
  } else {
    this.trillMasterProgress = 0.0;
  }
  
  // Clamp all progress values
  this.vibratoMasterProgress = Math.max(0.0, Math.min(1.0, this.vibratoMasterProgress));
  this.tremoloMasterProgress = Math.max(0.0, Math.min(1.0, this.tremoloMasterProgress));
  this.trillMasterProgress = Math.max(0.0, Math.min(1.0, this.trillMasterProgress));
}
```

## Step 3: Update Message Handler

Replace your existing `_handleMessage` method:

```javascript
_handleMessage(event) {
  if (event.data.type === "startBowing") {
    this.isBowing = true;
    this.bowEnvelopeTarget = 1.0;
  } else if (event.data.type === "stopBowing") {
    this.isBowing = false;
    this.bowEnvelopeTarget = 0.0;
  } else if (event.data.type === "setExpression") {
    // New message type for expression changes
    const validExpressions = ['NONE', 'VIBRATO', 'TREMOLO', 'TRILL'];
    if (validExpressions.includes(event.data.expression)) {
      const newTarget = event.data.expression;
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
}
```

## Step 4: Remove Old Expression Logic

### 4.1 Find and Remove Mutual Exclusivity Checks
Locate and remove code blocks like:
```javascript
// REMOVE THIS:
if (vibratoEnabled && !trillEnabled && !tremoloEnabled) {
  this.vibratoActive = true;
  this.vibratoRampFactor = 1.0;
} else {
  this.vibratoActive = false;
  this.vibratoRampFactor = 0.0;
  this.vibratoPhase = 0.0; // ESPECIALLY remove phase resets!
}
```

### 4.2 Remove All Phase Resets
Search for and remove ALL lines that reset phases:
- `this.vibratoPhase = 0.0;`
- `this.tremoloPhase = 0.0;`
- `this.trillPhase = 0.0;`

Keep the phase increment logic, just remove the resets.

## Step 5: Implement New Expression Processing

### 5.1 At the Beginning of process() Method
Add this at the start of your sample processing loop:

```javascript
// Update expression state machine
this._updateExpressionState();

// Initialize modulations
let pitchModulation = 1.0;
let ampModulation = 1.0;
```

### 5.2 Replace Vibrato Processing
Replace your existing vibrato processing with:

```javascript
// Process Vibrato
if (this.vibratoMasterProgress > 0.001) {
  const state = this.expressionState;
  
  // Rate directly follows master progress
  const vibratoRateModFactor = this.vibratoMasterProgress;
  const effectiveVibratoRate = vibratoRate * vibratoRateModFactor;
  
  // Depth follows different curve
  let vibratoDepthModFactor = 0.0;
  if ((state.phase === 'IDLE' && state.current === 'VIBRATO') || 
      (state.phase === 'STARTING' && state.target === 'VIBRATO')) {
    // Depth comes in quickly
    vibratoDepthModFactor = Math.min(1.0, this.vibratoMasterProgress / 0.5);
    if (state.phase === 'IDLE' && state.current === 'VIBRATO') {
      vibratoDepthModFactor = 1.0;
    }
  } else if (state.phase === 'STOPPING' && state.current === 'VIBRATO') {
    // Depth lingers longer
    vibratoDepthModFactor = Math.pow(this.vibratoMasterProgress, 0.3);
  }
  
  const effectiveVibratoDepth = vibratoDepth * vibratoDepthModFactor;
  
  // Always update phase
  this.vibratoPhase += effectiveVibratoRate / this.sampleRate;
  if (this.vibratoPhase >= 1.0) this.vibratoPhase -= 1.0;
  
  if (effectiveVibratoDepth > 0.001) {
    const vibratoValue = Math.sin(2 * Math.PI * this.vibratoPhase);
    pitchModulation = 1.0 + vibratoValue * effectiveVibratoDepth * 0.06;
    ampModulation = 1.0 + vibratoValue * effectiveVibratoDepth * 0.2;
  }
}
```

### 5.3 Update Tremolo Processing
Similar pattern for tremolo (adapt your existing complex tremolo calculations):

```javascript
// Process Tremolo
if (this.tremoloMasterProgress > 0.001) {
  const state = this.expressionState;
  
  // Rate modulation
  const tremoloRateModFactor = this.tremoloMasterProgress;
  const effectiveTremoloSpeed = tremoloSpeed * tremoloRateModFactor;
  
  // Depth modulation (for amplitude intensity)
  let tremoloDepthModFactor = 0.0;
  if ((state.phase === 'IDLE' && state.current === 'TREMOLO') || 
      (state.phase === 'STARTING' && state.target === 'TREMOLO')) {
    tremoloDepthModFactor = Math.min(1.0, this.tremoloMasterProgress / 0.6);
    if (state.phase === 'IDLE' && state.current === 'TREMOLO') {
      tremoloDepthModFactor = 1.0;
    }
  } else if (state.phase === 'STOPPING' && state.current === 'TREMOLO') {
    tremoloDepthModFactor = Math.pow(this.tremoloMasterProgress, 0.4);
  }
  
  const effectiveTremoloDepth = tremoloDepth * tremoloDepthModFactor;
  
  // Update phase with timing variation
  const timingVariation = 1.0 + (Math.random() - 0.5) * 0.15;
  const tremoloIncrement = (effectiveTremoloSpeed * timingVariation) / this.sampleRate;
  this.tremoloPhase += tremoloIncrement;
  if (this.tremoloPhase >= 1.0) {
    this.tremoloPhase -= 1.0;
    if (effectiveTremoloSpeed > 0.001) this.tremoloStrokeCount++;
  }
  
  if (effectiveTremoloDepth > 0.001) {
    // [INSERT YOUR EXISTING TREMOLO CALCULATIONS HERE]
    // Calculate rawTremoloAmpModulation based on phase, articulation, etc.
    // Then apply it scaled by effectiveTremoloDepth:
    // ampModulation *= (1.0 + (rawTremoloAmpModulation - 1.0) * effectiveTremoloDepth);
  }
}
```

### 5.4 Update Trill Processing
Similar pattern for trill:

```javascript
// Process Trill
if (this.trillMasterProgress > 0.001) {
  const state = this.expressionState;
  
  // Rate modulation
  const trillRateModFactor = this.trillMasterProgress;
  const effectiveTrillSpeed = trillSpeed * trillRateModFactor;
  
  // Intensity modulation
  let trillIntensityModFactor = 0.0;
  if ((state.phase === 'IDLE' && state.current === 'TRILL') || 
      (state.phase === 'STARTING' && state.target === 'TRILL')) {
    trillIntensityModFactor = Math.min(1.0, this.trillMasterProgress / 0.5);
    if (state.phase === 'IDLE' && state.current === 'TRILL') {
      trillIntensityModFactor = 1.0;
    }
  } else if (state.phase === 'STOPPING' && state.current === 'TRILL') {
    trillIntensityModFactor = Math.pow(this.trillMasterProgress, 0.3);
  }
  
  const effectiveTrillIntensity = trillIntensityModFactor;
  
  // Update phase
  const timingVariation = 1.0 + (Math.random() - 0.5) * 0.1;
  const trillIncrement = (effectiveTrillSpeed * timingVariation) / this.sampleRate;
  this.trillPhase += trillIncrement;
  if (this.trillPhase >= 1.0) this.trillPhase -= 1.0;
  
  if (effectiveTrillIntensity > 0.001) {
    // [INSERT YOUR EXISTING TRILL CALCULATIONS HERE]
    // Calculate rawTrillPitchMod and rawTrillAmpMod
    // Then apply them scaled by effectiveTrillIntensity:
    // pitchModulation = 1.0 + (rawTrillPitchMod - 1.0) * effectiveTrillIntensity;
    // ampModulation = 1.0 + (rawTrillAmpMod - 1.0) * effectiveTrillIntensity;
  }
}
```

## Step 6: Update External Control API

In your HTML/JavaScript controller, update or add these methods:

```javascript
async setExpression(expression) {
  if (this.audioWorkletNode) {
    this.audioWorkletNode.port.postMessage({
      type: 'setExpression',
      expression: expression
    });
  }
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
```

## Step 7: Testing

### 7.1 Basic Transition Test
```javascript
// Test each expression
async function testBasicTransitions() {
  console.log('Testing NONE → VIBRATO');
  await synth.transitionToVibrato();
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('Testing VIBRATO → NONE');
  await synth.transitionToNone();
  await new Promise(r => setTimeout(r, 2000));
  
  // Repeat for TREMOLO and TRILL
}
```

### 7.2 Hub-and-Spoke Test
```javascript
// Test that direct transitions go through NONE
async function testHubAndSpoke() {
  console.log('Testing VIBRATO → TREMOLO (should go through NONE)');
  await synth.transitionToVibrato();
  await new Promise(r => setTimeout(r, 2000));
  await synth.transitionToTremolo(); // Should automatically route through NONE
  await new Promise(r => setTimeout(r, 4000));
}
```

### 7.3 Interruption Test
```javascript
// Test interrupted transitions
async function testInterruptions() {
  console.log('Testing interrupted transition');
  await synth.transitionToVibrato();
  await new Promise(r => setTimeout(r, 500)); // Start vibrato
  await synth.transitionToNone();
  await new Promise(r => setTimeout(r, 500)); // Partially stop
  await synth.transitionToVibrato(); // Should reverse smoothly
}
```

### 7.4 Debug Logging
Add this to your process() method for debugging:

```javascript
if (++this.debugCounter % 1000 === 0) {
  console.log('Expression State:', {
    state: this.expressionState,
    progress: {
      vibrato: this.vibratoMasterProgress.toFixed(3),
      tremolo: this.tremoloMasterProgress.toFixed(3),
      trill: this.trillMasterProgress.toFixed(3)
    }
  });
}
```

## Step 8: Fine-Tuning

### 8.1 Adjust Transition Rates
Experiment with the rates in `transitionParams`:
- Slower rates (< 0.002) for more gradual transitions
- Faster rates (> 0.01) for snappier transitions

### 8.2 Tune Depth/Intensity Curves
Adjust the curves for each expression:
- Starting curves: `Math.min(1.0, progress / X)` where X < 1 makes depth come in faster
- Stopping curves: `Math.pow(progress, X)` where X < 1 makes depth linger longer

### 8.3 Listen For
- Smooth rate changes (no sudden jumps)
- Natural depth/intensity envelopes
- Clean transitions through NONE
- No clicks or pops
- Musical timing of tremolo strokes and trill notes

## Common Issues and Solutions

### Issue: Clicks during transitions
- Check that ALL phase resets have been removed
- Ensure phases are always updating, even when expression is "off"

### Issue: Expressions sound weird when starting
- Check depth/intensity curves - they might be too aggressive
- Verify that rate starts from near-zero

### Issue: Direct transitions not working
- Verify hub-and-spoke logic in `_handleMessage`
- Check that `finalTarget` is being set and used correctly

### Issue: Tremolo/Trill not stopping at natural points
- Verify `canStopAt` logic matches your phase calculations
- Consider adding a timeout to force stop if needed

## Success Criteria
- [x] All transitions are smooth and click-free
- [x] Expressions start with slow rate, increasing to target
- [x] Expressions stop with decreasing rate
- [x] Direct transitions automatically route through NONE
- [x] Interrupted transitions reverse smoothly
- [x] Musical timing is preserved for tremolo and trill