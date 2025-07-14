/**
 * UIManager Module for String Assembly FM
 * Handles overall UI coordination and updates
 */

import { eventBus } from "../core/EventBus.js";
import { appState } from "../state/AppState.js";
import { SystemConfig } from "../../config/system.config.js";

export class UIManager {
  constructor() {
    this.eventBus = eventBus;
    this.appState = appState;
    this.elements = {
      status: null,
      synthList: null,
      connectedCount: null,
      avgLatency: null,
      chordDisplay: null,
      expressionDisplay: null,
    };
    this.isInitialized = false;
    this.updateInterval = null;
  }

  /**
   * Initialize the UI manager
   */
  initialize() {
    if (this.isInitialized) {
      if (window.Logger) {
        window.Logger.log("UIManager already initialized", "lifecycle");
      }
      return;
    }

    // Initializing UIManager...

    // Cache DOM elements
    this.cacheElements();

    // Set up event listeners
    this.setupEventListeners();

    // Set up state subscriptions
    this.setupStateSubscriptions();

    // Start periodic updates
    this.startPeriodicUpdates();

    this.isInitialized = true;

    // UIManager initialized
  }

  /**
   * Cache frequently used DOM elements
   * @private
   */
  cacheElements() {
    this.elements = {
      status: document.getElementById("status"),
      synthList: document.getElementById("synth_list"),
      connectedCount: document.getElementById("connected_count"),
      avgLatency: document.getElementById("avg_latency"),
      chordDisplay: document.getElementById("chord-display"),
      otherControllers: document.getElementById("other_controllers"),
      kickButton: document.getElementById("kick_others"),
    };

    // Log missing elements for debugging
    Object.entries(this.elements).forEach(([name, element]) => {
      if (!element && window.Logger) {
        window.Logger.log(`UI element not found: ${name}`, "error");
      }
    });
  }

  /**
   * Set up event listeners
   * @private
   */
  setupEventListeners() {
    // Network events
    this.eventBus.on("network:synthConnected", (data) => {
      this.updateSynthList();
      this.updateConnectionStatus();
    });

    this.eventBus.on("websocket:connected", () => {
      this.updateConnectionStatus();
    });

    this.eventBus.on("websocket:disconnected", () => {
      this.updateConnectionStatus();
    });

    this.eventBus.on("websocket:kicked", () => {
      this.showKickedMessage();
    });

    this.eventBus.on("websocket:controllerList", (data) => {
      this.updateControllerList(data.controllers);
    });

    // State change events
    this.eventBus.on("state:changed", (data) => {
      this.handleStateChange(data);
    });

    // Program events
    this.eventBus.on("program:saved", (data) => {
      this.showProgramSavedFeedback(data.bankId);
    });

    this.eventBus.on("program:loaded", (data) => {
      this.showProgramLoadedFeedback(data.bankId);
    });

    // New ProgramState events
    this.eventBus.on("programState:changed", (data) => {
      // Update sync status badge
      const badge = document.getElementById("status_badge");
      if (badge) {
        if (data.hasChanges) {
          badge.textContent = "● Changes Pending";
          badge.className = "status-badge pending";
        } else {
          badge.textContent = "✓ Synced";
          badge.className = "status-badge synced";
        }
      }
    });

    this.eventBus.on("programState:synced", () => {
      // Clear all parameter changed indicators
      this.clearAllParameterChanges();

      // Update sync status badge
      const badge = document.getElementById("status_badge");
      if (badge) {
        badge.textContent = "✓ Synced";
        badge.className = "status-badge synced";
      }
    });
  }

  /**
   * Set up state subscriptions
   * @private
   */
  setupStateSubscriptions() {
    // Connection status changes - NEW nested path
    this.appState.subscribe("connections.websocket", (websocket) => {
      const status = websocket.connected
        ? "connected"
        : websocket.reconnecting
          ? "connecting"
          : "disconnected";
      this.updateConnectionStatus(status);
    });

    // Legacy subscription for backward compatibility
    this.appState.subscribe("connectionStatus", (newStatus) => {
      this.updateConnectionStatus(newStatus);
    });

    // Connected synths changes - NEW nested path
    this.appState.subscribe("connections.synths", () => {
      this.updateSynthList();
      this.updateConnectionCount();
    });

    // Legacy subscription for backward compatibility
    this.appState.subscribe("connectedSynths", () => {
      this.updateSynthList();
      this.updateConnectionCount();
    });

    // Average latency changes - NEW nested path
    this.appState.subscribe(
      "connections.metrics.averageLatency",
      (newLatency) => {
        this.updateLatencyDisplay(newLatency);
      },
    );

    // Legacy subscription for backward compatibility
    this.appState.subscribe("averageLatency", (newLatency) => {
      this.updateLatencyDisplay(newLatency);
    });

    // Current chord changes
    // Chord display is updated via events, not state subscription

    // Expression changes
    this.appState.subscribe("selectedExpression", (newExpression) => {
      this.updateExpressionDisplay(newExpression);
    });
  }

