/**
 * SDP Logging Initialization Script
 * Include this in both ctrl.html and index.html to enable SDP logging
 */

(function() {
  // Determine role based on current page
  const isController = window.location.pathname.includes('ctrl.html');
  const role = isController ? 'controller' : 'synth';

  console.log(`[SDP-LOGGING-INIT] Initializing SDP logging for ${role}`);

  // Create SDP logger instance
  const sdpLogger = new window.SDPLogger(role);

  // Make it globally accessible
  window.sdpLogger = sdpLogger;

  // Wrap RTCPeerConnection to automatically capture SDP
  const OriginalRTCPeerConnection = window.RTCPeerConnection;

  window.RTCPeerConnection = function(...args) {
    const pc = new OriginalRTCPeerConnection(...args);
    let peerId = 'unknown';

    // Store peerId on the connection object
    Object.defineProperty(pc, 'peerId', {
      get: () => peerId,
      set: (id) => {
        peerId = id;
        console.log(`[SDP-LOGGING-INIT] Set peerId: ${id} for RTCPeerConnection`);
      }
    });

    // Wrap setLocalDescription
    const originalSetLocalDescription = pc.setLocalDescription.bind(pc);
    pc.setLocalDescription = async function(desc) {
      try {
        const result = await originalSetLocalDescription(desc);
        if (desc && desc.type) {
          console.log(`[SDP-LOGGING-INIT] Capturing local ${desc.type} for peer ${peerId}`);
          sdpLogger.logSDP(desc.type, 'local', desc, peerId);
        }
        return result;
      } catch (error) {
        console.error(`[SDP-LOGGING-INIT] Error in setLocalDescription:`, error);
        throw error;
      }
    };

    // Wrap setRemoteDescription
    const originalSetRemoteDescription = pc.setRemoteDescription.bind(pc);
    pc.setRemoteDescription = async function(desc) {
      try {
        const result = await originalSetRemoteDescription(desc);
        if (desc && desc.type) {
          console.log(`[SDP-LOGGING-INIT] Capturing remote ${desc.type} for peer ${peerId}`);
          sdpLogger.logSDP(desc.type, 'remote', desc, peerId);
        }
        return result;
      } catch (error) {
        console.error(`[SDP-LOGGING-INIT] Error in setRemoteDescription:`, error);
        throw error;
      }
    };

    return pc;
  };

  // Preserve static methods and prototype chain
  Object.setPrototypeOf(window.RTCPeerConnection, OriginalRTCPeerConnection);
  Object.setPrototypeOf(window.RTCPeerConnection.prototype, OriginalRTCPeerConnection.prototype);

  // Create download button
  window.addEventListener('DOMContentLoaded', () => {
    sdpLogger.createDownloadButton();

    // Add keyboard shortcut (Ctrl+Shift+S) to download SDP log
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        sdpLogger.downloadSDPLog();
      }
    });
  });

  // Add console commands for easy access
  window.downloadSDPLog = () => sdpLogger.downloadSDPLog();
  window.clearSDPLog = () => sdpLogger.clear();
  window.showSDPHistory = () => console.table(sdpLogger.sdpHistory);

  console.log('[SDP-LOGGING-INIT] SDP logging initialized. Available commands:');
  console.log('- downloadSDPLog() - Download current SDP log');
  console.log('- clearSDPLog() - Clear SDP history');
  console.log('- showSDPHistory() - Show SDP history in table format');
  console.log('- Ctrl+Shift+S - Download SDP log (keyboard shortcut)');

})();
