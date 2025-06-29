# WebRTC Connection Debugging Report: Modular Controller vs. Legacy Synth (Params Channel Only)

**Date:** June 23, 2025
**Subject:** Diagnosing WebRTC Data Channel Failures After Modular Refactor.
**System Components Involved:**
*   **Controller:** New modular system (`app.js` loading `WebSocketManager.js`, `WebRTCManager.js`, etc.)
*   **Synth Client:** Legacy inline JavaScript in `public/index.html`.
*   **Signaling Server:** `src/server/server.ts` (Deno KV-based message queuing).
*   **Legacy Controller Code (`public/js/ctrl-main-logic.js`):** Intentionally fully commented out during this diagnostic phase.

## 1. Problem Statement

After refactoring the controller from a monolithic JavaScript file (`ctrl-main-logic.js`) to a modular architecture (`app.js` with various ES6 modules), WebRTC connections between the controller and the synth clients are failing. Specifically, while signaling messages (offers, answers, ICE candidates) appear to be exchanged, the WebRTC data channels are not becoming operational. This results in errors like "Cannot send param message to [synthId] - channel not ready" and eventual ICE connection failure, preventing any meaningful communication or control over the synths.

The primary goal of this debugging session is to identify why the data channels are not being established correctly in the new modular system, even when the legacy controller code is disabled.

## 2. Diagnostic Steps and Findings (Chronological)

### 2.1. Initial State and Hypothesis
*   **Initial Problem**: WebRTC connections consistently failed at the ICE connectivity check stage. Connections were stuck in "checking", leading to "ICE failed" errors. Data channels ("params", "commands") were not opening.
*   **Initial Hypothesis**: Potential issues with WebRTC configuration, ICE candidate handling, timing in connection establishment, or differences in module initialization between the old and new systems.

### 2.2. Verifying Signaling and Basic WebRTC Flow
*   **WebSocket Connection**: Confirmed that the underlying WebSocket connection between the synth and the signaling server, and the controller and the signaling server, was being established.
*   **ICE Candidate Exchange**: Logs (both client-side and server-side) confirmed that ICE candidates were being generated by both peers and exchanged via the signaling server.
*   **Offer/Answer Exchange**:
    *   The synth client (`index.html`) was observed to create an SDP offer.
    *   The server logs showed this offer being received and targeted to the controller.
    *   The controller client logs initially showed it was sending an SDP answer *without explicitly logging the receipt of the offer by the new modular `WebSocketManager`*.

### 2.3. Identifying Legacy Code Interference
*   **Dual System Operation**: It was discovered that both the new modular system (`app.js` and its modules) and parts of the old legacy system (`ctrl-main-logic.js`) were running concurrently. The `module-loader.js` was intended to switch between them but was allowing both to initialize to some extent.
*   **Legacy `NetworkManager` Intercepting Offers**: The legacy `NetworkManager` within `ctrl-main-logic.js` had its own WebSocket message listener. This listener was intercepting the "offer" messages from the synth before the new modular `WebSocketManager` could process them. This explained why the new system wasn't logging offer receipts but an answer was still being generated (by the legacy code).
*   **Server Log Anomaly**: Server logs showed `received: answer from undefined to [synthId]`. This was a strong indicator that the answer being relayed by the server was potentially from the legacy controller code, which might not have been setting the `sender_id` or `source` field correctly in its answer messages.

### 2.4. Isolating the Modular System
*   **Commenting out `ctrl-main-logic.js`**: To eliminate interference, the entire content of `public/js/ctrl-main-logic.js` was commented out.
*   **Flagging Modular System Activation**:
    *   `window.__modularSystemActive = true;` was added at the very beginning of `public/js/app.js` (before any imports) to provide an early signal to any potentially still-loading legacy code.
    *   Checks were added to the legacy `start_controller()` and `NetworkManager.connect()` in `ctrl-main-logic.js` to prevent their execution if this flag was set. (Although this file is now commented out, these changes were part of the diagnostic process).
*   **Result of Isolation**:
    *   The controller's modular `WebSocketManager` **began correctly receiving and logging "offer" messages.**
    *   The modular `WebRTCManager.handleOffer` was now being called as expected.
    *   The server logs started showing answers with the correct controller ID as the source (e.g., `received: answer from ctrl-[id] to [synthId]`), confirming the modular controller was generating the answer.

### 2.5. Focusing on Data Channel Establishment (Current Phase)
*   **Synth Client Configuration (Diagnostic Step)**: To simplify, the synth client (`index.html`) was modified to create **only the "params" data channel**. The creation of the "commands" channel and its associated event listeners were temporarily commented out in the synth's `connect_to_controller` function.
    *   Synth console logs confirmed: `[synth-id] Created 'params' data channel, initial readyState: connecting`.