  /**
   * Update connection status display
   * @param {string} status - Connection status
   */
  updateConnectionStatus(status = null) {
    // Try new structure first, fall back to legacy
    const websocket = this.appState.getNested("connections.websocket");
    const connectionStatus =
      status ||
      (websocket
        ? websocket.connected
          ? "connected"
          : websocket.reconnecting
            ? "connecting"
            : "disconnected"
        : this.appState.get("connectionStatus"));

    if (!this.elements.status) return;

    // Track the actual status value, not the display text
    const previousStatus = this.elements.status.dataset.status;

    // Only log and update if status actually changed
    if (previousStatus === connectionStatus) return;

    this.elements.status.dataset.status = connectionStatus;

    // The status element now contains a span for text, so find the first span child
    const statusTextElement =
      this.elements.status.querySelector("span") || this.elements.status;

    // Update text and styling
    switch (connectionStatus) {
      case "connected":
        const clientId =
          this.appState.get("controllerId") ||
          this.appState.getNested("connections.controllerId") ||
          "";
        statusTextElement.textContent = `Connected (${clientId.replace("ctrl-", "")})`;
        this.elements.status.className = "status connected";
        break;
      case "connecting":
        statusTextElement.textContent = "Connecting...";
        this.elements.status.className = "status connecting";
        break;
      case "disconnected":
        statusTextElement.textContent = "Disconnected";
        this.elements.status.className = "status disconnected";
        break;
      case "kicked":
        statusTextElement.textContent = "Kicked";
        this.elements.status.className = "status kicked";
        break;
      case "error":
        statusTextElement.textContent = "Connection Error";
        this.elements.status.className = "status error";
        break;
      case "ready":
        statusTextElement.textContent = "Ready";
        this.elements.status.className = "status ready";
        break;
      case "initializing":
        statusTextElement.textContent = "Initializing...";
        this.elements.status.className = "status initializing";
        break;
      default:
        statusTextElement.textContent = "Unknown";
        this.elements.status.className = "status unknown";
    }

    if (window.Logger) {
      window.Logger.log(
        `Connection status updated: ${connectionStatus}`,
        "lifecycle",
      );
    }
  }

  /**
   * Update synth list display
   */
  updateSynthList() {
    if (!this.elements.synthList) return;

    // Try new structure first, fall back to legacy
    const connectedSynths =
      this.appState.getNested("connections.synths") ||
      this.appState.get("connectedSynths");

    if (connectedSynths.size === 0) {
      this.elements.synthList.innerHTML =
        '<span style="color: #64748b;">None connected</span>';
      return;
    }

    // Convert Map to array and sort by status
    const synthArray = Array.from(connectedSynths.entries())
      .map(([synthId, synthData]) => ({ synthId, ...synthData }))
      .sort((a, b) => {
        // Sort order: instrument joined > audio enabled > connected only
        if (a.instrumentJoined && !b.instrumentJoined) return -1;
        if (!a.instrumentJoined && b.instrumentJoined) return 1;
        if (a.audioEnabled && !b.audioEnabled) return -1;
        if (!a.audioEnabled && b.audioEnabled) return 1;
        return 0; // Keep original order for same status
      });

    const synthEntries = [];
    synthArray.forEach((synthData) => {
      const synthId = synthData.synthId;
      const latencyText =
        synthData.latency !== null ? `${synthData.latency}ms` : "...";

      // Connection health indicator
      const healthColors = {
        excellent: "#4ade80",
        good: "#22c55e",
        fair: "#f59e0b",
        poor: "#ef4444",
      };
      const healthColor = healthColors[synthData.connectionHealth] || "#64748b";

      // Status indicators
      const audioIcon = synthData.audioEnabled ? "🔊" : "🔇";
      const instrumentIcon = synthData.instrumentJoined ? "🎻" : "⏸️";

      synthEntries.push(`
        <div class="synth" style="background: #262626; padding: 8px; margin: 4px 0; border-radius: 4px; border-left: 3px solid ${healthColor};">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 500; color: #e2e8f0; font-size: 0.85em;">${synthId}</span>
            <div style="display: flex; gap: 8px; align-items: center;">
              <span title="Audio ${synthData.audioEnabled ? "enabled" : "disabled"}" style="font-size: 0.9em;">${audioIcon}</span>
              <span title="Instrument ${synthData.instrumentJoined ? "joined" : "not joined"}" style="font-size: 0.9em;">${instrumentIcon}</span>
              <span style="color: ${healthColor}; font-size: 0.8em; font-family: monospace;">${latencyText}</span>
            </div>
          </div>
          ${synthData.state ? `<div style="color: #94a3b8; font-size: 0.75em; margin-top: 2px;">${synthData.state}</div>` : ""}
        </div>
      `);
    });

    this.elements.synthList.innerHTML = synthEntries.join("");
  }

