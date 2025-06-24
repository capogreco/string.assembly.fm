# Piano Roll GUI Functionality Documentation

## Overview

The String Assembly FM controller uses an interactive piano roll interface that allows users to:
1. Build chords by clicking piano keys
2. Apply expression modes (vibrato, tremolo, trill) through drag gestures
3. Configure stochastic variations for each expression type
4. Distribute the configured arrangement to connected synthesizers

## Core Components

### 1. Piano Roll Interface

The piano roll is rendered as an SVG element (`<svg id="piano">`) with individual `<rect>` elements representing keys. Each key stores:
- `data-note-name`: Note name (e.g., "C4", "F#5")
- `data-frequency`: Frequency in Hz
- `data-note`/`data-octave`: Legacy format for compatibility

### 2. Chord Management

**State Storage:**
- `window.currentChord`: Array of note names in the current chord (e.g., ["C4", "E4", "G4"])
- `window.current_chord_state`: Object containing the active arrangement state including chord, base program, and distribution strategy

**Chord Building:**
- Single click on a piano key toggles its membership in the chord
- Visual feedback: Chord notes are colored purple (#9b59b6) by default
- The chord display updates to show current notes and their expressions

### 3. Expression System

The expression system is managed by `SVGInteractiveExpression` class which handles gesture detection and visualization.

#### Expression Types and Gestures

1. **Vibrato** (Upward Drag)
   - Trigger: Drag upward more than 30 pixels (`VIBRATO_THRESHOLD`)
   - Depth: 0-100% based on drag distance (calculated as `Math.min(1.0, Math.abs(dy - VIBRATO_THRESHOLD) / 50)`)
   - Visual: Red (#e74c3c) with depth percentage displayed above the key
   - Parameters affected: `vibratoEnabled`, `vibratoRate`, `vibratoDepth`

2. **Tremolo** (Downward Drag)
   - Trigger: Drag downward more than 30 pixels (`TREMOLO_THRESHOLD`)
   - Depth: 0-100% based on drag distance
   - Visual: Orange (#f39c12) with depth percentage displayed below the key
   - Parameters affected: `tremoloEnabled`, `tremoloSpeed`, `tremoloDepth`, `tremoloArticulation`

3. **Trill** (Horizontal Drag)
   - Trigger: Horizontal drag more than 15 pixels (`HORIZONTAL_THRESHOLD`)
   - Must end on a different key to establish the trill target
   - Visual: Blue (#3498db) dashed curved line connecting source to target note
   - Parameters affected: `trillEnabled`, `trillSpeed`, `trillInterval`, `trillArticulation`
   - Interval: Calculated in semitones between source and target notes

#### Gesture Detection Flow

```
Mouse/Touch Down → Start tracking at dragStartPos
↓
Mouse/Touch Move → Calculate dx, dy from start
↓
If distance > DRAG_THRESHOLD (10px):
  - Check horizontal movement first (for trill priority)
  - Then check vertical thresholds
  - Update visual feedback in real-time
↓
Mouse/Touch Up → Finalize expression assignment
```

### 4. Expression Data Structure

Each note in the chord can have an expression object:

```javascript
// No expression (chord note only)
{ type: "none" }

// Vibrato
{
  type: "vibrato",
  depth: 0.0-1.0,  // From gesture
  rate: 4          // Default, modified by harmonic ratios
}

// Tremolo
{
  type: "tremolo",
  depth: 0.0-1.0,  // From gesture
  speed: 10        // Default, modified by harmonic ratios
}

// Trill
{
  type: "trill",
  targetNote: "E4",     // Note name of trill target
  targetFreq: 329.63,   // Frequency of target
  interval: 4,          // Semitones between notes
  speed: 8              // Default, modified by harmonic ratios
}
```

### 5. Harmonic Ratio Selectors (Stochasticity)

Each expression type has associated harmonic ratio selectors allowing users to define sets of numerator/denominator values.

**UI Structure:**
```html
<div class="harmonic-selector" data-expression="vibrato">
  <div class="harmonic-row" data-type="numerator">
    <span class="harmonic-number" data-value="1">1</span>
    <span class="harmonic-number" data-value="2">2</span>
    <!-- ... more numbers ... -->
  </div>
  <div class="harmonic-row" data-type="denominator">
    <!-- ... denominator numbers ... -->
  </div>
</div>
```

**Selection Storage:**
- Stored in `AppState.harmonicSelections` as Sets
- Key format: `"${expression}-${type}"` (e.g., "vibrato-numerator")
- Multiple selections allowed per row

**Random Selection:**
When distributing to synths, `getRandomHarmonicRatio()` randomly selects one numerator and one denominator from the enabled sets to create a ratio that modifies the expression's rate/speed parameter.

### 6. Program Distribution

#### Distribution Process (`distributeActiveParts()`)

1. **Validation**
   - Check for non-empty chord
   - Verify synths are connected

2. **Filter Distributable Parts**
   - Remove notes with "none" expression type
   - Keep only notes with actual expressions (vibrato, tremolo, trill)

3. **Assignment Strategy** ("randomized-balanced")
   - Uses a shuffle algorithm to ensure roughly equal distribution
   - Each synth gets assigned one note from the chord
   - If more synths than notes: some synths get stop commands
   - If more notes than synths: notes are distributed evenly

4. **Program Generation per Synth**
   ```javascript
   {
     fundamentalFrequency: assignedNoteFrequency,
     vibratoEnabled: true/false,
     vibratoRate: baseRate * harmonicRatio,
     vibratoDepth: expressionDepth,
     // ... other expression parameters ...
   }
   ```

5. **State Persistence**
   - Stores active arrangement in `window.current_chord_state`
   - Used for potential redistribution or state recovery

### 7. Visual Feedback System

The `SVGInteractiveExpression` uses a canvas overlay for expression indicators:

1. **Canvas Overlay**
   - Positioned absolutely over the SVG piano
   - Extra padding (40px) for indicators outside piano bounds
   - Cleared and redrawn on each render cycle

2. **Key Coloring**
   - Default (white/black): No selection
   - Purple (#9b59b6): Chord note without expression
   - Red (#e74c3c): Vibrato
   - Orange (#f39c12): Tremolo  
   - Blue (#3498db): Trill
   - Lighter shades for related notes (trill targets)

3. **Real-time Feedback**
   - Keys brighten on mouse down
   - Color changes during drag to indicate potential expression
   - Depth percentages shown for vibrato/tremolo
   - Curved arrows for trill connections

### 8. Save/Load Functionality

Programs can be saved to 5 banks, storing:
- All parameter values
- Chord notes array
- Expression assignments for each note
- Harmonic ratio selections

Loading a bank restores the complete state including visual representation.

## Integration Points

### Event Flow
```
User Gesture → SVGInteractiveExpression → Expression Assignment
                                        ↓
                              Update window.currentChord
                                        ↓
                              Update Visual Display
                                        ↓
                    User Clicks "Send Current Program"
                                        ↓
                              distributeActiveParts()
                                        ↓
                    Programs sent to individual synths via WebRTC
```

### Key Global Objects
- `window.svgExpression`: Instance of SVGInteractiveExpression
- `window.currentChord`: Array of note names
- `window.chordDistributor`: Handles distribution logic
- `AppState.harmonicSelections`: Stores ratio selections
- `NetworkManager.peers`: Connected synthesizers

## Modular Refactor Considerations

The monolithic `ctrl-main-logic.js` tightly couples several concerns that should be separated:

1. **Gesture Detection** → `PianoExpressionHandler` module
2. **Visual Rendering** → Separate rendering module or integrate with PianoKeyboard
3. **Expression State** → `ExpressionManager` module
4. **Distribution Logic** → `ChordDistributor` module
5. **Network Communication** → `NetworkCoordinator` module

The key challenge is maintaining the real-time visual feedback and gesture recognition while decoupling the state management and distribution logic.