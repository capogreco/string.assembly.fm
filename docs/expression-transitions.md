# Expression Transition System

## Overview
The String Assembly FM synthesizer features a sophisticated expression transition system that enables smooth, musical transitions between different playing techniques (vibrato, tremolo, trill). This system operates at the worklet level and provides precise control over how expressions change over time.

## Architecture

### Hub-and-Spoke Model
The transition system uses a **hub-and-spoke architecture** where:
- **Hub**: The "NONE" state (no expression)
- **Spokes**: Active expressions (VIBRATO, TREMOLO, TRILL)

**Key Rule**: Direct transitions between active expressions are not allowed. All transitions must go through the NONE state first.

Examples:
- ✅ VIBRATO → NONE → TREMOLO (allowed)
- ❌ VIBRATO → TREMOLO (not allowed, automatically routed through NONE)

### State Machine
Each synth worklet maintains an expression state machine with these phases:

1. **IDLE**: Stable state, expression is fully active or fully off
2. **STOPPING**: Gradually reducing current expression intensity
3. **WAITING**: Brief pause at NONE between expressions
4. **STARTING**: Gradually increasing new expression intensity

## Implementation Details

### Message Types
The system uses two key message types sent to the worklet:

#### setTransitionConfig
Configures transition timing parameters:
```javascript
{
  type: "setTransitionConfig",
  config: {
    duration: 1.0,      // Transition duration in seconds
    spread: 0.2,        // Timing spread factor (0-1)
    stagger: "sync",    // "sync", "cascade", or "random"
    variance: 0.1       // Random timing variance (0-1)
  }
}
```

#### setExpression
Triggers an expression transition:
```javascript
{
  type: "setExpression",  
  expression: "VIBRATO"   // "NONE", "VIBRATO", "TREMOLO", or "TRILL"
}
```

### Transition Timing

#### Stagger Modes
- **sync**: All synths transition simultaneously
- **cascade**: Synths transition in sequence (VIBRATO → TREMOLO → TRILL order)
- **random**: Random delays within the spread duration

#### Smart Stopping Points
Each expression has intelligent stopping conditions:
- **Vibrato**: Can stop at any point (smooth)
- **Tremolo**: Stops at stroke boundaries for natural articulation
- **Trill**: Stops at note boundaries to avoid pitch glitches

### Integration with Program Sending

When `sendCurrentProgram()` is called:

1. **Parameter Updates**: Traditional enabled/disabled flags and parameter values are sent
2. **Transition Config**: Timing configuration is sent to each worklet
3. **Expression Commands**: `setExpression` messages are sent with calculated delays

```javascript
// Example sequence for a synth receiving vibrato
1. Send program with vibratoEnabled=1, vibratoRate=6.5
2. Send setTransitionConfig with timing parameters  
3. Send setExpression with expression="VIBRATO" (potentially delayed)
```

## User Experience

### Transition Controls
Users can control transitions via UI sliders:
- **Duration**: How long transitions take (0.5-5.0 seconds)
- **Spread**: Timing variation between synths (0-100%)
- **Stagger**: Synchronization mode (sync/cascade/random)
- **Variance**: Random timing jitter (0-100%)

### Musical Effects

#### Sync Mode
All synths transition together - creates unified ensemble changes:
```
Synth 1:  VIBRATO -----> TREMOLO
Synth 2:  VIBRATO -----> TREMOLO  
Synth 3:  VIBRATO -----> TREMOLO
```

#### Cascade Mode  
Synths transition in sequence - creates wave-like effects:
```
Synth 1:  VIBRATO -----> TREMOLO
Synth 2:      VIBRATO -----> TREMOLO
Synth 3:          VIBRATO -----> TREMOLO
```

#### Random Mode
Random delays create organic, natural-sounding changes:
```
Synth 1:    VIBRATO -----> TREMOLO
Synth 2:  VIBRATO -------> TREMOLO
Synth 3:      VIBRATO -> TREMOLO
```

## Technical Benefits

### Smooth Transitions
- No abrupt parameter changes that cause audio artifacts
- Expressions fade in/out naturally 
- Maintains musical phrasing and flow

### Ensemble Coordination
- Multiple synths can transition with sophisticated timing relationships
- Creates complex polyrhythmic effects from simple user actions
- Supports both synchronized and staggered transitions

### Robust State Management
- Handles interruptions gracefully (e.g., changing target mid-transition)
- Prevents impossible transitions through hub-and-spoke enforcement
- Maintains consistent state across network-distributed synths

## Code Integration

### In sendCurrentProgram()
```javascript
// Calculate transition timing for each synth
const transitionTiming = SimpleProgramState.calculateTransitionTiming(
  transitionConfig,
  synthIndex
);

// Send program with timing
networkCoordinator.sendProgramToSynth(synthId, program, transitionTiming);

// Configure worklet transitions
networkCoordinator.sendCommandToSynth(synthId, {
  type: "setTransitionConfig", 
  config: transitionConfig
});

// Trigger expression transition (with delay)
setTimeout(() => {
  networkCoordinator.sendCommandToSynth(synthId, {
    type: "setExpression",
    expression: targetExpression
  });
}, expressionDelay * 1000);
```

### In Worklet (_updateExpressionState)
```javascript
// State machine handles the transition logic
switch (state.phase) {
  case "STOPPING":
    // Gradually reduce current expression
    if (params.canStopAt()) {
      state.stopProgress += params.stopRate;
      if (state.stopProgress >= 1.0) {
        state.phase = "WAITING";
      }
    }
    break;
    
  case "STARTING": 
    // Gradually increase new expression
    state.startProgress += params.startRate;
    if (state.startProgress >= 1.0) {
      state.current = state.target;
      state.phase = "IDLE";
    }
    break;
}
```

## Future Enhancements

### Planned Features
1. **Custom Transition Curves**: Non-linear fade shapes (exponential, s-curve, etc.)
2. **Expression Morphing**: Gradual parameter changes during transitions  
3. **MIDI Control**: Real-time transition triggering via MIDI controllers
4. **Preset Transition Patterns**: Saved timing configurations for different musical styles

### API Extensions
The system provides a foundation for:
- Algorithmic composition with expression automation
- Performance tools with gestural control
- Advanced ensemble coordination features
- Integration with DAW automation systems

## Conclusion
The expression transition system bridges the gap between simple on/off expression control and sophisticated musical performance, enabling natural, expressive playing techniques across distributed synth ensembles while maintaining technical robustness and musical coherence.