  /**
   * Update connection count display
   */
  updateConnectionCount() {
    if (!this.elements.connectedCount) return;

    // Try new structure first, fall back to legacy
    const connectedSynths =
      this.appState.getNested("connections.synths") ||
      this.appState.get("connectedSynths");
    this.elements.connectedCount.textContent = connectedSynths.size.toString();
  }

  /**
   * Update latency display
   * @param {number} latency - Average latency in ms
   */
  updateLatencyDisplay(latency) {
    if (!this.elements.avgLatency) return;

    if (latency > 0) {
      this.elements.avgLatency.textContent = `${latency}ms`;

      // Color code based on latency
      if (latency < 50) {
        this.elements.avgLatency.className = "latency good";
      } else if (latency < 100) {
        this.elements.avgLatency.className = "latency ok";
      } else {
        this.elements.avgLatency.className = "latency poor";
      }
    } else {
      this.elements.avgLatency.textContent = "--";
      this.elements.avgLatency.className = "latency unknown";
    }
  }

  /**
   * Update chord display
   * @param {Array} chord - Array of frequencies
   */
  updateChordDisplay(chord) {
    if (!this.elements.chordDisplay) return;

    if (!chord || chord.length === 0) {
      this.elements.chordDisplay.textContent = "None";
      this.elements.chordDisplay.className = "chord-display empty";
      return;
    }

    // Convert frequencies to note names
    const noteNames = chord.map((freq) => this.frequencyToNote(freq));
    this.elements.chordDisplay.textContent = noteNames.join(", ");
    this.elements.chordDisplay.className = "chord-display active";
  }

  /**
   * Update expression display
   * @param {string} expression - Selected expression type
   */
  updateExpressionDisplay(expression) {
    if (!this.elements.expressionDisplay) return;

    const expressionText =
      expression === "none"
        ? "None"
        : expression.charAt(0).toUpperCase() + expression.slice(1);

    this.elements.expressionDisplay.textContent = expressionText;
    this.elements.expressionDisplay.className = `expression-display ${expression}`;
  }

  /**
   * Update controller list display
   * @param {Array} controllers - List of other controllers
   */
  updateControllerList(controllers = []) {
    if (!this.elements.otherControllers) return;

    const otherControllers = controllers.filter(
      (c) => c.id !== window.networkCoordinator?.controllerId,
    );

    if (otherControllers.length === 0) {
      this.elements.otherControllers.innerHTML = "No other controllers";
      if (this.elements.kickButton) {
        this.elements.kickButton.style.display = "none";
      }
      return;
    }

    const controllerEntries = otherControllers
      .map(
        (controller) => `
      <div class="controller-entry">
        <span class="controller-id">${controller.id}</span>
        <button class="kick-controller" data-controller-id="${controller.id}">Kick</button>
      </div>
    `,
      )
      .join("");

    this.elements.otherControllers.innerHTML = controllerEntries;

    // Add kick button event listeners
    this.elements.otherControllers
      .querySelectorAll(".kick-controller")
      .forEach((button) => {
        button.addEventListener("click", (e) => {
          const controllerId = e.target.dataset.controllerId;
          this.kickController(controllerId);
        });
      });

    if (this.elements.kickButton) {
      this.elements.kickButton.style.display = "block";
    }
  }

  /**
   * Show kicked message
   */
  showKickedMessage() {
    this.showNotification(
      "You have been kicked by another controller",
      "error",
      5000,
    );
  }

  /**
   * Show program saved feedback
   * @param {number} bankId - Bank ID that was saved to
   */
  showProgramSavedFeedback(bankId) {
    this.showNotification(`Program saved to Bank ${bankId}`, "success", 2000);
  }

  /**
   * Show program loaded feedback
   * @param {number} bankId - Bank ID that was loaded from
   */
  showProgramLoadedFeedback(bankId) {
    this.showNotification(`Program loaded from Bank ${bankId}`, "info", 2000);
  }

  /**
   * Show notification message
   * @param {string} message - Message to show
   * @param {string} type - Type of notification (success, error, info, warning)
   * @param {number} duration - Duration in ms (0 = permanent)
   */
  showNotification(message, type = "info", duration = 3000) {
    // Create notification element
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.textContent = message;

    // Style the notification
    Object.assign(notification.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      padding: "12px 20px",
      borderRadius: "6px",
      color: "white",
      fontWeight: "bold",
      zIndex: "10000",
      opacity: "0",
      transform: "translateX(100%)",
      transition: "all 0.3s ease",
    });

