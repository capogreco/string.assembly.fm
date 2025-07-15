# WebRTC Remote Connection Failure - Bug Report

## Issue Summary
WebRTC connections between synth and controller clients fail when they are not on the same local network, despite having valid TURN servers configured and both clients successfully fetching ICE server configurations.

## Environment
- **Deployment**: Deno Deploy (edge deployment)
- **Signaling**: WebSocket with Deno KV for controller discovery
- **TURN Provider**: Twilio Network Traversal Service
- **Affected Clients**: index.html (synth), ctrl.html (controller)

## Observed Behavior

### Working Scenario
- Clients on the same local network can connect successfully
- Controller appears in the synth's controller list
- Data channels establish correctly

### Failing Scenario
- Clients on different networks cannot establish connection
- Controller is discovered (appears in WebSocket messages)
- WebRTC connection fails at ICE connection stage

## Diagnostic Findings

### 1. TURN Server Configuration ✅
- Both synth and controller fetch ICE servers from `/ice-servers` endpoint
- Server returns valid Twilio TURN credentials
- TURN servers tested independently and confirmed reachable
- ICE server configuration includes: STUN, TURN, TURN, TURN

### 2. ICE Candidate Generation ✅
- Synth generates 9 total candidates
- Candidate types include: HOST, SRFLX, RELAY, OTHER
- RELAY candidates are successfully generated (Has RELAY: ✅)

### 3. Signaling Exchange ✅
All signaling phases complete successfully:
- ✅ Controller discovered
- ✅ ICE servers loaded (with TURN)
- ✅ Offer created
- ✅ Offer sent
- ✅ Answer received
- ✅ ICE gathering complete
- ✅ ICE candidates sent
- ✅ ICE candidates received
- ❌ Connection established (fails here)

### 4. ICE Connection Failure Details
- **Total candidate pairs attempted**: 28
- **Successful pairs**: 0
- **Failed pairs**: 28
- **RELAY pairs attempted**: 21
- **ICE State**: failed
- **Likely reason**: TURN auth failed or server unreachable

## Progress Made During Investigation

### 1. Enhanced Diagnostics Added
- **RELAY Status Display**: Added visual indicators on both synth and controller to show RELAY candidate generation status
- **ICE Candidate Tracking**: Both clients now track and display local/remote candidate types
- **Data Channel Diagnostics**: Added monitoring for data channel state and errors
- **WebSocket URL Fix**: Fixed undefined WebSocket URL in controller (was `wss://string.assembly.fm/undefined`)

### 2. TURN Token Refresh Mechanism
- Implemented automatic ICE server refresh every 4 hours
- Prevents TURN token expiration during long sessions
- Early ICE server fetching on controller initialization

### 3. Critical Finding: Data Channel Event Not Firing
Through enhanced logging, discovered that for remote connections:
- ICE connection succeeds (reaches "connected" state)
- **But `datachannel` event never fires on controller side**
- Local connections: `datachannel event FIRED`
- Remote connections: Silence after `Waiting for datachannel event...`

### 4. Attempted Fixes

#### a) Negotiated Data Channel (Did Not Help)
- Tried using `negotiated: true` with matching channel IDs
- No improvement - issue is lower level than channel negotiation

#### b) Race Condition Fix (Partial Success)
- Added 100ms delay after `handlePeerDisconnection` in WebRTCManager
- **Result**: Data channel now fires for BOTH local and remote!
- But connection still not fully established

#### c) ICE Candidate Queue Timing (Following Reference)
- Moved `processIceCandidateQueue` to after `setLocalDescription`
- Matches the working cicada.assembly.fm implementation
- Testing ongoing

#### d) Ping/Pong Implementation
- Added ping/pong mechanism as documented in connectivity_architecture.md
- Controller sends ping every second
- Synth responds with pong containing state

## Current Status

### What's Working
- ✅ WebSocket connection and discovery
- ✅ ICE server configuration with TURN
- ✅ RELAY candidate generation on both sides
- ✅ Data channel event now fires (after race condition fix)
- ✅ Ping/pong mechanism implemented

### What's Not Working
- ❌ Remote connections still not fully establishing
- ❌ Synth shows "No controllers connected yet" despite controller showing connection

## Key Code Locations

- **Synth WebRTC**: `/public/js/apps/synth-app.js:341-628`
- **Controller WebRTC**: `/public/js/modules/network/WebRTCManager.js`
- **Network Coordinator**: `/public/js/modules/network/NetworkCoordinator.js`
- **Server signaling**: `/src/server/server.ts`
- **ICE server fetch**: `/public/js/config/system.config.js:fetchIceServers()`
- **Reference implementation**: `/reference/cicada.assembly.fm/ctrl.html`

## Next Steps

1. **Compare with Reference Implementation**
   - The cicada.assembly.fm implementation works correctly
   - Need to identify remaining differences in WebRTC setup

2. **Verify Ping/Pong Flow**
   - Confirm pings are being sent from controller
   - Verify pongs are received and processed

3. **Check State Synchronization**
   - Ensure connection state is properly tracked on both sides
   - Verify synth recognizes controller after data channel opens

4. **Network-Level Debugging**
   - Use chrome://webrtc-internals to inspect connection details
   - Check for SCTP-specific issues

## Workarounds
- Use clients on same local network
- Deploy controller on publicly accessible server
- Use VPN to simulate local network