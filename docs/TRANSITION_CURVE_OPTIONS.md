# Transition Curve Options

## Overview
This document provides different mathematical curve options for expression transitions, focusing on curves that spend more time at slow rates for musical naturalness.

## Current Implementation

### Rate Modulation
Rate directly follows master progress (linear):
```javascript
const rateModFactor = this.masterProgress;
```

### Depth/Intensity Modulation
Uses power curves with different exponents for starting vs stopping.

## Alternative Curve Options

### 1. Exponential Curves (More Time at Slow Rates)

#### For Starting Expressions
```javascript
// Exponential curve - very slow start, accelerates later
const rateModFactor = (Math.exp(this.masterProgress * 3) - 1) / (Math.exp(3) - 1);

// Depth lags behind even more
const depthModFactor = Math.pow(rateModFactor, 2.0);
```

#### For Stopping Expressions
```javascript
// Inverse exponential - stays fast longer, then rapidly slows
const rateModFactor = 1.0 - (Math.exp((1.0 - this.masterProgress) * 3) - 1) / (Math.exp(3) - 1);

// Depth drops off early
const depthModFactor = Math.pow(rateModFactor, 0.3);
```

### 2. S-Curve (Smooth Acceleration/Deceleration)

```javascript
// Sigmoid function for smooth transitions
function sigmoid(x, steepness = 5) {
  const shifted = (x - 0.5) * steepness;
  return 1 / (1 + Math.exp(-shifted));
}

// For starting - slow beginning and end
const rateModFactor = sigmoid(this.masterProgress, 4);

// For stopping - inverse sigmoid
const rateModFactor = 1.0 - sigmoid(1.0 - this.masterProgress, 4);
```

### 3. Cosine-Based Curves

```javascript
// Cosine curve - very smooth, spends time at extremes
// For starting
const rateModFactor = 0.5 - 0.5 * Math.cos(this.masterProgress * Math.PI);

// For stopping - emphasizes slow end
const rateModFactor = 0.5 + 0.5 * Math.cos(this.masterProgress * Math.PI);
```

### 4. Piecewise Linear (Musical Segments)

```javascript
// Three-segment curve for more control
function piecewiseRate(progress, isStarting) {
  if (isStarting) {
    // Starting: 40% of time getting to 10% speed, then accelerate
    if (progress < 0.4) {
      return progress * 0.25; // 0 to 0.1
    } else if (progress < 0.7) {
      return 0.1 + (progress - 0.4) * 1.5; // 0.1 to 0.55
    } else {
      return 0.55 + (progress - 0.7) * 1.5; // 0.55 to 1.0
    }
  } else {
    // Stopping: Stay fast, then decelerate slowly
    if (progress < 0.3) {
      return 1.0 - progress * 0.5; // 1.0 to 0.85
    } else if (progress < 0.7) {
      return 0.85 - (progress - 0.3) * 1.5; // 0.85 to 0.25
    } else {
      return 0.25 - (progress - 0.7) * 0.833; // 0.25 to 0
    }
  }
}
```

### 5. Musical Timing Curves

Based on musical accelerando/ritardando patterns:

```javascript
// Accelerando curve (for starting)
function accelerandoCurve(progress) {
  // Based on typical musical accelerando
  // Slow start, gradual acceleration, slight ease at end
  if (progress < 0.5) {
    // First half: very gradual acceleration
    return Math.pow(progress * 2, 3) * 0.3;
  } else {
    // Second half: faster acceleration with slight ease
    const p = (progress - 0.5) * 2;
    return 0.3 + (1 - Math.pow(1 - p, 2)) * 0.7;
  }
}

// Ritardando curve (for stopping)
function ritardandoCurve(progress) {
  // Based on typical musical ritardando
  // Gradual slowing that becomes more pronounced
  return Math.pow(Math.cos((progress * Math.PI) / 2), 2.5);
}
```

## Implementation Examples

### For Vibrato

```javascript
// In process() method
if (state.phase === "STARTING" && state.target === "VIBRATO") {
  // Use exponential curve for very slow start
  const expFactor = (Math.exp(this.vibratoMasterProgress * 2.5) - 1) / (Math.exp(2.5) - 1);
  vibratoRateModFactor = expFactor;
  
  // Depth comes in even later
  vibratoDepthModFactor = Math.pow(expFactor, 2.5);
} else if (state.phase === "STOPPING" && state.current === "VIBRATO") {
  // Use musical ritardando curve
  vibratoRateModFactor = Math.pow(Math.cos((this.vibratoMasterProgress * Math.PI) / 2), 2);
  
  // Depth fades early
  vibratoDepthModFactor = Math.pow(this.vibratoMasterProgress, 0.2);
}
```

### For Tremolo

```javascript
// Tremolo benefits from hearing individual slow strokes
if (state.phase === "STARTING" && state.target === "TREMOLO") {
  // Piecewise curve - stay slow longer
  if (this.tremoloMasterProgress < 0.5) {
    tremoloRateModFactor = this.tremoloMasterProgress * 0.3; // 0 to 0.15
  } else {
    tremoloRateModFactor = 0.15 + (this.tremoloMasterProgress - 0.5) * 1.7; // 0.15 to 1.0
  }
  
  // Depth emphasizes individual strokes when slow
  tremoloDepthModFactor = Math.pow(tremoloRateModFactor, 1.5);
}
```

### For Trill

```javascript
// Trill needs clear note separation at slow speeds
if (state.phase === "STARTING" && state.target === "TRILL") {
  // S-curve with shallow middle
  const shifted = (this.trillMasterProgress - 0.5) * 3;
  trillRateModFactor = 1 / (1 + Math.exp(-shifted));
  
  // Intensity comes in gradually to maintain clarity
  trillIntensityModFactor = Math.pow(trillRateModFactor, 2.0);
}
```

## Tuning Guidelines

1. **Listen for Natural Timing**: The transition should feel like a human performer
2. **Avoid Sudden Changes**: Even with curves, ensure smooth derivatives
3. **Test at Different Speeds**: Transitions should work for various expression rates
4. **Consider Musical Context**: Fast pieces might need quicker transitions

## Recommended Starting Point

For maximum time at slow rates while maintaining musicality:

```javascript
// Starting expressions
const rateModFactor = (Math.exp(this.masterProgress * 2.5) - 1) / (Math.exp(2.5) - 1);
const depthModFactor = Math.pow(rateModFactor, 2.0);

// Stopping expressions  
const rateModFactor = Math.pow(Math.cos((this.masterProgress * Math.PI) / 2), 2);
const depthModFactor = Math.pow(this.masterProgress, 0.25);
```

These curves provide:
- Extended time at slow rates (especially 0-20% of full speed)
- Smooth acceleration/deceleration
- Musical feel similar to human performance
- Clear perception of the transition process