    // Type-specific styling
    switch (type) {
      case "success":
        notification.style.background = "#4CAF50";
        break;
      case "error":
        notification.style.background = "#f44336";
        break;
      case "warning":
        notification.style.background = "#ff9800";
        break;
      case "info":
      default:
        notification.style.background = "#2196F3";
    }

    // Add to DOM
    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
      notification.style.opacity = "1";
      notification.style.transform = "translateX(0)";
    }, 10);

    // Remove after duration
    if (duration > 0) {
      setTimeout(() => {
        notification.style.opacity = "0";
        notification.style.transform = "translateX(100%)";
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }, duration);
    }

    // Notification shown
  }

  /**
   * Kick another controller
   * @param {string} controllerId - Controller ID to kick
   */
  kickController(controllerId) {
    if (window.networkCoordinator) {
      window.networkCoordinator.kickController(controllerId);
      this.showNotification(`Kicked controller: ${controllerId}`, "info", 2000);
    }
  }

  /**
   * Handle state changes
   * @param {Object} data - State change data
   * @private
   */
  handleStateChange(data) {
    // Handle specific state changes that affect UI
    switch (data.key) {
      case "parametersChanged":
        this.updateParameterChangeIndicators(data.value);
        break;
      default:
        // Generic state change handling
        if (window.Logger) {
          window.Logger.log(
            `UI handling state change: ${data.key}`,
            "parameters",
          );
        }
    }
  }

  /**
   * Update parameter change indicators
   * @param {Set} changedParams - Set of changed parameter IDs
   */
  updateParameterChangeIndicators(changedParams) {
    // Remove all existing change indicators
    document.querySelectorAll(".control-group").forEach((group) => {
      group.classList.remove("changed", "sent");
    });

    // Add change indicators for modified parameters
    changedParams.forEach((paramId) => {
      // Escape special characters in the paramId for querySelector
      const escapedId = CSS.escape(paramId);
      const controlGroup = document
        .querySelector(`#${escapedId}`)
        ?.closest(".control-group");
      if (controlGroup) {
        controlGroup.classList.add("changed");
      }
    });
  }

  /**
   * Mark all parameters as sent
   */
  markAllParametersSent() {
    document.querySelectorAll(".control-group.changed").forEach((group) => {
      group.classList.remove("changed");
      group.classList.add("sent");
    });

    // Clear the changed parameters set
    this.appState.clearParameterChanges();
  }

  /**
   * Clear all parameter changed indicators
   */
  clearAllParameterChanges() {
    document.querySelectorAll(".control-group").forEach((group) => {
      group.classList.remove("changed");
      group.classList.remove("sent");
    });
  }

  /**
   * Convert frequency to note name
   * @param {number} frequency - Frequency in Hz
   * @returns {string} Note name with octave
   */
  frequencyToNote(frequency) {
    const A4 = 440;
    const C0 = A4 * Math.pow(2, -4.75);

    if (frequency <= 0) return "N/A";

    const h = Math.round(12 * Math.log2(frequency / C0));
    const octave = Math.floor(h / 12);
    const noteIndex = h % 12;

    const noteNames = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ];
    return `${noteNames[noteIndex]}${octave}`;
  }

  /**
   * Start periodic UI updates
   * @private
   */
  startPeriodicUpdates() {
    this.stopPeriodicUpdates();

    this.updateInterval = setInterval(() => {
      this.performPeriodicUpdate();
    }, SystemConfig.ui.statusUpdateInterval || 1000);
  }

  /**
   * Stop periodic UI updates
   * @private
   */
  stopPeriodicUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Perform periodic UI update
   * @private
   */
  performPeriodicUpdate() {
    // Update connection status
    this.updateConnectionStatus();

    // Update synth list with latest data
    this.updateSynthList();

    // Update connection count
    this.updateConnectionCount();
  }

  /**
   * Cleanup and destroy
   */
  destroy() {
    this.stopPeriodicUpdates();
    this.isInitialized = false;

    if (window.Logger) {
      window.Logger.log("UIManager destroyed", "lifecycle");
    }
  }

  /**
   * Add event listener for UI events
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    return this.eventBus.on(`ui:${event}`, handler);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  off(event, handler) {
    this.eventBus.off(`ui:${event}`, handler);
  }
}

// Create global instance
export const uiManager = new UIManager();

// Make available globally for backward compatibility
if (typeof window !== "undefined") {
  window.UIManager = UIManager;
  window.uiManager = uiManager;
}