*   **Controller `WebRTCManager` Configuration**:
    *   The `handleOffer` method was modified to **not** proactively create any data channels. It now relies entirely on the `datachannel` event being fired on the `RTCPeerConnection` object to receive channels initiated by the synth.
    *   The `setupPeerEventListeners` method correctly attaches an event listener for the `datachannel` event. This listener calls `handleDataChannel`, which is designed to differentiate between "params" and "commands" channels and set them up accordingly.
*   **Persistent Issue**: Despite these changes and the successful offer/answer exchange by the modular system:
    *   The **`RTCPeerConnection.ondatachannel` event (or `addEventListener('datachannel', ...)` callback) is NOT firing** on the controller side. This is evident from the absence of `[WEBRTC-DEBUG] 'datachannel' event FIRED...` logs and subsequent logs from `handleDataChannel`.
    *   Consequently, neither the "params" channel (expected from the synth) nor any "commands" channel (if the synth were creating it) are being set up by the `WebRTCManager`.
    *   This leads directly to the "Cannot send param message to [synthId] - channel not ready" errors, as `peerData.paramChannel` remains null or its `readyState` is not "open".
    *   The ICE connection often shows one candidate pair succeeding (e.g., IPv6 host-srflx) in `about:webrtc` logs, but the overall connection eventually fails, likely due to the lack of usable data channels or other ICE issues.

### 2.6. Analysis of `about:webrtc` Logs (Controller Side)
*   The `about:webrtc` logs from the controller confirm successful ICE candidate gathering and some successful candidate pair establishments (e.g., an IPv6 srflx path).
*   However, these logs have consistently **lacked any indication of SCTP transport establishment or data channel state changes** (e.g., to "open"). This absence strongly correlates with the `ondatachannel` event not firing.
*   This points towards a failure in the SCTP negotiation phase, which occurs after ICE connection but is essential for data channels.

## 3. Current Hypothesis for Data Channel Failure

With the legacy system fully disabled and the modular controller correctly processing the offer/answer, the primary hypothesis is a **failure in the SCTP negotiation for data channels, preventing the `ondatachannel` event from firing on the controller.**

This failure is likely due to issues in the SDP (Session Description Protocol) exchange, specifically:
1.  **Controller's Answer SDP**: The answer generated by the controller's `WebRTCManager` might not be correctly acknowledging or agreeing to the data channel(s) proposed in the synth's offer SDP. Even if the offer correctly describes an `m=application` line for data channels with an `a=sctp-port`, the answer must also contain a corresponding `m=application` section with a non-zero port and compatible SCTP attributes. If the answer rejects the data channel media section (e.g., by setting the port to 0) or has incompatible SCTP parameters, the `ondatachannel` event will not fire.
2.  **Subtle SDP Incompatibilities**: There might be other subtle incompatibilities in the SDP attributes related to data channels (e.g., `a=sctpmap`, `a=rtcp-mux` interactions, DTLS fingerprint issues) that prevent the SCTP association.

The "answer from undefined" in the server log, while still puzzling if `ctrl-main-logic.js` is truly inert, might be a secondary issue or a logging artifact on the server. The immediate focus is the client-side `ondatachannel` failure.

## 4. Next Recommended Diagnostic Steps

1.  **Obtain Full SDP Offer and Answer from `about:webrtc`**:
    *   Ensure the synth client (`index.html`) is configured to create **only the "params" channel**.
    *   Ensure `ctrl-main-logic.js` remains fully commented out.
    *   On the controller page, clear `about:webrtc` logs.
    *   Initiate connection from the synth.
    *   After the attempt, from the controller's `about:webrtc` page for the specific failed `RTCPeerConnection`:
        *   Copy the **full SDP of the offer** (seen in the `setRemoteDescription` event).
        *   Copy the **full SDP of the answer** (seen in the `setLocalDescription` event).
    *   Provide these SDPs for detailed analysis. This will allow direct comparison of how the data channel (`m=application` section and `a=sctp-port`, `a=sctpmap` attributes) is described and negotiated.

2.  **Examine `about:webrtc` for SCTP Errors**: Scrutinize the `about:webrtc` logs for any explicit errors or warnings related to SCTP transport establishment or SCTP stream creation.

3.  **Review Controller's `RTCPeerConnection` Configuration**: Double-check the `RTCConfiguration` (`Config.RTC_CONFIG`) used by the `WebRTCManager` for any settings that might inadvertently affect data channel negotiation (though standard STUN server configurations are unlikely to be the cause here).

By analyzing the exact SDP offer and answer, we should be able to identify why the SCTP negotiation is failing and, consequently, why the `ondatachannel` event is not being triggered on the controller.