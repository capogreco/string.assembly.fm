# Synth Power Control Fix

## Issue
The synth client (index.html) was not responding to power on/off messages from the controller.

## Root Cause
The synth was only handling command messages with the structure `{data: {type: "request-state"}}` but the controller sends power commands as `{type: "command", name: "power", value: true/false}`.

## Fix Applied
Updated `handleDataChannelMessage` in synth-app.js to handle power commands:

```javascript
case "command":
  if (message.name === "power") {
    if (this.synthCore) {
      const powerOn = message.value;
      this.synthCore.setPower(powerOn);
    }
  }
  // ... other command handling
```

## Additional Fixes
- Fixed `getSynthState()` to use `synthCore.isPoweredOn` instead of `synthCore.isPowered`

## Command Message Structure
The controller sends commands through the data channel with this structure:
- **Power**: `{type: "command", name: "power", value: true/false}`
- **Save**: `{type: "command", name: "save", value: bankId}`
- **Load**: `{type: "command", name: "load", value: {bank: bankId, transition: {...}, fallbackProgram: {...}}}`
- **Request State**: `{type: "command", data: {type: "request-state"}}`

## Testing
1. Open synth page and calibrate/join instrument
2. Open controller page and connect
3. Use power button on controller - synth should respond
4. Debug logs will show: "[DEBUG] Setting power to: true/false"