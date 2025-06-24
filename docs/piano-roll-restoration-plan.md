# Piano Roll GUI Restoration Plan

## Problem Summary

The modular refactor of the String Assembly FM controller has lost critical piano roll functionality, specifically:
- Expression gesture detection (vibrato, tremolo, trill)
- Real-time visual feedback during drag operations
- Depth calculation from gesture distance
- Proper state synchronization between chord notes and expressions

## Root Cause Analysis

The original implementation relied on `SVGInteractiveExpression` class (`src/dsp/svg_interactive_expression.js`) which provided:
1. Gesture detection with configurable thresholds
2. Canvas overlay for visual feedback
3. Expression-to-note mapping
4. Real-time drag feedback

The modular `PianoExpressionHandler` appears to be incomplete and missing key functionality.

## Implementation Plan

### Phase 1: Restore Core Gesture Detection (Priority: Critical)

#### 1.1 Fix PianoExpressionHandler Gesture Math
```javascript
// In PianoExpressionHandler.js

// Correct depth calculation for vibrato/tremolo
calculateExpressionDepth(dy, threshold) {
  return Math.min(1.0, Math.abs(dy - threshold) / 50);
}

// Update endDrag() method:
else if (dy < this.VIBRATO_THRESHOLD) {
  expression = {
    type: "vibrato",
    depth: this.calculateExpressionDepth(dy, this.VIBRATO_THRESHOLD),
    rate: 4  // Base rate, modified later by harmonic ratios
  };
}
else if (dy > this.TREMOLO_THRESHOLD) {
  expression = {
    type: "tremolo", 
    depth: this.calculateExpressionDepth(dy, this.TREMOLO_THRESHOLD),
    speed: 10  // Base speed, modified later by harmonic ratios
  };
}
```

#### 1.2 Fix Trill Detection
```javascript
// Trill needs to store target note information
else if (Math.abs(dx) > this.HORIZONTAL_THRESHOLD) {
  const targetKey = this.getKeyFromPosition(x, y);
  if (targetKey && targetKey.note !== this.dragStartNote) {
    expression = {
      type: "trill",
      targetNote: targetKey.note,
      targetFreq: targetKey.frequency,
      interval: this.calculateInterval(this.dragStartNote, targetKey.note),
      speed: 8  // Base speed
    };
  }
}
```

### Phase 2: Implement Visual Feedback System (Priority: High)

#### 2.1 Create Canvas Overlay
```javascript
// Add to PianoExpressionHandler constructor
createOverlay() {
  const svgRect = this.svg.getBoundingClientRect();
  
  this.overlay = document.createElement('canvas');
  this.overlay.style.position = 'absolute';
  this.overlay.style.pointerEvents = 'none';
  this.overlay.style.zIndex = '1000';
  
  // Size with padding for indicators
  this.canvasPadding = 40;
  this.overlay.width = svgRect.width + this.canvasPadding * 2;
  this.overlay.height = svgRect.height + this.canvasPadding * 2;
  
  this.svg.parentElement.appendChild(this.overlay);
  this.overlayCtx = this.overlay.getContext('2d');
}
```

#### 2.2 Real-time Drag Feedback
```javascript
// Update updateDrag() to show visual feedback
updateDrag(x, y) {
  // ... existing code ...
  
  // Clear and redraw overlay
  this.render();
  
  // Draw depth indicator
  if (this.potentialExpressionType === 'vibrato' || 
      this.potentialExpressionType === 'tremolo') {
    const depth = this.calculateExpressionDepth(dy, 
      this.potentialExpressionType === 'vibrato' ? 
        this.VIBRATO_THRESHOLD : this.TREMOLO_THRESHOLD);
    this.drawDepthIndicator(this.dragStartPos.x, y, depth);
  }
}
```

#### 2.3 Expression Indicators
```javascript
drawExpressionIndicators() {
  for (const [note, expression] of this.expressions) {
    const keyElement = this.getKeyElement(note);
    if (!keyElement) continue;
    
    switch (expression.type) {
      case 'vibrato':
        this.drawVibratoIndicator(keyElement, expression.depth);
        break;
      case 'tremolo':
        this.drawTremoloIndicator(keyElement, expression.depth);
        break;
      case 'trill':
        this.drawTrillConnection(keyElement, expression.targetNote);
        break;
    }
  }
}
```

### Phase 3: State Management Integration (Priority: High)

