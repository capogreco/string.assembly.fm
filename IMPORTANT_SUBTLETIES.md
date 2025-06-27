# Important Subtleties to Preserve During Program State Migration

## Critical Concepts

### 1. Active Program vs Current Program
- **Active Program**: The program that was last sent to synths (via "Send Current Program" or bank load)
- **Current Program**: The current UI state (may have unsaved changes)
- **Save Operation**: MUST save the Active Program, NOT the current UI state
- **Sync Indicator**: Shows "Changes Pending" when current != active

### 2. Transition Parameters
- Transition parameters (duration, stagger, spread) are NOT part of the program
- They are applied at send-time but never saved
- Always use current UI values when sending, regardless of what's in the saved program

### 3. Expression Data Structure
- Expressions are stored per note (e.g., "C4", "A#3")
- Sharp notes need special handling in selectors (CSS.escape)
- Expression types: none, vibrato, tremolo, trill
- Each expression has type-specific parameters

### 4. Chord and Part Distribution
- Chord is stored as frequencies (Hz), not MIDI notes
- PartManager assigns synths to chord notes
- When chord changes, synths may be redistributed
- New synths get assigned to unassigned notes first, then round-robin

### 5. Bank System
- Banks 1-9 accessed via keys 1-9, Bank 10 via key 0
- Shift+number saves active program to bank
- Number alone loads from bank AND sends to synths
- Clear banks must persist to localStorage

### 6. State Flow for Loading
When loading a bank:
1. Program data applied to UI
2. Chord sent to PartManager
3. Expressions sent to both PianoKeyboard AND PartManager
4. Program sent to synths with transition
5. Loaded program becomes the new active program

### 7. Event Timing Issues
- Some UI updates trigger input events which can cause cascades
- ProgramManager uses isApplyingProgram flag to prevent recursion
- Parameter changes during load shouldn't mark as "changed"

### 8. Legacy Compatibility
- window.currentChord still used by some code
- Some synth code may expect old message formats
- ctrl-main-logic.js runs in parallel with modular system

### 9. Save Data Structure
Programs must include:
- All parameter values (from Config.PARAM_IDS)
- chordNotes array (frequencies)
- noteExpressions object (noteName -> expression data)
- harmonicSelections (for each expression type)
- selectedExpression
- powerOn state
- metadata (version, timestamp, name)

### 10. UI Update Patterns
- Sliders need both value and display element updates
- Input events must be dispatched for some listeners
- Harmonic ratio buttons need selected class toggling
- Piano keys need visual state updates via expressionHandler

## Edge Cases to Test

1. Loading a bank with sharp notes (A#, C#, etc.)
2. Saving when no program has been sent yet
3. Loading a bank with a different number of notes than current
4. Clearing banks and refreshing the page
5. Rapid bank switching
6. Loading banks with old version data

## Data Flow Subtleties

### Parameter Change Flow:
1. User moves slider
2. ParameterControls captures change
3. Mark parameter as changed (orange border)
4. Update sync indicator
5. Do NOT send to synths automatically

### Send Program Flow:
1. Capture current UI state
2. Send via PartManager
3. If successful, set as active program
4. Clear all change indicators
5. Update sync indicator to "Synced"

### Load Bank Flow:
1. Load saved program data
2. Apply ALL data to UI (params, chord, expressions)
3. Send to synths with transition
4. Set loaded program as active
5. Clear all change indicators

## Critical Bugs We Fixed

1. **Duplicate if checks in WebRTCManager** - Fixed by removing nested checks
2. **WEBSOCKET debug logs** - Silenced by commenting out
3. **Sharp note selectors** - Fixed with CSS.escape()
4. **Clear banks persistence** - Fixed by saving to localStorage
5. **Chord display in banks** - Now shows note names with expressions

## Do NOT Change

1. The separation between UI state and synced state
2. The requirement that saves use the active program
3. The event-driven architecture for state updates
4. The transition parameter exclusion from saves
5. The bank numbering system (1-9, 0=10)