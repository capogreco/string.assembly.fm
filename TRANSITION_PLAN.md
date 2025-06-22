# String Assembly FM - Transition Implementation Plan

## Overview
This document outlines the implementation plan for smooth parameter transitions in the String Assembly FM synthesizer system. Transitions allow parameters to morph smoothly between states rather than jumping instantly, creating more musical results.

## Transition Types
1. **Portamento** - Smooth interpolation between values
2. **Sinusoidal Dip** - Values fade to zero sinusoidally, then fade up to new value

## Implementation Phases

### Phase 1: Basic Single Parameter Transitions
**Goal**: Prove the concept with frequency transitions only

#### Increment 1.1: Linear Portamento for Frequency
- [x] Add transition parsing to `handleParamMessage` 
- [x] Implement basic linear portamento for `fundamentalFrequency` using `AudioParam.linearRampToValueAtTime`.
- [x] Test: Send program change with transition, verify smooth frequency change
- **Deliverable**: Smooth pitch glides between notes

#### Increment 1.2: Exponential Frequency Transitions  
- [x] Implement exponential portamento for `fundamentalFrequency` using `AudioParam.exponentialRampToValueAtTime`.
- [x] Test: Verify musical pitch transitions (equal time per octave)
- **Deliverable**: More natural sounding pitch transitions

### Phase 2: Multi-Parameter Transitions

#### Increment 2.1: Extend to Continuous Parameters
- [x] Add transitions for: bowForce, bowPosition, bowSpeed, stringDamping, brightness
- [x] Each uses appropriate `AudioParam` ramping method (`linearRampToValueAtTime` or `exponentialRampToValueAtTime`).
- [x] Test: Multi-parameter morphs create smooth timbral changes
- **Deliverable**: Full timbral morphing

#### Increment 2.2: Sinusoidal Dip Transitions
- [x] Implement "dip" transition type using `AudioParam.setValueCurveAtTime`. This involves:
  - Pre-calculating an array representing a sinusoidal curve from current value to zero.
  - Pre-calculating an array representing a sinusoidal curve from zero to the target value.
  - Applying these curves sequentially.
- [x] Add parameter to control dip timing (e.g., duration of dip-down vs rise-up).
- [x] Test: Parameters smoothly fade out to zero and then back in to new values.
- **Deliverable**: Click-free transitions for any parameter, especially useful for on/off states or switching effects.

### Phase 3: Expression Handling

#### Increment 3.1: Boolean Parameter Transitions
- [ ] Handle `vibratoEnabled`, `tremoloEnabled`, `trillEnabled` by transitioning their associated continuous parameters (e.g., `vibratoDepth`, `tremoloDepth`, `trillIntensity/Mix`) using sinusoidal dip/rise.
  - When an expression is disabled, its continuous parameter (e.g., depth) dips to zero.
  - When an expression is enabled, its continuous parameter rises from zero to target value.
  - When switching e.g. from vibrato to tremolo: `vibratoDepth` dips to zero, `tremoloDepth` rises from zero.
- [ ] Test: Expressions fade out/in smoothly; switching between expressions feels like a crossfade.
- **Deliverable**: Smooth, musically coherent expression changes.

#### Increment 3.2: Expression Depth Transitions
- [ ] Transition expression depths/rates directly as continuous parameters using portamento (`linearRampToValueAtTime` or `exponentialRampToValueAtTime`).
- [ ] Test: Vibrato gradually speeds up/slows down, depth morphs
- **Deliverable**: Expressive morphing between different vibrato/tremolo settings

### Phase 4: Diversity Controls

#### Increment 4.1: Random Lag Implementation
- [ ] Add lag range and sampling to each synth
- [ ] Test: Multiple synths start transitions at slightly different times
- **Deliverable**: Natural ensemble timing variations

#### Increment 4.2: Random Period Implementation  
- [ ] Add period range and sampling
- [ ] Support different probability distributions (uniform, normal, exponential)
- [ ] Test: Synths complete transitions at different rates
- **Deliverable**: Organic ensemble morphing

### Phase 5: Integration

#### Increment 5.1: Bank Load Transitions
- [ ] Extend load command to support transition specifications
- [ ] Test: Loading banks morphs smoothly instead of jumping
- **Deliverable**: Musical bank switching

#### Increment 5.2: Interrupt Handling
- [ ] Properly handle new transitions starting mid-transition:
  - Call `AudioParam.cancelScheduledValues(audioContext.currentTime)` to clear any pending ramps.
  - Get the parameter's current actual value using `AudioParam.value`.
  - Call `AudioParam.setValueAtTime(currentActualValue, audioContext.currentTime)` to pin the value.
  - Schedule the new transition from this `currentActualValue`.
- [ ] Test: Rapid program changes remain smooth and responsive.
- **Deliverable**: Robust transition system that correctly handles overlapping transition requests.

### Phase 6: Controller Interface

#### Increment 6.1: UI Controls for Transitions
- [ ] Add transition type selector to controller
- [ ] Add lag/period range controls
- [ ] Test: Can control transition behavior from UI
- **Deliverable**: Full user control over transitions

#### Increment 6.2: Preset Transition Behaviors
- [ ] Add musical presets (snap, glide, morph, crossfade)
- [ ] Test: Quick access to common transition types
- **Deliverable**: User-friendly transition system

## Testing Strategy for Each Increment
1. **Unit test**: Verify the math/interpolation functions
2. **Single synth test**: Confirm behavior with one test synth
3. **Ensemble test**: Verify behavior across multiple synths
4. **Musical test**: Play actual musical phrases to verify musicality

## Message Format Design
```javascript
{
  type: 'program',
  program: { /* target values */ },
  transition: {
    type: 'portamento' | 'dip',
    lag: { min: 0, max: 0.5, distribution: 'uniform' },
    period: { min: 0.5, max: 2.0, distribution: 'exponential' },
    // Per-parameter overrides (optional)
    overrides: {
      fundamentalFrequency: { type: 'portamento', curve: 'exponential' },
      vibratoEnabled: { type: 'dip' }
    }
  }
}
```

## Key Design Decisions
- All parameters can transition
- Pan is fixed per synth and never transitions
- Interruptions override using current interpolated value as start. This involves:
  - `AudioParam.cancelScheduledValues(audioContext.currentTime)`
  - Get `AudioParam.value`
  - `AudioParam.setValueAtTime(currentValue, audioContext.currentTime)`
  - Schedule new ramp.
- No explicit state tracking for simple ramps - read current values from `AudioParam.value` and leverage `AudioParam` scheduling. Custom curves like sinusoidal dips might require minimal temporary state for curve generation if not fully covered by `setValueCurveAtTime`.
- Utilize `AudioParam.linearRampToValueAtTime`, `AudioParam.exponentialRampToValueAtTime`, and `AudioParam.setValueCurveAtTime` as primary mechanisms for transitions.
- Exponential curves for frequency-domain parameters.
- Boolean expression parameters (e.g., `vibratoEnabled`) are handled by transitioning their associated continuous parameters (e.g., `vibratoDepth`) to/from zero, often using a dip/rise.
- Each synth samples its own lag/period for ensemble diversity

## Notes
- Expressions during transitions continue to modulate but their strength morphs (e.g., `vibratoDepth` transitions).
- Consider expression changes (e.g., enabling/disabling vibrato) as transitions of their associated continuous parameters.
- `AudioParam` scheduling methods (`linearRampToValueAtTime`, `exponentialRampToValueAtTime`, `setValueCurveAtTime`, `cancelScheduledValues`) are central to implementing transitions efficiently and accurately.