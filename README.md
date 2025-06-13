# Minimal Distributed Synthesizer Template

A WebRTC-based distributed audio synthesis template built for Deno Deploy's edge infrastructure. Control multiple synthesizers from a web interface with real-time parameter updates and automatic connection management.

## What This Template Provides

- **WebRTC peer-to-peer connections** with automatic discovery and connection
- **Dual data channels** - UDP-like for continuous parameters, TCP-like for discrete commands
- **TURN server integration** via Twilio for reliable connections through NATs
- **State synchronization** - New synths receive current controller state on connect
- **Pink noise synthesis** using AudioWorklet with Ridge-Rat Type 2 algorithm
- **Cosine ramp utility** - Smooth parameter automation with exact zero capability
- **Volume calibration phase** - Pink noise reference for device volume setting
- **Latency monitoring** - Real-time RTT measurement and display
- **Independent controller sessions** - Each controller manages its own set of synths
- **Edge-ready architecture** - Built for Deno Deploy's distributed infrastructure

## Browser Requirements

- **Chrome/Edge** 66+ (for AudioWorklet support)
- **Firefox** 76+
- **Safari** 14.1+
- **WebRTC support** required (all modern browsers)
- **JavaScript modules** and `async/await` support

Mobile browsers are supported but may have audio restrictions requiring user interaction to start.

## Quick Start

```bash
# Clone the template
git clone [your-repo-url]
cd minimal_distributed_synth

# Set up environment variables (optional, for TURN servers)
cp .env.example .env
# Edit .env with your Twilio credentials

# Run locally
deno task dev

# Open in browser
# Controller: http://localhost:8000/ctrl
# Synth: http://localhost:8000/
```

## Architecture Overview

```
┌─────────────┐     WebSocket      ┌─────────────┐     WebSocket      ┌─────────────┐
│ Controller  │ ←────────────────→ │ Deno Server │ ←────────────────→ │   Synth A   │
│  (ctrl.html)│                    │ (server.ts) │                    │(index.html) │
└──────┬──────┘                    └─────┬───────┘                    └──────┬──────┘
       │                                 │                                   │
       │              Signaling via Deno KV Queue                          │
       │                                 │         ┌─────────────┐           │
       │                                 └────────→│   Synth B   │           │
       │                                           │(index.html) │           │
       │                                           └──────┬──────┘           │
       │                                                  │                  │
       └─────────────────── WebRTC Data Channels ────────┴──────────────────┘
                    (Direct P2P Connections: 1 Controller → N Synths)
```

### Architecture Clarification

**This is a 1-Controller → N-Synths system**, not a shared multi-controller system:

- **Each controller instance** manages its own independent set of synthesizers
- **Synths automatically connect** to any available controllers they discover
- **Multiple controller instances** can run simultaneously, but they operate independently
- **No shared control** - Controller A's synths are separate from Controller B's synths
- **Controller conflicts** only occur when you accidentally open multiple controller windows for the same session

**Example deployment scenarios:**
- **Performer A** runs 1 controller + 3 synths for their performance
- **Performer B** runs 1 controller + 5 synths for their performance  
- Both can run simultaneously on the same server without interference

### Key Components

**server.ts** (108 lines)
- WebSocket signaling server
- Deno KV for message queuing across edge locations
- TURN credential fetching from Twilio
- Static file serving

**ctrl.html** (467 lines)
- Controller interface with parameter controls
- WebRTC connection management
- Latency monitoring
- Controller conflict detection (warns if multiple controllers are open)

**index.html** (407 lines)
- Synthesizer client
- Pink noise generation via AudioWorklet
- Visual feedback (frequency analyzer)
- Automatic connection to available controllers

**pink_noise.js** (65 lines)
- AudioWorklet processor
- Ridge-Rat Type 2 pink noise algorithm
- Real-time parameter control

**cosine_ramp.js** (150 lines)
- AudioWorklet utility for smooth parameter automation
- Cosine interpolation with exact zero capability
- Message-based control for dynamic ramping
- Overcomes Web Audio API limitations

### State Synchronization

The template uses the ping/pong mechanism for state synchronization between controllers and synths:

**How it works:**
- Controllers send `ping` messages to synths every second
- Synths respond with `pong` messages that include their complete state
- No separate state notification messages needed

**Synth state in pong response:**
```javascript
{
  type: "pong",
  timestamp: data.timestamp,
  state: {
    audio_enabled: !!audio_context,
    volume: stored_volume,
    powered_on: is_powered_on
    // easily extensible with new state
  }
}
```

**Benefits:**
- State automatically stays fresh (updates every second)
- Single mechanism for all state synchronization
- No timing issues or race conditions
- Easy to extend - just add fields to the state object
- Controllers always have current synth state without explicit requests

This pattern keeps the codebase clean and makes state management predictable and debuggable.

## Extending the Template

### Adding New Audio Parameters

1. Add UI control in `ctrl.html`:
```javascript
<input type="range" id="frequency" min="20" max="20000" value="440">
```

2. Send parameter over UDP-like channel:
```javascript
param_channel.send (JSON.stringify ({
    type: "param",
    name: "frequency",
    value: frequency
}))
```

3. Handle in `index.html`:
```javascript
function update_param (name, value, source) {
    if (name === "frequency") {
        // Update your audio node
        oscillator.frequency.value = value
    }
}
```

### Adding New Commands

1. Add control in `ctrl.html`:
```javascript
<button id="trigger">Trigger</button>
```

2. Send over TCP-like channel:
```javascript
command_channel.send (JSON.stringify ({
    type: "command",
    name: "trigger",
    value: true
}))
```

3. Handle in `index.html`:
```javascript
function handle_command (name, value, source) {
    if (name === "trigger") {
        // Trigger your event
        envelope.trigger ()
    }
}
```

### Adding New Synthesis Types

Replace the pink noise worklet with your own:

```javascript
// In your worklet file
class MySynthProcessor extends AudioWorkletProcessor {
    process (inputs, outputs, parameters) {
        // Your DSP code here
    }
}
registerProcessor ("my-synth", MySynthProcessor)

// In index.html
await audio_context.audioWorklet.addModule ("my_synth.js")
const synth = new AudioWorkletNode (audio_context, "my-synth")
```

## Design Decisions

- **No frameworks** - Vanilla JavaScript for maximum flexibility
- **No build process** - Direct file serving, edit and reload
- **Minimal abstractions** - Easy to understand and modify
- **Automatic connections** - No manual connection steps required
- **1-to-N architecture** - Each controller independently manages multiple synths
- **Edge-first** - Built for distributed deployment from the start
- **Ping/pong state sync** - State synchronization through existing latency mechanism

## Deployment

### Deploy to Deno Deploy

1. Push to GitHub
2. Connect repository to Deno Deploy
3. Set environment variables in Deno Deploy dashboard
4. Deploy

### Environment Variables

```env
# Twilio (optional, for TURN servers)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
```

## Troubleshooting

**Synths not connecting:**
- Check browser console for WebRTC errors
- Ensure TURN servers are configured for restrictive networks
- Try refreshing both controller and synth pages

**High latency:**
- Check network conditions
- Latency display shows RTT in milliseconds
- Consider geographical distance between peers

**Controller conflicts:**
- Multiple controller instances can accidentally run simultaneously
- Orange warning appears when this is detected (usually indicates user error)
- Each controller should manage its own independent set of synths

## License

[Your chosen license]

---

Built with the philosophy: *"Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away."*
