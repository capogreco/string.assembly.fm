# Worklet Modifications for Violinist-Style Transitions

## Overview
These are the specific modifications to add to your existing `bowed_string_worklet.js` to implement realistic violinist-style expression transitions.

## Step 1: Add State Management to Constructor

Add these variables after the existing expression state variables:

```javascript
// Expression state machine
this.expressionState = {
  current: 'NONE',
  target: 'NONE',
  finalTarget: null, // For two-stage transitions (e.g., VIBRATO → NONE → TREMOLO)
  phase: 'IDLE', // IDLE, STOPPING, WAITING, STARTING
  stopProgress: 0.0,
  startProgress: 0.0
};

// Natural transition parameters
this.transitionParams = {
  vibrato: {
    stopRate: 0.002,    // Gradual fade
    startRate: 0.003,   // Gradual onset
    canStopAt: () => true  // Can stop anytime
  },
  tremolo: {
    stopRate: 0.01,     // Quick between strokes
    startRate: 0.005,   // Medium onset
    canStopAt: () => {  // Stop at stroke boundaries
      return this.tremoloPhase < 0.05 || this.tremoloPhase > 0.95 ||
             (this.tremoloPhase > 0.45 && this.tremoloPhase < 0.55);
    }
  },
  trill: {
    stopRate: 0.02,     // Quick at note boundaries  
    startRate: 0.01,    // Quick onset
    canStopAt: () => {  // Stop between notes
      return this.trillPhase < 0.05 || 
             (this.trillPhase > 0.45 && this.trillPhase < 0.55);
    }
  }
};

// Smooth transition envelopes (These will represent master progress for each expression)
// We will derive specific rate and depth/intensity mod factors from these.
this.vibratoMasterProgress = 0.0;
this.tremoloMasterProgress = 0.0;
this.trillMasterProgress = 0.0;
```

## Step 2: Add Expression State Update Method

Add this method after the other helper methods:

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
  
  // Update master progress for each expression based on the overall state machine
  // This master progress (0 to 1) will then be mapped to specific rate and depth/intensity curves.

  // Vibrato Master Progress
  if ((state.phase === 'IDLE' && state.current === 'VIBRATO') || (state.phase === 'STARTING' && state.target === 'VIBRATO')) {
    this.vibratoMasterProgress = (state.phase === 'IDLE') ? 1.0 : state.startProgress;
  } else if (state.phase === 'STOPPING' && state.current === 'VIBRATO') {
    this.vibratoMasterProgress = 1.0 - state.stopProgress;
  } else {
    this.vibratoMasterProgress = 0.0;
  }
  this.vibratoMasterProgress = Math.max(0.0, Math.min(1.0, this.vibratoMasterProgress));

  // Tremolo Master Progress
  if ((state.phase === 'IDLE' && state.current === 'TREMOLO') || (state.phase === 'STARTING' && state.target === 'TREMOLO')) {
    this.tremoloMasterProgress = (state.phase === 'IDLE') ? 1.0 : state.startProgress;
  } else if (state.phase === 'STOPPING' && state.current === 'TREMOLO') {
    this.tremoloMasterProgress = 1.0 - state.stopProgress;
  } else {
    this.tremoloMasterProgress = 0.0;
  }
  this.tremoloMasterProgress = Math.max(0.0, Math.min(1.0, this.tremoloMasterProgress));

  // Trill Master Progress
  if ((state.phase === 'IDLE' && state.current === 'TRILL') || (state.phase === 'STARTING' && state.target === 'TRILL')) {
    this.trillMasterProgress = (state.phase === 'IDLE') ? 1.0 : state.startProgress;
  } else if (state.phase === 'STOPPING' && state.current === 'TRILL') {
    this.trillMasterProgress = 1.0 - state.stopProgress;
  } else {
    this.trillMasterProgress = 0.0;
  }
  this.trillMasterProgress = Math.max(0.0, Math.min(1.0, this.trillMasterProgress));
}
```

## Step 3: Update Message Handler

Replace the existing `_handleMessage` method:

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

## Step 4: Modify Expression Processing in process()

Replace the vibrato enable check (around line 620):

```javascript
// OLD CODE - Remove this entire block:
// if (vibratoEnabled && !trillEnabled && !tremoloEnabled) {
//   this.vibratoActive = true;
//   this.vibratoRampFactor = 1.0;
// } else {
//   this.vibratoActive = false;
//   this.vibratoRampFactor = 0.0;
//   this.vibratoPhase = 0.0;
// }

