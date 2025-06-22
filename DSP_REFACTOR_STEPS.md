# DSP Refactoring Steps for Smooth Expression Transitions

## Overview
This document outlines concrete steps to refactor the bowed_string_worklet.js to support smooth transitions between expression modes (vibrato, tremolo, trill).

## Step 1: Add Smooth Gate Variables (Quick Win)

### 1.1 Add to Constructor
```javascript
// Expression gating for smooth transitions
this.vibratoGate = 0.0;
this.tremoloGate = 0.0;
this.trillGate = 0.0;
this.gateSmoothing = 0.001; // Adjust for transition speed

// Rate smoothing
this.vibratoRateSmoothed = 5.0;
this.tremoloSpeedSmoothed = 10.0;
this.trillSpeedSmoothed = 6.0;
this.rateSmoothing = 0.0005;
```

### 1.2 Replace Mutual Exclusivity Check
Find and replace:
```javascript
// OLD CODE (line ~620)
if (vibratoEnabled && !trillEnabled && !tremoloEnabled) {
  this.vibratoActive = true;
  this.vibratoRampFactor = 1.0;
} else {
  this.vibratoActive = false;
  this.vibratoRampFactor = 0.0;
  this.vibratoPhase = 0.0; // REMOVE THIS LINE!
}
```

With:
```javascript
// NEW CODE
// Update gate targets
const vibratoTarget = vibratoEnabled ? 1.0 : 0.0;
const tremoloTarget = tremoloEnabled ? 1.0 : 0.0;
const trillTarget = trillEnabled ? 1.0 : 0.0;

// Smooth the gates
this.vibratoGate += (vibratoTarget - this.vibratoGate) * this.gateSmoothing;
this.tremoloGate += (tremoloTarget - this.tremoloGate) * this.gateSmoothing;
this.trillGate += (trillTarget - this.trillGate) * this.gateSmoothing;

// Update active states based on gates
this.vibratoActive = this.vibratoGate > 0.001;
this.tremoloActive = this.tremoloGate > 0.001;
this.trillActive = this.trillGate > 0.001;
```

## Step 2: Always Update Phases

### 2.1 Fix Vibrato Phase Update
Replace:
```javascript
// OLD CODE
const vibratoIncrement = (this.vibratoActive ? vibratoRate : 0) / this.sampleRate;
```

With:
```javascript
// NEW CODE - Always update phase, apply gate to effect
this.vibratoRateSmoothed += (vibratoRate - this.vibratoRateSmoothed) * this.rateSmoothing;
const effectiveVibratoRate = this.vibratoRateSmoothed * this.vibratoGate;
const vibratoIncrement = effectiveVibratoRate / this.sampleRate;
```

### 2.2 Fix Vibrato Application
Replace:
```javascript
// OLD CODE
if (this.vibratoActive) {
  pitchModulation = 1.0 + vibratoValue * vibratoDepth * 0.06;
  ampModulation = 1.0 + vibratoValue * vibratoDepth * 0.2;
}
```

With:
```javascript
// NEW CODE - Apply with gate
const effectiveVibratoDepth = vibratoDepth * this.vibratoGate;
pitchModulation = 1.0 + vibratoValue * effectiveVibratoDepth * 0.06;
ampModulation = 1.0 + vibratoValue * effectiveVibratoDepth * 0.2;
```

## Step 3: Fix Trill Handling

### 3.1 Remove Phase Reset
Find and remove:
```javascript
if (this.trillRampFactor === 0.0) {
  this.trillActive = false;
  this.trillPhase = 0.0;  // REMOVE THIS LINE
  this.lastTrillState = 0;
}
```

### 3.2 Update Trill Logic
Replace the trill enable/disable logic with:
```javascript
// Always update trill phase
this.trillSpeedSmoothed += (trillTargetSpeed - this.trillSpeedSmoothed) * this.rateSmoothing;
const effectiveTrillSpeed = this.trillSpeedSmoothed * this.trillGate;

const timingVariation = 1.0 + (Math.random() - 0.5) * 0.1;
const trillIncrement = (effectiveTrillSpeed * timingVariation) / this.sampleRate;
this.trillPhase += trillIncrement;
if (this.trillPhase >= 1.0) this.trillPhase -= 1.0;

// Apply trill only when gate is open
if (this.trillGate > 0.001) {
  // Existing trill pitch/amp calculations...
  // But multiply final effect by this.trillGate
  pitchModulation = 1.0 + (pitchModulation - 1.0) * this.trillGate;
  ampModulation = 1.0 + (ampModulation - 1.0) * this.trillGate;
}
```

