# State Migration Priority Plan

## Overview
This document outlines the prioritized steps for migrating from the current fragmented state to a unified AppState structure. Each item is ranked by impact, risk, and benefit.

## Migration Phases

### Phase 0: Foundation (1-2 days)
Before any migration, establish the groundwork:

1. **Create New State Structure**
   - Build enhanced AppState with new structure
   - Add TypeScript/JSDoc definitions
   - Implement new helper methods

2. **Add Compatibility Layer**
   - Create adapters for old → new state
   - Maintain backward compatibility
   - Add migration utilities

3. **Set Up Testing**
   - State snapshot testing
   - Migration verification tests
   - Performance benchmarks

### Phase 1: Low-Risk, High-Benefit (2-3 days)

#### 1.1 System State Migration
**Components**: Logger, Debug controls
**Risk**: Low - Independent subsystem
**Benefit**: High - Better debugging
**Steps**:
```javascript
// Migrate from:
localStorage.getItem('debug-logging')
// To:
appState.get('system.debug.enabled')
```

#### 1.2 Connection Metrics
**Components**: UIManager (display only)
**Risk**: Low - Read-only data
**Benefit**: Medium - Cleaner code
**Steps**:
```javascript
// Migrate from:
appState.get('averageLatency')
appState.get('connectedSynths').size
// To:
appState.get('connections.metrics.averageLatency')
appState.get('connections.metrics.connectedCount')
```

#### 1.3 UI Modal States
**Components**: Dialog controllers
**Risk**: Low - Simple booleans
**Benefit**: Medium - Consistent UI state
**Steps**:
- Move modal states to `ui.modals.*`
- Update event handlers

### Phase 2: Medium-Risk Migrations (3-4 days)

#### 2.1 WebSocket Connection State
**Components**: WebSocketManager, NetworkCoordinator, UIManager
**Risk**: Medium - Real-time critical
**Benefit**: High - Clear ownership
**Steps**:
1. Update WebSocketManager to write to `connections.websocket.*`
2. Update NetworkCoordinator to read new location
3. Update UIManager subscriptions
4. Test reconnection scenarios

#### 2.2 Banking State
**Components**: ProgramState, Banking UI
**Risk**: Medium - Persistence layer
**Benefit**: High - Cleaner architecture
**Steps**:
1. Migrate banks from ProgramState to `banking.banks`
2. Update localStorage key and format
3. Add migration for existing saved banks
4. Test save/load operations

#### 2.3 UI Parameters State
**Components**: ParameterControls, NetworkCoordinator
**Risk**: Medium - User interaction
**Benefit**: High - Better change tracking
**Steps**:
1. Move `parametersChanged` to `ui.parameters.changed`
2. Update change tracking logic
3. Update sync status calculations
4. Test parameter update flow

### Phase 3: High-Risk, Core Migrations (4-5 days)

#### 3.1 Connected Synths State
**Components**: NetworkCoordinator, UIManager, PartManager, ChordManager
**Risk**: High - Central to operations
**Benefit**: High - Single source of truth
**Steps**:
1. Create migration plan for Map → Object structure
2. Update NetworkCoordinator to use `connections.synths.*`
3. Update all readers incrementally
4. Add compatibility shim for transition
5. Extensive testing of connect/disconnect

#### 3.2 Current Program State
**Components**: Almost everything
**Risk**: Very High - Core functionality
**Benefit**: Very High - Eliminates duplication
**Steps**:
1. Start with read operations
2. Add parallel writes (old and new)
3. Migrate readers one by one
4. Switch writers to new location
5. Remove old state
6. Test every feature

#### 3.3 Chord and Expression State
**Components**: PianoKeyboard, PartManager, ChordManager, NetworkCoordinator
**Risk**: High - Complex interactions
**Benefit**: High - Cleaner data flow
**Steps**:
1. Consolidate chord state to `performance.currentProgram.chord`
2. Move expressions to same location
3. Update all event flows
4. Merge ChordManager into PartManager
5. Test all interaction patterns

### Phase 4: Architecture Improvements (2-3 days)

#### 4.1 Merge Duplicate Managers
**Target**: ChordManager + PartManager → PartManager
**Risk**: Medium - Refactoring
**Benefit**: High - Simpler architecture
**Steps**:
1. Move ChordManager logic to PartManager
2. Update all references
3. Remove ChordManager
4. Update documentation

#### 4.2 Eliminate ProgramManager
**Target**: ProgramManager → Direct ProgramState usage
**Risk**: Low - Already delegating
**Benefit**: Medium - Less indirection
**Steps**:
1. Update all ProgramManager users
2. Point directly to ProgramState
3. Remove ProgramManager
4. Clean up imports

#### 4.3 Standardize Event Patterns
**Target**: Consistent event naming and payloads
**Risk**: Medium - Many touchpoints
**Benefit**: High - Maintainability
**Steps**:
1. Document new event standards
2. Add event type definitions
3. Update events module by module
4. Add deprecation warnings
5. Remove old events

### Phase 5: Optimization and Cleanup (2-3 days)

#### 5.1 Remove Compatibility Layers
- Remove backward compatibility adapters
- Clean up migration utilities
- Remove deprecated methods

#### 5.2 Optimize State Updates
- Implement batched updates
- Add selective subscriptions
- Optimize re-render triggers

#### 5.3 Add Advanced Features
- State history/undo
- State persistence strategies
- Dev tools integration

## Migration Schedule

```
Week 1: Phase 0 + Phase 1
Week 2: Phase 2
Week 3: Phase 3 (Part 1)
Week 4: Phase 3 (Part 2) + Phase 4
Week 5: Phase 5 + Testing
```

## Risk Mitigation

### For Each Migration:
1. **Feature Flag**: Add toggle to revert if needed
2. **Parallel Run**: Keep old state temporarily
3. **Incremental**: Migrate readers before writers
4. **Test Coverage**: Add tests before changing
5. **Monitor**: Watch for performance regression

### Rollback Plan:
1. Each phase can be rolled back independently
2. Compatibility layer allows gradual migration
3. State snapshots before major changes
4. Version control tags at each phase

## Success Metrics

### Quantitative:
- Zero functional regressions
- Performance within 5% of current
- 90%+ test coverage on state operations
- <100ms state update latency

### Qualitative:
- Easier debugging
- Clearer data flow
- Better developer experience
- Simpler mental model

## Testing Strategy

### Unit Tests:
- State operations
- Migration functions
- Event flows

### Integration Tests:
- User workflows
- Network operations
- Bank save/load

### E2E Tests:
- Full performance flow
- Multi-synth scenarios
- Edge cases

### Performance Tests:
- State update speed
- Memory usage
- Re-render frequency

## Documentation Updates

### During Migration:
- Update inline comments
- Add migration notes
- Document new patterns

### After Migration:
- Update architecture docs
- Create state flow diagrams
- Write migration guide
- Update onboarding docs

## Conclusion

This migration plan prioritizes:
1. **Safety**: Low-risk changes first
2. **Value**: High-benefit early
3. **Learning**: Build knowledge progressively
4. **Quality**: Maintain functionality throughout

The key to success is patience and thoroughness. Each phase builds on the previous, creating a solid foundation for the unified state architecture.