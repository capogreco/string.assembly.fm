# Reverb Arc Testing Quick Reference

## Quick Test Procedure

### 1. Initial Check
```bash
# Open controller and synth
# Connect Arc hardware
# Play a chord on the keyboard
```

### 2. Test Arc Positions

| Position | Expected Result | Listen For |
|----------|-----------------|------------|
| 0% | Completely dry | No reverb at all |
| 5% | Subtle ambience | Barely noticeable space |
| 15% | Small room | Intimate, close reflections |
| 30% | Studio space | Professional, controlled reverb |
| 50% | Chamber/Hall boundary | Noticeable space, still clear |
| 70% | Concert hall | Large space, longer tail |
| 90% | Cathedral | Massive space, long decay |
| 100% | Maximum cathedral | Ethereal, swimming in reverb |

### 3. Console Commands for Testing

```javascript
// Check if reverb is initialized
modular.synthClients.get('synth-1').reverbNode

// Manually set reverb value
modular.synthClients.get('synth-1').setReverb(0.5)

// Check current reverb parameters
const node = modular.synthClients.get('synth-1').reverbNode;
['mix', 'roomSize', 'decay', 'damping'].forEach(p => 
  console.log(`${p}: ${node.parameters.get(p).value}`)
)

// Monitor Arc events
eventBus.on('arc:parameterChanged', (data) => {
  if (data.parameter === 'reverb') {
    console.log(`Reverb: ${(data.value * 100).toFixed(1)}%`);
  }
});
```

### 4. Common Issues & Solutions

| Issue | Check | Solution |
|-------|-------|----------|
| No reverb effect | Worklet loaded? | Check console for reverb-processor.js loading |
| Clicking sounds | Ramp times | Increase roomSize ramp to 0.3s |
| CPU overload | Multiple synths? | Reduce max synths or simplify reverb |
| Delayed response | Network throttle | Verify 100ms throttle is working |
| Wrong sound | Parameter mapping | Check ReverbController.mapArcToReverbSpace |

### 5. Expected Parameter Values at Key Points

#### At 25% (Room/Chamber boundary)
- mix: 0.35
- roomSize: 0.30
- decay: 0.40
- damping: 0.60

#### At 50% (Chamber/Hall boundary)
- mix: 0.45
- roomSize: 0.55
- decay: 0.60
- damping: 0.45

#### At 75% (Hall/Cathedral boundary)
- mix: 0.50
- roomSize: 0.75
- decay: 0.75
- damping: 0.35

### 6. Performance Benchmarks

- **Idle CPU**: ~2-3% per reverb instance
- **Active CPU**: ~5-10% during parameter changes
- **Memory**: ~2MB per reverb instance
- **Latency**: <5ms processing delay

### 7. Visual Feedback Check

If UI feedback is implemented:
- Percentage should update smoothly
- Space description should change at boundaries
- No flickering or lag

### 8. Edge Case Tests

1. **Rapid Movement**: Spin encoder quickly
   - Should hear smooth transitions
   - No clicks or audio dropouts

2. **Extreme Jumps**: Jump from 0% to 100%
   - Should ramp smoothly over 300ms
   - No sudden volume spikes

3. **Multiple Synths**: Different reverb per synth
   - Each should maintain independent settings
   - No cross-talk between instances

### 9. Audio Examples to Test

1. **Sustained Notes**: Hold a chord
   - Reverb tail should be clearly audible
   - Decay time should match position

2. **Staccato Notes**: Quick attacks
   - Early reflections prominent at low settings
   - Diffuse wash at high settings

3. **Expression Changes**: With vibrato/tremolo
   - Reverb should not interfere with expressions
   - Modulation should sound natural

### 10. Success Criteria

✓ Fourth encoder controls reverb smoothly  
✓ All positions create musically useful sounds  
✓ No audio artifacts during transitions  
✓ CPU usage remains under 10% total  
✓ Network messages properly throttled  
✓ Each synth has independent reverb control