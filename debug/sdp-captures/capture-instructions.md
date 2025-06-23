# SDP Capture Instructions for WebRTC Debugging

## Quick Capture Steps

1. **Prepare the Environment**
   - Ensure `ctrl-main-logic.js` is fully commented out
   - Clear browser console and `about:webrtc` logs on both controller and synth
   - Have both controller and synth pages open in separate tabs/windows

2. **Enable Enhanced Logging**
   - Open browser console on both controller and synth
   - Run this in both consoles to capture SDP:
   ```javascript
   window.captureSDPs = [];
   
   // Override setLocalDescription
   const origSetLocal = RTCPeerConnection.prototype.setLocalDescription;
   RTCPeerConnection.prototype.setLocalDescription = function(desc) {
     console.log('🔵 setLocalDescription called:', desc);
     if (desc && desc.sdp) {
       window.captureSDPs.push({
         type: 'local',
         descType: desc.type,
         sdp: desc.sdp,
         timestamp: new Date().toISOString()
       });
     }
     return origSetLocal.apply(this, arguments);
   };
   
   // Override setRemoteDescription
   const origSetRemote = RTCPeerConnection.prototype.setRemoteDescription;
   RTCPeerConnection.prototype.setRemoteDescription = function(desc) {
     console.log('🔴 setRemoteDescription called:', desc);
     if (desc && desc.sdp) {
       window.captureSDPs.push({
         type: 'remote',
         descType: desc.type,
         sdp: desc.sdp,
         timestamp: new Date().toISOString()
       });
     }
     return origSetRemote.apply(this, arguments);
   };
   ```

3. **Initiate Connection**
   - From the synth page, click "Connect to Controller"
   - Wait for connection attempt to complete (usually fails after ~30 seconds)

4. **Extract SDPs**
   - On the **synth** console, run:
   ```javascript
   console.log('=== SYNTH SDPs ===');
   window.captureSDPs.forEach((item, idx) => {
     console.log(`\n--- ${idx}: ${item.type} ${item.descType} at ${item.timestamp} ---`);
     console.log(item.sdp);
   });
   ```
   
   - On the **controller** console, run:
   ```javascript
   console.log('=== CONTROLLER SDPs ===');
   window.captureSDPs.forEach((item, idx) => {
     console.log(`\n--- ${idx}: ${item.type} ${item.descType} at ${item.timestamp} ---`);
     console.log(item.sdp);
   });
   ```

5. **Save the Output**
   - Copy all SDP output from both consoles
   - Save synth SDPs to: `debug/sdp-captures/synth-sdps.txt`
   - Save controller SDPs to: `debug/sdp-captures/controller-sdps.txt`

## What to Look For in the SDPs

### In the Synth's Offer (local description):
- Look for `m=application` line (should have non-zero port)
- Check for `a=sctp-port:5000` or similar
- Verify `a=sctpmap` attributes
- Confirm data channel setup attributes

### In the Controller's Answer (local description):
- **Critical**: Check if `m=application` line exists with non-zero port
- Verify SCTP port matches or is compatible
- Look for any rejection indicators (port=0)
- Check DTLS fingerprint presence

## Alternative Capture Method (about:webrtc)

If the console method doesn't work:

1. Navigate to `about:webrtc` in Firefox (or `chrome://webrtc-internals` in Chrome)
2. Clear any existing logs
3. Perform the connection attempt
4. Look for the PeerConnection entry
5. Expand and find:
   - "setRemoteDescription" entries (for received offer/answer)
   - "setLocalDescription" entries (for sent offer/answer)
6. Copy the full SDP text from each

## Quick SDP Analyzer Script

After capturing, run this to analyze key data channel elements:

```javascript
function analyzeSDPForDataChannels(sdp, label) {
  console.log(`\n=== Analyzing ${label} ===`);
  
  const lines = sdp.split('\n');
  const mAppLine = lines.find(l => l.startsWith('m=application'));
  const sctpPort = lines.find(l => l.includes('a=sctp-port'));
  const sctpmap = lines.find(l => l.includes('a=sctpmap'));
  const setup = lines.find(l => l.includes('a=setup'));
  const midExt = lines.find(l => l.includes('urn:ietf:params:rtp-hdrext:sdes:mid'));
  
  console.log('m=application line:', mAppLine || 'NOT FOUND');
  console.log('SCTP port:', sctpPort || 'NOT FOUND');
  console.log('SCTP map:', sctpmap || 'NOT FOUND');
  console.log('DTLS setup:', setup || 'NOT FOUND');
  console.log('MID extension:', midExt || 'NOT FOUND');
  
  if (mAppLine) {
    const port = mAppLine.split(' ')[1];
    console.log('Port value:', port, port === '0' ? '❌ REJECTED' : '✅ ACCEPTED');
  }
}

// Usage:
// analyzeSDPForDataChannels(capturedOfferSDP, 'Synth Offer');
// analyzeSDPForDataChannels(capturedAnswerSDP, 'Controller Answer');
```

## Common Issues to Check

1. **Port 0 in m=application**: Indicates data channels are rejected
2. **Missing m=application**: No data channel support negotiated
3. **SCTP parameter mismatch**: Different SCTP configurations
4. **DTLS role conflict**: Both sides trying to be same role
5. **Missing or incompatible fingerprints**: DTLS security failure

Save all captured data for analysis!