## Step 4: Fix Tremolo Handling

### 4.1 Remove Phase Reset
Find and remove:
```javascript
if (this.tremoloRampFactor === 0.0) {
  this.tremoloActive = false;
  this.tremoloPhase = 0.0;  // REMOVE THIS LINE
  this.tremoloStrokeCount = 0;
  this.lastTremoloState = 0;
  this.tremoloGroupPhase = 0.0;
}
```

### 4.2 Update Tremolo Logic
Similar to vibrato and trill:
```javascript
// Always update phase
this.tremoloSpeedSmoothed += (tremoloSpeed - this.tremoloSpeedSmoothed) * this.rateSmoothing;
const effectiveTremoloSpeed = this.tremoloSpeedSmoothed * this.tremoloGate;

// Apply tremolo with gate
const effectiveTremoloDepth = tremoloDepth * this.tremoloGate;
// ... rest of tremolo calculations using effectiveTremoloDepth
```

## Step 5: Implement Expression Mixing

### 5.1 Create Unified Mixing Section
After all expression calculations, combine them properly:
```javascript
// Start with base modulation
let finalPitchMod = 1.0;
let finalAmpMod = 1.0;

// Apply continuous expressions (can overlap during transitions)
if (this.vibratoGate > 0.001) {
  const vibratoPitch = 1.0 + vibratoValue * vibratoDepth * this.vibratoGate * 0.06;
  const vibratoAmp = 1.0 + vibratoValue * vibratoDepth * this.vibratoGate * 0.2;
  finalPitchMod *= vibratoPitch;
  finalAmpMod *= vibratoAmp;
}

if (this.tremoloGate > 0.001) {
  // Tremolo calculations...
  finalAmpMod *= tremoloAmpResult;
}

// Apply discrete expressions (trill)
if (this.trillGate > 0.001) {
  // Trill is special - it replaces rather than multiplies
  finalPitchMod = 1.0 + (trillPitchMod - 1.0) * this.trillGate;
  finalAmpMod = 1.0 + (trillAmpMod - 1.0) * this.trillGate;
}

// Use finalPitchMod and finalAmpMod for synthesis
```

## Step 6: Add Transition Management

### 6.1 Add Transition State
```javascript
// In constructor
this.transitionState = 'idle'; // 'idle', 'continuous_to_discrete', etc.
this.transitionProgress = 0.0;
this.transitionFrom = null;
this.transitionTo = null;
```

### 6.2 Add Message Handler for Transitions
```javascript
// In _handleMessage
else if (event.data.type === "transitionExpression") {
  this.transitionFrom = event.data.from;
  this.transitionTo = event.data.to;
  this.transitionState = this.getTransitionType(event.data.from, event.data.to);
  this.transitionProgress = 0.0;
}
```

## Step 7: Testing Points

### 7.1 Add Debug Output
```javascript
// Add periodic debug logging
if (this.debugCounter++ % 1000 === 0) {
  console.log('Expression states:', {
    gates: {
      vibrato: this.vibratoGate.toFixed(3),
      tremolo: this.tremoloGate.toFixed(3),
      trill: this.trillGate.toFixed(3)
    },
    rates: {
      vibrato: this.vibratoRateSmoothed.toFixed(2),
      tremolo: this.tremoloSpeedSmoothed.toFixed(2),
      trill: this.trillSpeedSmoothed.toFixed(2)
    },
    phases: {
      vibrato: this.vibratoPhase.toFixed(3),
      tremolo: this.tremoloPhase.toFixed(3),
      trill: this.trillPhase.toFixed(3)
    }
  });
}
```

## Estimated Effort

- **Step 1-4**: ~2-3 hours (core changes)
- **Step 5**: ~1 hour (mixing logic)
- **Step 6**: ~2 hours (transition management)
- **Step 7**: ~1 hour (testing/debugging)

**Total**: ~6-7 hours for complete implementation

## Benefits

1. **No more clicks** from phase resets
2. **Smooth transitions** via gate interpolation
3. **Rate control** creates natural speed changes
4. **Flexible mixing** allows for creative transitions
5. **Maintainable code** with clear separation of concerns

## Next Steps

1. Start with Steps 1-2 for immediate improvement
2. Test with simple vibrato on/off transitions
3. Add Steps 3-4 for full expression coverage
4. Implement Step 5 for proper mixing
5. Add Step 6 for orchestrated transitions