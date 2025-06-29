# WaveformVisualizer Module

## Overview
The WaveformVisualizer module provides a reusable vertical waveform visualization with cosine envelope. This creates an organic, string-like visualization that represents the audio waveform as a vertical line that oscillates horizontally with amplitude shaped by a cosine envelope.

## Visual Description
- **Orientation**: Vertical (runs from top to bottom of canvas)
- **Amplitude**: Horizontal displacement from center
- **Envelope**: Cosine function that makes amplitude largest at center, tapering to zero at top/bottom
- **Effect**: Creates a string-like or flame-like appearance

## Usage

### Basic Setup
```javascript
import { WaveformVisualizer } from '../modules/ui/WaveformVisualizer.js';

// Create visualizer
const canvas = document.getElementById('myCanvas');
const visualizer = new WaveformVisualizer(canvas, {
  lineWidth: 2,
  strokeStyle: '#60a5fa',
  backgroundColor: '#1a1a2e',
  amplitudeScale: 0.4
});

// Start visualization (can be called before analyser is ready)
visualizer.start();

// Later, after user interaction and audio context creation:
// Connect to Web Audio analyser node
visualizer.setAnalyserNode(synthCore.getAnalyserNode());
```

### Initialization Sequence
1. **Page Load**: Create WaveformVisualizer instance and call `start()`
2. **User Interaction**: User clicks "Calibrate Volume" (required for audio context)
3. **Audio Init**: Create AudioContext and initialize SynthCore
4. **Connect Visualizer**: Call `setAnalyserNode()` with the analyser from SynthCore
5. **Automatic Start**: Visualizer begins drawing automatically

### Options
- `lineWidth`: Thickness of the waveform line (default: 2)
- `strokeStyle`: Color of the waveform (default: '#ffffff')
- `backgroundColor`: Canvas background color (default: '#000000')
- `amplitudeScale`: Maximum amplitude as percentage of canvas width (default: 0.4)
- `samples`: Number of points to sample from audio buffer (default: 256)

### Methods
- `setAnalyserNode(node)`: Connect to a Web Audio AnalyserNode
- `start()`: Begin animation loop
- `stop()`: Stop animation loop
- `resize(width, height)`: Update canvas dimensions
- `updateOptions(options)`: Update visualization options
- `destroy()`: Clean up resources

## Implementation Details

The visualizer:
1. Samples time-domain audio data from the AnalyserNode
2. Maps samples vertically along the canvas height
3. Applies cosine envelope to create natural tapering
4. Draws as a continuous line from top to bottom

## Benefits of Modular Design
- **Reusability**: Same visualizer can be used in synth-app.js, ensemble-app.js, or any other page
- **Maintainability**: Single source of truth for the visualization code
- **Customization**: Easy to configure appearance via options
- **Separation of Concerns**: Visualization logic separated from app logic