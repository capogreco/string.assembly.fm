/**
 * SDP Logger Module
 * Captures and logs SDP (Session Description Protocol) data from WebRTC connections
 * Provides methods to save SDP data as downloadable text files or send to server
 */

// Use IIFE to support both module and script loading
(function (global) {
  "use strict";

  class SDPLogger {
    constructor(role = "unknown") {
      this.role = role; // 'controller' or 'synth'
      this.sdpHistory = [];
      this.logCount = 0;
    }

    /**
     * Logs SDP data with metadata
     * @param {string} type - 'offer' or 'answer'
     * @param {string} direction - 'local' or 'remote'
     * @param {RTCSessionDescription} sdp - The SDP object
     * @param {string} peerId - The peer identifier
     */
    logSDP(type, direction, sdp, peerId) {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        role: this.role,
        type,
        direction,
        peerId,
        sdp: sdp.sdp,
        logId: ++this.logCount,
      };

      this.sdpHistory.push(logEntry);

      // Log to console with clear formatting
      console.log(
        `[SDP-LOGGER] ${this.role} - ${direction} ${type} for peer ${peerId}`,
      );
      console.log(`[SDP-LOGGER] Timestamp: ${timestamp}`);
      console.log(`[SDP-LOGGER] SDP:\n${sdp.sdp}`);
      console.log("[SDP-LOGGER] -------------------");

      // Auto-save if we have a complete exchange (offer + answer)
      if (this.shouldAutoSave()) {
        this.autoSave(peerId);
      }

      return logEntry;
    }

    /**
     * Checks if we should auto-save (when we have both offer and answer for a peer)
     */
    shouldAutoSave() {
      // Group by peerId
      const peerGroups = {};
      this.sdpHistory.forEach((entry) => {
        if (!peerGroups[entry.peerId]) {
          peerGroups[entry.peerId] = [];
        }
        peerGroups[entry.peerId].push(entry);
      });

      // Check if any peer has both offer and answer
      for (const peerId in peerGroups) {
        const entries = peerGroups[peerId];
        const hasOffer = entries.some((e) => e.type === "offer");
        const hasAnswer = entries.some((e) => e.type === "answer");

        if (hasOffer && hasAnswer && !entries.some((e) => e.saved)) {
          return true;
        }
      }
      return false;
    }

    /**
     * Auto-saves SDP exchange for a specific peer
     */
    autoSave(peerId) {
      const peerEntries = this.sdpHistory.filter((e) => e.peerId === peerId);
      const filename = `sdp_${this.role}_${peerId}_${Date.now()}.txt`;
      this.downloadSDPLog(filename, peerEntries);

      // Mark as saved
      peerEntries.forEach((e) => (e.saved = true));
    }

    /**
     * Formats SDP log entries as text
     */
    formatSDPLog(entries = this.sdpHistory) {
      // Handle null or undefined entries
      const entriesToFormat = entries || this.sdpHistory || [];

      let output = `SDP Log - ${this.role.toUpperCase()}\n`;
      output += `Generated: ${new Date().toISOString()}\n`;
      output += `${"=".repeat(80)}\n\n`;

      if (entriesToFormat.length === 0) {
        output += "No SDP entries captured yet.\n";
        output += `${"=".repeat(80)}\n`;
        return output;
      }

      entriesToFormat.forEach((entry, index) => {
        output += `Entry #${entry.logId}\n`;
        output += `Time: ${entry.timestamp}\n`;
        output += `Role: ${entry.role}\n`;
        output += `Type: ${entry.type.toUpperCase()}\n`;
        output += `Direction: ${entry.direction.toUpperCase()}\n`;
        output += `Peer ID: ${entry.peerId}\n`;
        output += `${"-".repeat(40)}\n`;
        output += `${entry.sdp}\n`;
        output += `${"=".repeat(80)}\n\n`;
      });

      return output;
    }

    /**
     * Downloads SDP log as a text file
     */
    downloadSDPLog(filename = null, entries = null) {
      // Don't download if there's nothing to download
      if (!this.sdpHistory || this.sdpHistory.length === 0) {
        console.log("[SDP-LOGGER] No SDP data to download yet");
        alert("No SDP data captured yet. Try connecting to a synth first.");
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const defaultFilename = `sdp_log_${this.role}_${timestamp}.txt`;
      const actualFilename = filename || defaultFilename;

      const content = this.formatSDPLog(entries);
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = actualFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log(`[SDP-LOGGER] Downloaded SDP log: ${actualFilename}`);
    }

    /**
     * Sends SDP log to server
     */
    async sendToServer(endpoint = "/api/sdp-logs") {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            role: this.role,
            timestamp: new Date().toISOString(),
            entries: this.sdpHistory,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        console.log("[SDP-LOGGER] Successfully sent SDP log to server");
        return await response.json();
      } catch (error) {
        console.error("[SDP-LOGGER] Failed to send SDP log to server:", error);
        throw error;
      }
    }

    /**
     * Clears the SDP history
     */
    clear() {
      this.sdpHistory = [];
      this.logCount = 0;
      console.log("[SDP-LOGGER] Cleared SDP history");
    }

    /**
     * Gets SDP history for a specific peer
     */
    getPeerHistory(peerId) {
      return this.sdpHistory.filter((entry) => entry.peerId === peerId);
    }

    /**
     * Creates a download button in the UI
     */
    createDownloadButton(container) {
      const button = document.createElement("button");
      button.textContent = "Download SDP Log";
      button.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 10px;
      padding: 10px 20px;
      background: #4CAF50;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
      z-index: 1000;
    `;

      button.addEventListener("click", () => {
        this.downloadSDPLog();
      });

      // Update button appearance based on data availability
      const updateButtonState = () => {
        if (!this.sdpHistory || this.sdpHistory.length === 0) {
          button.style.opacity = "0.6";
          button.title = "No SDP data captured yet";
        } else {
          button.style.opacity = "1";
          button.title = `Download SDP Log (${this.sdpHistory.length} entries)`;
        }
      };

      // Initial state
      updateButtonState();

      // Update after each log entry
      const originalLogSDP = this.logSDP.bind(this);
      this.logSDP = function (...args) {
        const result = originalLogSDP(...args);
        updateButtonState();
        return result;
      };
      button.addEventListener("mouseover", () => {
        button.style.background = "#45a049";
      });
      button.addEventListener("mouseout", () => {
        button.style.background = "#4CAF50";
      });

      const targetContainer = container || document.body;
      targetContainer.appendChild(button);

      return button;
    }

    /**
     * Wraps RTCPeerConnection to automatically log SDP
     */
    static wrapRTCPeerConnection(logger) {
      const OriginalRTCPeerConnection = window.RTCPeerConnection;

      window.RTCPeerConnection = function (...args) {
        const pc = new OriginalRTCPeerConnection(...args);
        let peerId = "unknown";

        // Store peerId on the connection object
        Object.defineProperty(pc, "peerId", {
          get: () => peerId,
          set: (id) => {
            peerId = id;
          },
        });

        // Wrap setLocalDescription
        const originalSetLocalDescription = pc.setLocalDescription.bind(pc);
        pc.setLocalDescription = async function (desc) {
          const result = await originalSetLocalDescription(desc);
          if (desc && desc.type) {
            logger.logSDP(desc.type, "local", desc, peerId);
          }
          return result;
        };

        // Wrap setRemoteDescription
        const originalSetRemoteDescription = pc.setRemoteDescription.bind(pc);
        pc.setRemoteDescription = async function (desc) {
          const result = await originalSetRemoteDescription(desc);
          if (desc && desc.type) {
            logger.logSDP(desc.type, "remote", desc, peerId);
          }
          return result;
        };

        return pc;
      };

      // Preserve static methods
      Object.setPrototypeOf(
        window.RTCPeerConnection,
        OriginalRTCPeerConnection,
      );
      Object.setPrototypeOf(
        window.RTCPeerConnection.prototype,
        OriginalRTCPeerConnection.prototype,
      );
    }
  }

  // Export for modules or attach to global
  if (typeof module !== "undefined" && module.exports) {
    module.exports = SDPLogger;
  } else if (typeof define === "function" && define.amd) {
    define([], function () {
      return SDPLogger;
    });
  } else {
    global.SDPLogger = SDPLogger;
  }
})(typeof window !== "undefined" ? window : this);
