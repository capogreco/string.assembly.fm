# Expression Transition Issues - Summary

## Problem Statement

We're trying to implement smooth, click-free transitions between different expression states (none, vibrato, tremolo, trill) in a bowed string synthesizer. The fundamental challenge is that toggling boolean enable flags (`vibratoEnabled`, `tremoloEnabled`, `trillEnabled`) causes audible discontinuities, even when the associated depth parameters are at zero.

## Current Architecture

### Audio Worklet Parameters
- Boolean flags: `vibratoEnabled`, `tremoloEnabled`, `trillEnabled` (0 or 1)
- Depth parameters: `vibratoDepth`, `tremoloDepth`, `tremoloArticulation`, `trillArticulation`
- Rate/speed parameters: `vibratoRate`, `tremoloSpeed`, `trillSpeed`, `trillInterval`

### Internal Worklet Behavior
- When an expression is enabled (`xxxEnabled > 0.5`), it sets an internal `xxxActive` flag
- When disabled, it immediately:
  - Sets `xxxActive = false`
  - Resets phase accumulators (e.g., `vibratoPhase = 0`)
  - This causes clicks/discontinuities

## Approaches Attempted

### 1. Complex State Tracking (Failed)
- Tried to detect when expressions were "turning on" or "turning off"
- Attempted to force depth parameters to ramp from/to zero
- Became overly complex with edge cases

### 2. Orchestrated Transitions (Partially Successful)
- Ramp depth to 0 → toggle boolean → ramp depth up
- Still caused clicks when toggling the boolean flags

### 3. Depth-Only Control (Current Approach - Has Issues)
- Set all expression booleans to `true` at initialization
- Never toggle booleans during operation
- Control expressions purely through depth parameters
- **Problem**: With all expressions enabled (even at zero depth), the synth becomes almost silent

## Key Findings

1. **Boolean toggles cause discontinuities** regardless of depth values
2. **Phase resets** when disabling expressions cause clicks
3. **Multiple enabled expressions interfere** even when depths are zero
4. The worklet's internal logic for handling multiple simultaneous expressions appears to have issues

## Suggested Investigations

### 1. Analyze Expression Mixing in the Worklet
Look for code that handles multiple expressions being enabled simultaneously:
```javascript
if (vibratoEnabled && !trillEnabled && !tremoloEnabled) {
    // This suggests mutual exclusion is expected
}
```
The expressions might be designed to be mutually exclusive.

### 2. Check Amplitude Modulation Stacking
When multiple expressions are enabled, amplitude modulations might multiply:
```javascript
ampModulation = 1.0;
if (vibratoActive) ampModulation *= vibratoEffect;
if (tremoloActive) ampModulation *= tremoloEffect;
// Could result in very small values if multiple are active
```

### 3. Investigate Signal Path Changes
Check if enabling an expression changes the signal routing even when depth=0:
- Does it add processing stages?
- Does it change gain staging?
- Are there unintended interactions?

### 4. Test Worklet Behavior Isolation
Create minimal test cases:
- Single expression enabled with depth=0 vs disabled
- Multiple expressions enabled with all depths=0
- Measure actual output levels

## Potential Solutions

### 1. Modify Worklet for True Depth-Only Control
- Remove internal `xxxActive` flags
- Make expressions truly independent
- Ensure depth=0 means zero processing/effect

### 2. Implement Mutual Exclusion Properly
- Accept that only one expression can be active at a time
- Implement clean handoff between expressions
- Use masterGain dip to mask the transition moment

### 3. Create Expression Mixer/Router
- Add a new parameter for expression selection (0=none, 1=vibrato, 2=tremolo, 3=trill)
- Internally route to the appropriate expression
- Smooth transitions through crossfading

### 4. Rethink Expression Architecture
- Instead of boolean enables, use a single "expressionMix" parameter per expression
- 0 = fully off, 1 = fully on
- Allows partial mixing and smooth transitions

## Next Steps

1. **Examine the DSP code** in `bowed_string_worklet.js` for expression interactions
2. **Add logging** to understand why multiple enabled expressions cause volume reduction
3. **Test the hypothesis** that expressions are meant to be mutually exclusive
4. **Consider architectural changes** to support smooth transitions

## Code References

- Main worklet: `string.assembly.fm/bowed_string_worklet.js`
- Test interface: `string.assembly.fm/test-ensemble.html`
- Transition plan: `string.assembly.fm/TRANSITION_PLAN.md`

## Test Commands for Reproduction

```javascript
// Initialize synth with all expressions enabled
enableAllExpressions(0);

// This should smoothly fade in vibrato over 3 seconds
// But instead, the synth becomes almost silent
transitionToExpression(0, 'vibrato', 3.0);

// These also exhibit the problem
toVibrato(3);
toNone(3);
toTremolo(3);
```
