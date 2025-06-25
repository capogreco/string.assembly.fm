# Harmonic Ratio Generator (HRG) Implementation

## Overview
The Harmonic Ratio Generator (HRG) has been successfully integrated into the String Assembly FM synthesizer control interface. This feature allows users to select harmonic ratios that modify expression parameters (vibrato, tremolo, and trill) when programs are sent to synths.

## Implementation Details

### 1. State Management
The HRG state is managed within `SimpleProgramState` in `app.js`:

```javascript
harmonicSelections: {
  "vibrato-numerator": new Set([1]),
  "vibrato-denominator": new Set([1]),
  "tremolo-numerator": new Set([1]),
  "tremolo-denominator": new Set([1]),
  "trill-numerator": new Set([1]),
  "trill-denominator": new Set([1]),
}
```

Each expression has separate numerator and denominator selections stored as Sets, allowing multiple values to be selected.

### 2. UI Interaction
The harmonic selector UI allows users to:
- Click individual numbers to select/deselect them
- Drag across numbers to select a range
- Have different selections for numerator and denominator rows

When selections change, the `updateHarmonicState()` function updates the state in `SimpleProgramState`.

### 3. Ratio Calculation
The `getRandomHarmonicRatio(expression)` method:
1. Retrieves the selected numerators and denominators for the given expression
2. Randomly picks one value from each set
3. Returns the ratio (numerator/denominator)
4. Defaults to 1.0 if no selections exist

### 4. Parameter Application
When `sendCurrentProgram()` is called:
1. Parameter values from sliders are preserved as the base values
2. A harmonic ratio is calculated using the current HRG selections
3. The slider value (or expression default) is multiplied by this ratio
4. The modified parameter is sent to the synth

Example for vibrato:
```javascript
const vibratoRatio = SimpleProgramState.getRandomHarmonicRatio("vibrato");
// Use the slider value as base, fallback to expression rate, then default
const baseRate = synthProgram.vibratoRate || expression.rate || 5;
synthProgram.vibratoRate = baseRate * vibratoRatio;
```

This ensures that:
- Slider values are respected and used as the foundation
- HRG ratios modify the slider values, not hardcoded defaults
- All expression parameters (rate, depth, articulation) are preserved

## User Experience

### Visual Feedback
- Selected harmonic numbers are highlighted with the accent color
- Active expression groups show their HRG controls
- Selections persist until manually changed

### Musical Effect
- **Numerator > Denominator**: Speeds up the expression (ratio > 1)
- **Numerator < Denominator**: Slows down the expression (ratio < 1)
- **Multiple selections**: Adds rhythmic variety as different synths get different ratios

## Technical Benefits

### 1. Simplified Architecture
- Single state object (`SimpleProgramState`) manages all HRG data
- No complex module dependencies
- Clear data flow from UI → State → Synth

### 2. Parameter Preservation
- Slider values are always preserved as the base
- Expression assignments don't overwrite user settings
- HRG ratios enhance rather than replace manual control

### 3. Predictable Behavior
- HRG selections only affect parameters when explicitly sending programs
- No automatic parameter changes during performance
- Each synth gets its own random ratio from the selected set

### 4. Extensibility
- Easy to add new expressions with HRG support
- Ratio calculation logic is centralized and reusable
- UI components are modular and consistent

## Integration Points

### With Expression System
- HRG enhances existing expressions without changing their core behavior
- Base parameters remain accessible via sliders
- Ratios act as multipliers on top of base values

### With Program Distribution
- Each synth in the ensemble gets a potentially different ratio
- Creates natural variation in expression timing
- Maintains musical coherence through shared base parameters

## Future Enhancements

### Potential Improvements
1. **Ratio Presets**: Save commonly used ratio combinations
2. **Weighted Selection**: Make some ratios more likely than others
3. **Expression-specific Ranges**: Different number ranges for different expressions
4. **Visual Ratio Display**: Show the actual ratios being applied to each synth

### API Extensions
The implementation provides a foundation for:
- MIDI control of HRG selections
- OSC parameter mapping
- Preset management systems
- Advanced algorithmic composition tools

## Conclusion
The HRG implementation successfully bridges the gap between UI interaction and synth parameter control, providing musicians with an intuitive way to create complex, harmonically-related expression variations across their synth ensemble.