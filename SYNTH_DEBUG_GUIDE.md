# Synth Debug Guide

## Issues Resolved

✅ **Controller Discovery**: Controllers are now being discovered and connected successfully
✅ **WebRTC Connection**: Data channel is opening properly between synth and controller
✅ **ICE Message Type**: Fixed handling of "ice" messages from controller (was expecting "ice-candidate")
✅ **UI Updates**: Controller list now shows connected controllers

## Remaining Tasks

- **Visualizer**: Should start showing waveform after clicking "Calibrate Volume" and "Join Instrument"
- **Debug Cleanup**: Debug console logs have been commented out to reduce noise

## Debug Steps Added

### 1. Canvas/Visualizer Debugging

The synth-app.js now includes console logs for:
- Canvas element and context initialization in constructor
- Canvas dimensions and setup in init()
- Canvas resize events with test rectangle drawing
- WebSocket connection and message flow
- Controller discovery messages

### 2. Debug Functions Available in Console

After loading the synth page, these debug functions are available:

```javascript
// Show all discovered controllers
debugSynth.showControllers()

// Manually request controller list from server
debugSynth.requestControllers()

// Show canvas information
debugSynth.showCanvasInfo()

// Draw a red test rectangle
debugSynth.testDraw()
```

### 3. Expected Console Output

When the synth page loads, you should see:
1. `[DEBUG] Canvas element: <canvas>` - Shows if canvas was found
2. `[DEBUG] Canvas context: CanvasRenderingContext2D` - Shows if context created
3. `[DEBUG] init() called` - Confirms initialization started
4. `[DEBUG] Setting up canvas` or `[DEBUG] No canvas element found!`
5. `[DEBUG] Starting visualizer` or `[DEBUG] No canvas context, visualizer not started`
6. `[DEBUG] Connecting to WebSocket: ws://...`
7. `[DEBUG] WebSocket connected`
8. `[DEBUG] Sending registration: {type: "register", client_id: "synth-xxx"}`
9. `[DEBUG] Requesting controllers: {type: "request-controllers", source: "synth-xxx"}`
10. `[DEBUG] Received WebSocket message: {...}`

### 4. Troubleshooting Steps

#### Canvas Not Visible:
1. Check `debugSynth.showCanvasInfo()` - look for opacity value
2. The canvas has class "dimmed" (opacity: 0.3) until calibration
3. Try `debugSynth.testDraw()` to verify canvas is working

#### No Controllers Found:
1. Open controller page in another tab/window
2. Check console for `[DEBUG] Controllers list received: []`
3. Use `debugSynth.requestControllers()` to manually request
4. Check if controller is registering with ID starting with "ctrl-"

#### No Visualizer:
1. Check if `synthCore` and `synthCore.analyser` exist after calibration
2. The visualizer shows "Waiting for audio..." before audio initialization
3. After clicking "Calibrate Volume", audio should initialize

### 5. Known Issues to Check:

1. **Controller Registration**: Controllers must have IDs starting with "ctrl-" to be recognized by server
2. **Canvas Opacity**: Canvas has "dimmed" class (30% opacity) until after calibration
3. **Audio Context**: Visualizer needs audio context initialized (happens on calibration button click)
4. **WebRTC Connection**: Controllers and synths must successfully establish WebRTC connection for data exchange

### 6. WebRTC Connection Flow:

Expected sequence:
1. Synth discovers controller via `controllers-list` message ✓
2. Synth creates RTCPeerConnection and sends offer
3. Server stores offer in KV and controller polls for it
4. Controller sends answer back
5. Synth receives answer and establishes connection
6. Data channel opens and controllers list updates

Check console for:
- `[DEBUG] Discovered new controller: ctrl-xxx`
- `[DEBUG] Auto-connecting to controller: ctrl-xxx`
- `[DEBUG] Creating WebRTC offer for ctrl-xxx`
- `[DEBUG] Sending offer to ctrl-xxx`
- `[DEBUG] Received answer from ctrl-xxx` (this might be missing!)

### 7. Server-Side Checks:

The server (server.ts) expects:
- Registration message: `{type: "register", client_id: "synth-xxx"}` or `{type: "register", client_id: "ctrl-xxx"}`
- Controllers identified by IDs starting with "ctrl-"
- Synths identified by IDs starting with "synth-"