// NEW CODE - Add at the beginning of the sample loop:
this._updateExpressionState();

// Initialize modulations
let pitchModulation = 1.0;
let ampModulation = 1.0;

// Get target parameters from AudioParams
const vibratoRateParam = parameters.vibratoRate[0];
const vibratoDepthParam = parameters.vibratoDepth[0];
const tremoloSpeedParam = parameters.tremoloSpeed[0];
const tremoloDepthParam = parameters.tremoloDepth[0]; // For tremolo amplitude intensity
const trillSpeedParam = parameters.trillSpeed[0];
const trillArticulationParam = parameters.trillArticulation[0]; // For trill note character
const trillIntervalParam = parameters.trillInterval[0];
```

## Step 5: Apply Transition Envelopes

Modify vibrato processing:

```javascript
// Always update vibrato phase (remove the conditional increment)
const vibratoIncrement = vibratoRate / this.sampleRate;
this.vibratoPhase += vibratoIncrement;
if (this.vibratoPhase >= 1.0) this.vibratoPhase -= 1.0;
const vibratoValue = Math.sin(2 * Math.PI * this.vibratoPhase);

// Apply vibrato with rate-dominant transition
if (this.vibratoMasterProgress > 0.001) {
  const state = this.expressionState;
  let vibratoRateModFactor = this.vibratoMasterProgress; // Rate directly follows master progress
  let vibratoDepthModFactor = 0.0;

  if ((state.phase === 'IDLE' && state.current === 'VIBRATO') || state.phase === 'STARTING') {
    // Starting or active: Depth comes in relatively quickly
    vibratoDepthModFactor = Math.min(1.0, this.vibratoMasterProgress / 0.5); // Full depth at 50% master progress
    if (state.phase === 'IDLE' && state.current === 'VIBRATO') vibratoDepthModFactor = 1.0;
  } else if (state.phase === 'STOPPING') {
    // Stopping: Depth stays fuller longer
    vibratoDepthModFactor = Math.pow(this.vibratoMasterProgress, 0.3);
  }
  vibratoDepthModFactor = Math.max(0.0, Math.min(1.0, vibratoDepthModFactor));

  const effectiveVibratoRate = vibratoRateParam * vibratoRateModFactor;
  const effectiveVibratoDepth = vibratoDepthParam * vibratoDepthModFactor;

  // Actual phase update uses the effectiveRate
  this.vibratoPhase += effectiveVibratoRate / this.sampleRate; // Note: original vibratoIncrement was conditional
  if (this.vibratoPhase >= 1.0) this.vibratoPhase -= 1.0;
  const vibratoValue = Math.sin(2 * Math.PI * this.vibratoPhase);

  if (effectiveVibratoDepth > 0.001) {
    // Ensure vibrato only applies its modulation if it's the current or stopping/starting expression
     if (state.current === 'VIBRATO' || (state.phase === 'STOPPING' && state.current === 'VIBRATO') || (state.phase === 'STARTING' && state.target === 'VIBRATO')) {
        pitchModulation = 1.0 + vibratoValue * effectiveVibratoDepth * 0.06;
        ampModulation = 1.0 + vibratoValue * effectiveVibratoDepth * 0.2;
    }
  }
}
```

Modify tremolo processing:

```javascript
// Replace the tremolo enable check with rate-dominant transition logic:
if (this.tremoloMasterProgress > 0.001) {
  const state = this.expressionState;
  let tremoloRateModFactor = this.tremoloMasterProgress; // Rate directly follows master progress
  let tremoloDepthModFactor = 0.0; // For amplitude intensity

  if ((state.phase === 'IDLE' && state.current === 'TREMOLO') || state.phase === 'STARTING') {
    tremoloDepthModFactor = Math.min(1.0, this.tremoloMasterProgress / 0.6); // Full intensity at 60% master progress
    if (state.phase === 'IDLE' && state.current === 'TREMOLO') tremoloDepthModFactor = 1.0;
  } else if (state.phase === 'STOPPING') {
    tremoloDepthModFactor = Math.pow(this.tremoloMasterProgress, 0.4); // Intensity fades a bit slower than rate
  }
  tremoloDepthModFactor = Math.max(0.0, Math.min(1.0, tremoloDepthModFactor));

  const effectiveTremoloSpeed = tremoloSpeedParam * tremoloRateModFactor;
  const effectiveTremoloDepth = tremoloDepthParam * tremoloDepthModFactor; // For amplitude intensity

  // Original tremolo phase update logic (ensure it uses effectiveTremoloSpeed)
  // Add slight timing variations for realism
  const timingVariationTremolo = 1.0 + (Math.random() - 0.5) * 0.15; // Copied from original
  const tremoloIncrement = (effectiveTremoloSpeed * timingVariationTremolo) / this.sampleRate;
  this.tremoloPhase += tremoloIncrement;
  if (this.tremoloPhase >= 1.0) {
    this.tremoloPhase -= 1.0;
    if(effectiveTremoloSpeed > 0.001) this.tremoloStrokeCount++; // only count strokes if speed is significant
  }
  
  if (effectiveTremoloDepth > 0.001) {
    // ... existing detailed tremolo calculations for 'rawTremoloAmp' ...
    // This 'rawTremoloAmp' is the amplitude modulation value if tremolo was at full depth.
    // Ensure your existing tremolo logic that calculates 'tremoloAmp' (or equivalent)
    // uses the tremoloArticulationParam and current tremoloPhase.
    // For example:
    // const currentTremoloState = this.tremoloPhase < 0.5 ? 0 : 1;
    // let bowSpeedFactor = calculateBowSpeedFactor(this.tremoloPhase, currentTremoloState, tremoloArticulationParam);
    // let rawTremoloAmp = 0.5 + bowSpeedFactor * 0.7; // This is a placeholder for your detailed logic
    // if (bowSpeedFactor < 0.15) rawTremoloAmp = 0.05 + bowSpeedFactor * 0.5;
    // if (phaseInStroke >= 1.0) rawTremoloAmp = 0.02; // Example gap amplitude
    // const isAccented = this.tremoloStrokeCount % (3 + Math.floor(Math.random() * 2)) === 0;
    // if (isAccented && bowSpeedFactor > 0.5) rawTremoloAmp += 0.2;
    // const tremoloPressureBoost = 1.3;
    // rawTremoloAmp *= tremoloPressureBoost; // Placeholder for your calculated tremolo effect amplitude

    // Let's assume 'calculatedRawTremoloAmpEffect' is the result of your existing complex tremolo amplitude logic
    // This value should represent the modulation factor (e.g., if it's 1.2, it boosts amplitude by 20%)
    // The original code had ampModulation *= tremoloAmp * this.tremoloRampFactor * tremoloPressureBoost;
    // So 'tremoloAmp * tremoloPressureBoost' is what we consider the 'raw' effect here.
    // It should be 1.0 if there's no tremolo effect at that phase.
    
    // For the sake of this patch, we'll imagine a function that gives the raw amp mod:
    // const rawTremoloAmpModulation = getRawTremoloAmplitudeModulation(this.tremoloPhase, tremoloArticulationParam, this.tremoloStrokeCount);
    // This function would encapsulate lines ~806 to ~864 from the original worklet.
    // For now, let's just use a placeholder example:
    const phaseInStroke = this.tremoloPhase < 0.5 ? this.tremoloPhase / (tremoloArticulationParam * 0.5) : (this.tremoloPhase - 0.5) / (tremoloArticulationParam * 0.5);
    let rawTremoloAmpModulation = 1.0;
    if (phaseInStroke < 1.0) { // Active stroke
        rawTremoloAmpModulation = 0.5 + Math.pow(Math.sin(phaseInStroke * Math.PI), 2.5) * 0.7; // Simplified
    } else { // Gap
        rawTremoloAmpModulation = 0.2; // Quieter in gap
    }
    rawTremoloAmpModulation *= 1.3; // Pressure boost example


    // Ensure tremolo only applies its modulation if it's the current or stopping/starting expression
    if (state.current === 'TREMOLO' || (state.phase === 'STOPPING' && state.current === 'TREMOLO') || (state.phase === 'STARTING' && state.target === 'TREMOLO')) {
        ampModulation *= (1.0 + (rawTremoloAmpModulation - 1.0) * effectiveTremoloDepth);
        // Also update tremoloScratchiness, tremoloBowSpeed if they are used elsewhere, scaled by effectiveTremoloSpeed/Depth
        // this.tremoloScratchiness = calculateScratchiness(...) * effectiveTremoloDepth; (or based on effectiveTremoloSpeed)
    }
  } else {
      // If tremolo depth is zero, reset scratchiness etc.
      // this.tremoloScratchiness = 0.0;
      // this.tremoloBowSpeed = 1.0; // Neutral
  }
}
```

Modify trill processing:

```javascript
// Replace the trill enable check with rate-dominant transition logic:
if (this.trillMasterProgress > 0.001) {
  const state = this.expressionState;
  let trillRateModFactor = this.trillMasterProgress; // Rate directly follows master progress
  let trillIntensityModFactor = 0.0; // For overall trill effect intensity

  if ((state.phase === 'IDLE' && state.current === 'TRILL') || state.phase === 'STARTING') {
    trillIntensityModFactor = Math.min(1.0, this.trillMasterProgress / 0.5); // Full intensity at 50% master progress
    if (state.phase === 'IDLE' && state.current === 'TRILL') trillIntensityModFactor = 1.0;
  } else if (state.phase === 'STOPPING') {
    trillIntensityModFactor = Math.pow(this.trillMasterProgress, 0.3); // Intensity fades a bit slower but still quickly
  }
  trillIntensityModFactor = Math.max(0.0, Math.min(1.0, trillIntensityModFactor));

  const effectiveTrillSpeed = trillSpeedParam * trillRateModFactor;
  // trillArticulationParam is used directly in trill calculations, not usually ramped itself.
  // The effectiveTrillIntensity will scale the *output* of the trill.

  // Original trill phase update logic (ensure it uses effectiveTrillSpeed)
  // Add slight timing variations for realism
  const timingVariationTrill = 1.0 + (Math.random() - 0.5) * 0.1; // Copied from original
  // this.trillCurrentSpeed was ramped by this.trillRampFactor in original. Now we use effectiveTrillSpeed.
  const trillIncrement = (effectiveTrillSpeed * timingVariationTrill) / this.sampleRate;
  this.trillPhase += trillIncrement;
  if (this.trillPhase >= 1.0) {
    this.trillPhase -= 1.0;
  }
  
  if (effectiveTrillIntensity > 0.001) {
    // ... existing detailed trill calculations for 'rawTrillPitchMod' and 'rawTrillAmpMod' ...
    // These should use trillPhase, trillIntervalParam, trillArticulationParam.
    // For example, from original code (lines ~710 to ~747):
    let isActivePhaseTrill = false;
    let currentTrillState;
    if (this.trillPhase < 0.5) {
      currentTrillState = 0;
      isActivePhaseTrill = this.trillPhase < 0.5 * trillArticulationParam;
    } else {
      currentTrillState = 1;
      const adjustedPhaseTrill = this.trillPhase - 0.5;
      isActivePhaseTrill = adjustedPhaseTrill < 0.5 * trillArticulationParam;
    }
    // const trillTransition = currentTrillState !== this.lastTrillState; // this.lastTrillState needs to be managed
    // this.lastTrillState = currentTrillState; // Manage this if used for brightness or other effects

    let rawTrillPitchModValue = 1.0;
    if (currentTrillState === 1 && isActivePhaseTrill) {
      rawTrillPitchModValue = Math.pow(2, trillIntervalParam / 12.0);
    } else if (currentTrillState === 0 && isActivePhaseTrill) {
      rawTrillPitchModValue = 1.0;
    } else { // In gap
      rawTrillPitchModValue = (this.lastTrillState === 1) ? Math.pow(2, trillIntervalParam / 12.0) : 1.0; // Maintain previous pitch in gap
    }
    if (currentTrillState !== this.lastTrillState) { // Update lastTrillState only on actual changes
        this.lastTrillState = currentTrillState;
    }


    let rawTrillAmpModValue = 1.0;
    if (!isActivePhaseTrill) { // In gap
      rawTrillAmpModValue = 0.1;
    } else if (currentTrillState === 1) { // Upper note
      rawTrillAmpModValue = 1.5;
    } else { // Lower note
      rawTrillAmpModValue = 0.85;
    }

    // Ensure trill only applies its modulation if it's the current or stopping/starting expression
    if (state.current === 'TRILL' || (state.phase === 'STOPPING' && state.current === 'TRILL') || (state.phase === 'STARTING' && state.target === 'TRILL')) {
        // Trill often *replaces* base pitch modulation rather than multiplying.
        // And its amplitude effect is also often defining.
        pitchModulation = 1.0 + (rawTrillPitchModValue - 1.0) * effectiveTrillIntensity;
        ampModulation = 1.0 + (rawTrillAmpModValue - 1.0) * effectiveTrillIntensity;
        // If trill has brightness effects, scale them by effectiveTrillIntensity too.
    }
  }
}
```

## Step 6: Remove Phase Resets

Search for and remove all lines that reset phases:
- `this.vibratoPhase = 0.0;`
- `this.tremoloPhase = 0.0;`
- `this.trillPhase = 0.0;`

Keep phase updates continuous to avoid clicks.

## Step 7: Update External Control

In your HTML/JavaScript controller:

```javascript
// Add these methods to your synth controller
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

// Usage example:
// await synth.transitionToVibrato();
// await synth.transitionToTremolo();
```

## Testing

1. Test simple transitions:
   ```javascript
   await synth.transitionToVibrato();
   await new Promise(r => setTimeout(r, 3000));
   await synth.transitionToNone();
   ```

2. Test all transition pairs:
   ```javascript
   const expressions = ['NONE', 'VIBRATO', 'TREMOLO', 'TRILL'];
   for (const from of expressions) {
     for (const to of expressions) {
       if (from !== to) {
         await synth.setExpression(from);
         await new Promise(r => setTimeout(r, 2000));
         await synth.setExpression(to);
         await new Promise(r => setTimeout(r, 2000));
       }
     }
   }
   ```

3. Listen for:
   - No clicks or pops
   - Natural deceleration/acceleration
   - Musical timing of transitions
   - Proper completion of tremolo strokes and trill notes

## Summary

These modifications implement a state machine that:
1. Tracks expression transitions through natural phases
2. Applies smooth envelopes to expression parameters
3. Respects musical timing (tremolo strokes, trill notes)
4. Eliminates clicks by never resetting phases
5. Models realistic violinist technique transitions

The external API remains simple - just call `setExpression()` and the worklet handles all the timing internally.