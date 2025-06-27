# Program State Migration Plan

## Overview
Migrate from the current fragmented state system to a single ProgramState module that serves as the source of truth for all program data.

## Current Issues
- State duplicated across AppState, PartManager, ProgramManager, and UI components
- Inconsistent save/load behavior
- Complex event chains
- Legacy compatibility issues

## Migration Steps

### Phase 1: Create New ProgramState Module ✓
- Single Program class with clear structure
- ProgramState manager with clear methods
- Proper separation of current vs active program

### Phase 2: Update Event Flow
Replace current event handlers with new unified events:

1. **Parameter Changes**:
   - OLD: ParameterControls → parameter:changed → AppState
   - NEW: ParameterControls → programState:parameterChanged → ProgramState

2. **Chord Changes**:
   - OLD: PianoKeyboard → chord:changed → PartManager & AppState
   - NEW: PianoKeyboard → programState:chordChanged → ProgramState → PartManager

3. **Expression Changes**:
   - OLD: Multiple paths through various components
   - NEW: ExpressionHandler → programState:expressionChanged → ProgramState

### Phase 3: Update Components

#### app.js
```javascript
// Initialize
import { programState } from './modules/state/ProgramState.js';
await programState.initialize();

// Update sendCurrentProgram
window.sendCurrentProgram = async () => {
  // Get program data from ProgramState
  const programData = programState.getProgramForSynth();
  
  // Send via PartManager
  const result = await partManager.sendCurrentPart();
  
  if (result.successCount > 0) {
    // Mark as active
    programState.setActiveProgram();
  }
};

// Update keyboard shortcuts
if (event.shiftKey) {
  // Save active program to bank
  programState.saveToBank(bankId);
  updateBankDisplay();
} else {
  // Load from bank
  if (programState.loadFromBank(bankId)) {
    // Program loaded and applied to UI
    // Now send to synths
    await sendCurrentProgram();
  }
}
```

#### ParameterControls.js
```javascript
// Update handleParameterChange
handleParameterChange(paramId, event) {
  const value = this.parseParameterValue(element, event.target.value);
  
  // Update ProgramState instead of AppState
  programState.currentProgram.parameters[paramId] = value;
  programState.markChanged();
  
  // Visual feedback
  this.markParameterChanged(paramId);
}
```

#### PartManager.js
```javascript
// Update setChord
setChord(frequencies) {
  this.currentChord = [...frequencies];
  
  // Update ProgramState instead of AppState
  programState.updateChord(frequencies, this.noteExpressions);
  
  this.redistributeToSynths();
}

// Update setNoteExpression
setNoteExpression(noteName, expression) {
  // Update local state
  if (expression?.type !== "none") {
    this.noteExpressions.set(noteName, expression);
  } else {
    this.noteExpressions.delete(noteName);
  }
  
  // Update ProgramState
  programState.updateNoteExpression(noteName, expression);
}
```

#### UIManager.js
```javascript
// Listen for new events
eventBus.on('programState:changed', (data) => {
  // Update sync status badge
  const badge = document.getElementById('status_badge');
  if (badge) {
    if (data.hasChanges) {
      badge.textContent = '● Changes Pending';
      badge.className = 'status-badge pending';
    } else {
      badge.textContent = '✓ Synced';
      badge.className = 'status-badge synced';
    }
  }
});

eventBus.on('programState:synced', () => {
  // Clear all parameter changed indicators
  this.clearAllParameterChanges();
});
```

### Phase 4: Remove Old Code

1. **Remove from AppState**:
   - currentProgram
   - activeProgram
   - programBanks
   - Parameter tracking methods

2. **Simplify ProgramManager**:
   - Convert to a simple compatibility wrapper around ProgramState
   - Or remove entirely and update references

3. **Clean up PartManager**:
   - Remove state storage responsibilities
   - Focus only on synth distribution

4. **Update PianoKeyboard**:
   - Remove direct state management
   - Use events to communicate with ProgramState

### Phase 5: Testing Plan

1. **Unit Tests**:
   - Test Program class cloning
   - Test save/load to banks
   - Test state comparison

2. **Integration Tests**:
   - Parameter change → UI update → Send to synth
   - Load bank → UI update → Send to synth
   - Keyboard shortcuts for save/load

3. **Manual Testing**:
   - Save program with complex chord/expressions
   - Load and verify all data restored
   - Verify sync indicators work correctly

## Benefits

1. **Single Source of Truth**: All program data in one place
2. **Clear Data Flow**: Predictable state updates
3. **Simplified Save/Load**: Direct save of activeProgram
4. **Better Sync Tracking**: Clear separation of current vs active
5. **Easier Debugging**: All state changes go through one module

## Rollback Plan

Keep old modules but deprecated:
1. Add compatibility layer in ProgramState
2. Gradually migrate components
3. Remove old code once stable

## Timeline

- Phase 1: ✓ Complete
- Phase 2-3: 2-3 hours (update components)
- Phase 4: 1-2 hours (cleanup)
- Phase 5: 1-2 hours (testing)

Total: ~6-8 hours for complete migration