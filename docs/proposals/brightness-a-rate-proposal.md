# Proposal: A-Rate Brightness Parameter for Smooth Filter Sweeps

## Summary

Convert the brightness parameter from k-rate (control rate) to a-rate (audio rate) processing to enable smooth filter sweeps without audible stepping or glitching.

## Current Issues

### 1. Stepped Filter Response
- Brightness updates only at block boundaries (every 128 samples)
- Audible stepping when turning Arc encoder
- Not suitable for musical filter sweeps

### 2. Coefficient Update Artifacts
- Abrupt filter coefficient changes cause clicks
- No interpolation between coefficient sets
- Filter state discontinuities

### 3. Dual Update Mechanisms
- Block-level updates (lines 909-913)
- Dynamic brightness updates (lines 1383-1413)
- These can conflict and cause glitches

## Proposed Solution

### Phase 1: Convert Brightness to A-Rate

```javascript
// In parameterDescriptors (line 44-49)
{
  name: "brightness",
  defaultValue: 0.5,
  minValue: 0.0,
  maxValue: 1.0,
  automationRate: "a-rate"  // Changed from "k-rate"
}
```

### Phase 2: Implement Coefficient Smoothing

```javascript
// Add to processor constructor
this.targetBrightness = 0.5;
this.currentBrightness = 0.5;
this.brightnessSmoothing = 0.005; // ~200 sample smoothing

// In process() method
for (let i = 0; i < samplesPerBlock; i++) {
  // Read brightness per-sample
  const targetBrightness = parameters.brightness[i];
  
  // Smooth brightness changes
  if (Math.abs(targetBrightness - this.currentBrightness) > 0.0001) {
    this.currentBrightness += (targetBrightness - this.currentBrightness) * this.brightnessSmoothing;
    
    // Only recalculate coefficients every N samples to save CPU
    if (i % 16 === 0) {
      this.updateFilterCoefficients(this.currentBrightness);
    }
  }
}
```

### Phase 3: Stable Filter Topology

Replace current Direct Form I with State Variable Filter (SVF):

```javascript
// SVF is more stable for modulation
class StateVariableFilter {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.g = 1.0;  // Frequency coefficient
    this.r = 1.0;  // Resonance coefficient
    this.h = 0.0;  // Highpass state
    this.b = 0.0;  // Bandpass state
    this.l = 0.0;  // Lowpass state
  }
  
  setFrequency(freq, smoothing = 0.01) {
    const targetG = Math.tan(Math.PI * freq / this.sampleRate);
    this.g += (targetG - this.g) * smoothing;
  }
  
  process(input) {
    const hp = input - this.r * this.b - this.l;
    const bp = hp * this.g + this.b;
    const lp = bp * this.g + this.l;
    
    this.h = hp;
    this.b = bp;
    this.l = lp;
    
    return lp; // Return lowpass output
  }
}
```

### Phase 4: Remove Conflicting Update Mechanisms

- Remove the dynamic brightness adjustment at sample 0
- Unify all brightness processing in the main loop
- Ensure consistent coefficient updates

## Benefits

1. **Smooth Filter Sweeps**
   - No audible stepping
   - Musical, continuous response
   - Professional quality filter modulation

2. **Better Arc Integration**
   - Direct, responsive control
   - Suitable for performance
   - Can create filter sweep effects

3. **Reduced Artifacts**
   - No clicks or pops
   - Stable filter response
   - Clean transitions

## Performance Considerations

### CPU Impact
- A-rate processing increases CPU usage
- Coefficient calculation throttling (every 16 samples) helps
- SVF is computationally efficient

### Optimization Strategies
1. Only recalculate when brightness changes significantly
2. Use lookup tables for expensive calculations
3. Consider SIMD optimizations for filter processing

## Alternative Approaches

### 1. Parallel Filter Crossfade
- Run two filters, crossfade between them
- Higher CPU but perfectly smooth
- Good for systems with CPU headroom

### 2. Oversampled Control Rate
- Run brightness at 4x or 8x k-rate
- Compromise between quality and CPU
- Easier to implement than full a-rate

### 3. Parameter Remapping
- Map brightness to multiple existing AudioParams
- Use natural parameter ramping
- No worklet changes needed

## Implementation Timeline

1. **Week 1**: Prototype a-rate brightness in test branch
2. **Week 2**: Implement coefficient smoothing
3. **Week 3**: Test and optimize performance
4. **Week 4**: Consider SVF implementation if needed

## Testing Plan

1. Arc encoder sweep tests
2. CPU usage profiling
3. A/B testing with current implementation
4. Stability testing with rapid changes

## Risks and Mitigation

- **Risk**: Increased CPU usage
  - **Mitigation**: Coefficient update throttling, optimization

- **Risk**: Compatibility with existing presets
  - **Mitigation**: Maintain same parameter range and behavior

- **Risk**: Browser audio worklet limitations
  - **Mitigation**: Test across browsers early

## Conclusion

Converting brightness to a-rate processing would significantly improve the musicality and responsiveness of the filter control. While it requires worklet modifications, the benefits for real-time performance control (especially with Arc) make it worthwhile.