# Program/Banking System Test Guide

## Overview

This document describes how to test the newly implemented program/banking system for the distributed synthesis platform.

## Test Setup

1. **Start the server:**
   ```bash
   cd string.assembly.fm
   deno run --allow-net --allow-read --allow-env server.ts
   ```

2. **Open controller interface:**
   - Navigate to `http://localhost:8000/ctrl`
   - Should see new "Program Control" and "Banking" sections

3. **Open multiple synth clients:**
   - Navigate to `http://localhost:8000/` in multiple tabs/windows
   - Each will get a unique synth ID and connect to the controller

## Testing Program Broadcasting

### Basic Program Test
1. In controller, click **"Send Example Program"**
2. Check browser console in synth clients
3. Should see: `received program with 5 parameters`
4. Should see: `applying resolved parameters: {volume: 0.3, bow_force: 0.xx, ...}`

### Stochastic Resolution Test
1. Click **"Send Example Program"** multiple times
2. Compare console output across different synth clients
3. Verify that:
   - `volume` is always the same (deterministic: 0.3)
   - `bow_force` varies between synths (uniform distribution)
   - `string_position` varies between synths (normal distribution)
   - `vibrato_rate` varies between synths (uniform distribution)  
   - `vibrato_depth` varies between synths (choice from options)

### Randomized Program Test
1. Click **"Randomize Program"** 
2. Each click should generate a new program with different stochastic ranges
3. Multiple synths should resolve different values within those ranges

## Testing Banking System

### Save Operation
1. Send a program (example or randomized)
2. Select "Bank 1" from dropdown
3. Click **"Save"**
4. Check synth consoles for: `saved current program to bank 1`

### Load Operation
1. After saving to Bank 1, send a different program
2. Select "Bank 1" from dropdown  
3. Click **"Load"**
4. Synths that were present during save should load their saved resolved values
5. Check console for: `loaded parameters from bank 1`

### Fallback Behavior
1. Open a NEW synth client (after saving to a bank)
2. Try loading from that bank
3. New synth should resolve fresh values from the fallback program
4. Check console for: `bank X not found, resolved from fallback program`

## Expected Console Output

### Controller Console
```
sent program with 5 parameters
saved current program to bank 1
loaded program from bank 1
```

### Synth Console
```
received program with 5 parameters
applying resolved parameters: {volume: 0.3, bow_force: 0.6234, string_position: 0.4567, vibrato_rate: 4.123, vibrato_depth: 0.1}
saved current program to bank 1
loaded parameters from bank 1
```

## Parameter Definitions

The example program uses these stochastic definitions:

- **volume**: `0.3` (deterministic)
- **bow_force**: `{type: "uniform", min: 0.2, max: 0.8}` 
- **string_position**: `{type: "normal", mean: 0.5, std: 0.1}`
- **vibrato_rate**: `{type: "uniform", min: 3.0, max: 6.0}`
- **vibrato_depth**: `{type: "choice", options: [0.0, 0.05, 0.1, 0.15]}`

## Troubleshooting

### No Program Messages
- Check WebRTC connection status in controller
- Verify synths show as "connected" in controller UI
- Check browser console for connection errors

### Same Values Across Synths  
- Verify stochastic parameters have proper type definitions
- Check that `Math.random()` is being called for each synth
- Ensure programs contain stochastic elements (not all deterministic)

### Banking Not Working
- Verify command channel is connected (separate from param channel)
- Check that save/load commands are being sent via command channel
- Ensure proper message structure for load commands (includes fallback program)

### Missing Fallback Behavior
- Test with synths that join after banking operations
- Verify load commands include the fallback program
- Check that new synths properly handle missing local banks

## Current Limitations

1. **No Worklet Integration**: Parameters are logged but not yet applied to synthesis worklets
2. **Volume Only**: Only volume parameter actually affects audio output
3. **No Persistence**: Banks are lost on page refresh
4. **No Bank Management**: No UI to see which banks are saved or clear them

## Next Steps

1. Integrate with bowed string synthesis worklets from reference code
2. Add parameter definitions preloading system
3. Implement bank persistence (localStorage or server-side)
4. Add bank management UI
5. Create performance interface for real-time program manipulation