# Stretch Goals

## Synth State Distribution Visualization

Once the core program/banking system is working, we could enhance the controller UI to show the actual distribution of resolved parameter states across all connected synths.

### Concept
- Extend `pong` messages to include resolved parameter values from each synth
- Controller UI displays real-time visualization of parameter distributions
- Shows how stochastic parameters resolved differently across the ensemble
- Could use histograms, scatter plots, or other visualizations to show the "spread" of the distributed synthesis

### Benefits
- Visual feedback on ensemble diversity
- Debugging tool for parameter distribution
- Performance insight into how stochastic elements are working
- Could inform real-time adjustments to stochastic ranges

### Implementation Notes
- Would require extending synth state reporting in pong messages
- UI would need charting/visualization components
- Consider bandwidth impact of additional state data
- Could be toggle-able for performance-conscious setups

### Priority
- Implement after core program/banking system is stable
- Not essential for basic distributed synthesis functionality
- More of a "nice to have" for advanced users and developers