#### 3.1 Synchronize with App State
```javascript
// Ensure PianoExpressionHandler updates both local and app state
setExpression(note, expression) {
  // Update local state
  if (expression.type === 'none') {
    this.expressions.delete(note);
  } else {
    this.expressions.set(note, expression);
  }
  
  // Update app state
  const currentExpressions = this.pianoKeyboard.appState.get('expressions') || {};
  currentExpressions[note] = expression;
  this.pianoKeyboard.appState.set('expressions', currentExpressions);
  
  // Emit event for other modules
  this.pianoKeyboard.eventBus.emit('expression:changed', {
    note,
    expression,
    allExpressions: this.getAllExpressions()
  });
  
  // Update visuals
  this.updateKeyVisual(this.getKeyElement(note), note);
  this.render();
}
```

#### 3.2 Implement getAllExpressions()
```javascript
getAllExpressions() {
  const result = {};
  
  // Include all chord notes
  for (const note of this.chordNotes) {
    result[note] = this.expressions.get(note) || { type: 'none' };
  }
  
  return result;
}
```

### Phase 4: Fix Distribution Logic (Priority: Medium)

#### 4.1 Update ExpressionManager
```javascript
// In modules/audio/ExpressionManager.js
assignNoteToSynth(synthId, chordState) {
  if (!chordState || chordState.chord.length === 0) {
    return null;
  }
  
  // Get expressions from app state
  const expressions = this.appState.get('expressions') || {};
  
  // Select note for this synth
  const assignedNote = this.selectNoteForSynth(synthId, chordState.chord);
  const expression = expressions[assignedNote] || { type: 'none' };
  
  // Build synth program
  const synthProgram = { ...chordState.baseProgram };
  synthProgram.fundamentalFrequency = this.noteToFrequency(assignedNote);
  
  // Apply expression parameters
  this.applyExpressionToProgram(synthProgram, expression);
  
  return {
    program: synthProgram,
    metadata: {
      baseNote: assignedNote,
      expression: expression.type
    }
  };
}
```

### Phase 5: Testing & Validation (Priority: High)

#### 5.1 Create Test Harness
```javascript
// test-piano-expressions.js
function testExpressionDetection() {
  const tests = [
    { dx: 0, dy: -40, expected: 'vibrato' },
    { dx: 0, dy: 40, expected: 'tremolo' },
    { dx: 30, dy: 5, expected: 'trill' },
    { dx: 5, dy: 5, expected: 'none' }
  ];
  
  tests.forEach(test => {
    const result = detectExpression(test.dx, test.dy);
    console.assert(result.type === test.expected, 
      `Failed: ${JSON.stringify(test)}`);
  });
}
```

#### 5.2 Visual Debugging Tools
```javascript
// Add debug mode to PianoExpressionHandler
enableDebugMode() {
  this.debugMode = true;
  
  // Show thresholds visually
  this.drawThresholdGuides();
  
  // Log all gesture data
  this.on('drag', (data) => {
    console.log('Drag data:', data);
  });
}
```

## Migration Steps

1. **Backup Current State**: Save current `PianoExpressionHandler.js` before modifications

2. **Incremental Implementation**:
   - Start with Phase 1.1 (gesture math) - test with console logs
   - Add Phase 2.1 (canvas overlay) - verify visual rendering
   - Implement Phase 3.1 (state sync) - ensure chord/expression coupling
   - Complete remaining phases

3. **Integration Testing**:
   - Test each expression type individually
   - Test chord building with mixed expressions
   - Test save/load functionality
   - Test distribution to synths

4. **Fallback Strategy**:
   - Keep original `SVGInteractiveExpression` available as reference
   - Consider using it directly if modular approach proves too complex

## Key Files to Modify

1. `public/js/modules/piano/PianoExpressionHandler.js` - Main implementation
2. `public/js/modules/audio/ExpressionManager.js` - Distribution logic
3. `public/js/modules/ui/PianoKeyboard.js` - Integration point
4. `public/js/modules/state/AppState.js` - Add expressions state

## Success Criteria

- [ ] Vibrato gesture creates expression with 0-100% depth
- [ ] Tremolo gesture creates expression with 0-100% depth  
- [ ] Trill gesture connects two notes with interval calculation
- [ ] Visual feedback shows during drag operation
- [ ] Expression indicators persist after gesture
- [ ] Save/load preserves all expression data
- [ ] Distribution assigns correct parameters to synths
- [ ] No regression in chord building functionality

## Timeline Estimate

- Phase 1: 2-3 hours (critical path)
- Phase 2: 3-4 hours (visual complexity)
- Phase 3: 1-2 hours (state management)
- Phase 4: 1-2 hours (distribution logic)
- Phase 5: 2-3 hours (testing/debugging)

**Total: 10-14 hours of focused development**

## Alternative Approach

If the modular approach proves too difficult, consider:
1. Directly importing and adapting `SVGInteractiveExpression` into the modular system
2. Creating a compatibility wrapper that bridges old and new architectures
3. Keeping expression handling monolithic while modularizing other components

The key is restoring user functionality quickly while maintaining code quality.