# SDP Logging Guide for WebRTC Debugging

This guide explains how to use the SDP (Session Description Protocol) logging feature to debug WebRTC connection issues between the controller and synth clients.

## Overview

The SDP Logger captures and saves all SDP exchanges during WebRTC connection establishment. This is invaluable for debugging connection failures, as it allows you to inspect the exact offer/answer negotiation details.

## Features

- **Automatic SDP Capture**: Intercepts all `setLocalDescription` and `setRemoteDescription` calls
- **Auto-Download**: Automatically downloads logs when a complete offer/answer exchange is detected
- **Manual Download**: Download logs at any time via button or keyboard shortcut
- **Server Upload**: Optionally upload logs to the server for persistent storage
- **Peer Tracking**: Associates SDP data with specific peer connections

## How It Works

### 1. Automatic Setup

The SDP logging is automatically initialized when you load either:
- `ctrl.html` (controller interface)
- `index.html` (synth interface)

### 2. Logging Process

The logger automatically captures:
- **Local Offers**: When creating WebRTC offers
- **Local Answers**: When creating WebRTC answers
- **Remote Offers**: When receiving offers from peers
- **Remote Answers**: When receiving answers from peers

### 3. File Output

Log files are named using the pattern:
```
sdp_<role>_<peerId>_<timestamp>.txt
```

Example: `sdp_controller_synth-abc123_1703123456789.txt`

## Usage

### Download Logs Manually

#### Method 1: Click the Download Button
A green "Download SDP Log" button appears in the bottom-left corner of the page.

#### Method 2: Keyboard Shortcut
Press `Ctrl+Shift+S` (or `Cmd+Shift+S` on Mac) to download the current log.

#### Method 3: Console Commands
Open the browser console and use:
```javascript
downloadSDPLog()    // Download current SDP log
clearSDPLog()       // Clear SDP history
showSDPHistory()    // Display SDP history in table format
```

### Auto-Download

When the logger detects both an offer and answer for a peer connection, it automatically downloads the exchange. This ensures you capture failed connection attempts even if the page is refreshed.

### Server Upload (Optional)

To upload logs to the server instead of downloading:
```javascript
await sdpLogger.sendToServer()
```

Logs are saved to the `sdp-logs/` directory on the server.

## Log Format

Each log file contains:
- Header with role (controller/synth) and generation timestamp
- Multiple entries, each containing:
  - Entry number
  - Timestamp
  - Role (controller or synth)
  - Type (offer or answer)
  - Direction (local or remote)
  - Peer ID
  - Full SDP content

### Example Log Entry
```
Entry #1
Time: 2024-12-20T10:30:45.123Z
Role: controller
Type: OFFER
Direction: REMOTE
Peer ID: synth-abc123def
----------------------------------------
v=0
o=- 1234567890 2 IN IP4 127.0.0.1
s=-
t=0 0
m=application 9 UDP/DTLS/SCTP webrtc-datachannel
c=IN IP4 0.0.0.0
a=ice-ufrag:abcd
a=ice-pwd:efghijklmnopqrstuvwxyz
a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99
a=setup:actpass
a=mid:0
a=sctp-port:5000
a=max-message-size:262144
================================================================================
```

## Debugging WebRTC Issues

### What to Look For

1. **Data Channel Configuration**
   - Check for `m=application` lines in both offer and answer
   - Verify `a=sctp-port` is present and non-zero
   - Ensure both sides support the same SCTP parameters

2. **ICE Candidates**
   - Look for `a=candidate` lines
   - Verify both reflexive (srflx) and host candidates are present
   - Check that candidates match the network configuration

3. **DTLS Fingerprints**
   - Verify `a=fingerprint` lines are present
   - Check `a=setup` roles (actpass/active/passive)

4. **Common Issues**
   - Missing `m=application` section → No data channels
   - Port set to 0 → Data channels rejected
   - Missing ICE candidates → Firewall/NAT issues
   - Fingerprint mismatch → Security verification failure

### Comparing Offer and Answer

The most valuable debugging approach is comparing the offer and answer SDPs:
1. Download logs from both controller and synth
2. Find matching peer IDs
3. Compare the `m=application` sections
4. Verify all required attributes are properly negotiated

## Troubleshooting

### Logger Not Working

If the SDP logger isn't capturing data:
1. Check browser console for errors
2. Verify `window.sdpLogger` exists
3. Ensure you're using a supported browser (Chrome, Firefox, Edge)

### Missing Peer IDs

If peer IDs show as "unknown":
1. The WebRTC connection might be created before the peer ID is set
2. Check that the connection code properly sets `pc.peerId`

### Auto-Download Not Triggering

The auto-download requires both offer and answer for the same peer. If it's not triggering:
1. The connection might be failing before the answer is created
2. Check console for WebRTC errors
3. Manually download using the button or keyboard shortcut

## Implementation Details

### File Locations
- **Logger Class**: `/public/js/modules/debug/SDPLogger.js`
- **Initialization**: `/public/js/sdp-logging-init.js`
- **Integration**: Automatically loaded in `ctrl.html` and `index.html`

### Browser Compatibility
- Chrome/Chromium: Full support
- Firefox: Full support
- Safari: Full support
- Edge: Full support

### Security Considerations
- SDP data may contain IP addresses and network information
- Logs are stored locally unless explicitly uploaded
- Server upload endpoint requires proper authentication in production

## Best Practices

1. **Clear logs between debugging sessions** to avoid confusion
2. **Save logs immediately** when reproducing issues
3. **Include both controller and synth logs** when reporting issues
4. **Note the exact sequence of actions** that led to the failure
5. **Check browser's `about:webrtc` page** for additional diagnostics

## Integration with Debugging Workflow

1. Enable other debug logging in the Debug Panel (connections, messages, etc.)
2. Clear browser console
3. Reproduce the connection issue
4. Download SDP logs immediately
5. Save browser console output
6. Check `about:webrtc` for additional information
7. Correlate timestamps across all logs

This comprehensive logging helps identify whether issues are in:
- SDP negotiation
- ICE candidate gathering
- DTLS handshake
- SCTP establishment
- Data channel creation