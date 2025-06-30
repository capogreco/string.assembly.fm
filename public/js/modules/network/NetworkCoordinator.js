/**
 * NetworkCoordinator Module for String Assembly FM
 * Coordinates WebSocket and WebRTC connections for the controller
 */

import { webSocketManager } from "./WebSocketManager.js";
import { webRTCManager } from "./WebRTCManager.js";
import { eventBus } from "../core/EventBus.js";
import { appState } from "../state/AppState.js";
import { MessageBuilders, validateMessage, MessageTypes } from "../../protocol/MessageProtocol.js";

export class NetworkCoordinator {
  constructor() {
    this.webSocket = webSocketManager;
    this.webRTC = webRTCManager;
    this.eventBus = eventBus;
    this.appState = appState;
    this.isInitialized = false;
    this.controllerId = null;
    this.statusUpdateInterval = null;
  }

  /**
   * Initialize the network coordinator
   * @param {string} controllerId - Unique controller identifier
   */
  async initialize(controllerId = null) {
    if (this.isInitialized) {
      if (window.Logger) {
        window.Logger.log(
          "NetworkCoordinator already initialized",
          "connections",
        );
      }
      return;
    }

    this.controllerId =
      controllerId || `ctrl-${Math.random().toString(36).substr(2, 9)}`;
    
    // Store controller ID in new state structure
    this.appState.setNested("connections.controllerId", this.controllerId);

    if (window.Logger) {
      window.Logger.log(
        `Initializing NetworkCoordinator (${this.controllerId})`,
        "lifecycle",
      );
    }

    // Set up event coordination
    this.setupEventCoordination();

    // Set up status monitoring
    this.startStatusMonitoring();

    this.isInitialized = true;

    if (window.Logger) {
      window.Logger.log("NetworkCoordinator initialized", "lifecycle");
    }
  }

  /**
   * Connect to the WebSocket server
   * @returns {Promise<boolean>} Connection success status
   */
  async connect() {
    try {
      if (window.Logger) {
        window.Logger.log("Starting network connection...", "connections");
      }

      // Update connection status - both new and legacy structure
      this.appState.setNested("connections.websocket.connected", false);
      this.appState.setNested("connections.websocket.reconnecting", true);

      // Connect WebSocket and wait for it to be ready
      const connected = await this.webSocket.connect(this.controllerId);

      if (connected) {
        // This part will now only run after the WebSocket is fully connected
        // Update connection status - both new and legacy structure
        this.appState.setNested("connections.websocket.connected", true);
        this.appState.setNested("connections.websocket.reconnecting", false);
          
        // Initialize WebRTC manager after WebSocket is connected
        this.webRTC.initialize();

        if (window.Logger) {
          window.Logger.log("Network connection established", "connections");
        }
        return true;
      } else {
        if (window.Logger) {
          window.Logger.log("Failed to establish network connection", "error");
        }
        // Update connection status - both new and legacy structure
        this.appState.setNested("connections.websocket.connected", false);
        this.appState.setNested("connections.websocket.reconnecting", false);
        this.appState.setNested("connections.websocket.lastError", "Failed to establish network connection");
        return false;
      }
    } catch (error) {
      if (window.Logger) {
        window.Logger.log(`Network connection error: ${error}`, "error");
      }
      // Update connection status - both new and legacy structure
      this.appState.setNested("connections.websocket.connected", false);
      this.appState.setNested("connections.websocket.reconnecting", false);
      this.appState.setNested("connections.websocket.lastError", error.message || error.toString());
      return false;
    }
  }

  /**
   * Disconnect from all networks
   */
  disconnect() {
    if (window.Logger) {
      window.Logger.log("Disconnecting from all networks...", "connections");
    }

    // Close all WebRTC connections
    this.webRTC.closeAllConnections();

    // Disconnect WebSocket
    this.webSocket.disconnect();

    // Stop status monitoring
    this.stopStatusMonitoring();

    // Update connection status - both new and legacy structure
    this.appState.setNested("connections.websocket.connected", false);
    this.appState.setNested("connections.websocket.reconnecting", false);
    this.appState.setNested("connections.synths", new Map());

    if (window.Logger) {
      window.Logger.log("Disconnected from all networks", "connections");
    }
  }

  /**
   * Setup event coordination between WebSocket and WebRTC
   * @private
   */
  setupEventCoordination() {
    // WebSocket connection events
    this.webSocket.on("connected", (data) => {
      if (window.Logger) {
        window.Logger.log("WebSocket connected", "connections");
      }
      // Update connection status - both new and legacy structure
      this.appState.setNested("connections.websocket.connected", true);
      this.appState.setNested("connections.websocket.reconnecting", false);
    });

    this.webSocket.on("disconnected", (data) => {
      if (window.Logger) {
        window.Logger.log("WebSocket disconnected", "connections");
      }
      // Update connection status - both new and legacy structure
      this.appState.setNested("connections.websocket.connected", false);
      this.appState.setNested("connections.websocket.reconnecting", false);
      this.appState.setNested("connections.synths", new Map());
    });

    this.webSocket.on("kicked", (data) => {
      if (window.Logger) {
        window.Logger.log("Controller was kicked", "connections");
      }
      // Update connection status - both new and legacy structure
      this.appState.setNested("connections.websocket.connected", false);
      this.appState.setNested("connections.websocket.reconnecting", false);
      this.appState.setNested("connections.websocket.lastError", "Controller was kicked");
      this.eventBus.emit("network:kicked", data);
    });

    this.webSocket.on("controllerList", (data) => {
      this.eventBus.emit("network:controllerListUpdated", data);
    });

    // WebRTC peer events
    this.webRTC.on("peerCreated", (data) => {
      if (window.Logger) {
        window.Logger.log(
          `Peer connection created: ${data.peerId}`,
          "connections",
        );
      }
    });

    this.webRTC.on("peerDisconnected", (data) => {
      if (window.Logger) {
        window.Logger.log(`Peer disconnected: ${data.peerId}`, "connections");
      }
      this.appState.removeConnectedSynth(data.peerId);
    });

    // WebRTC data channel events
    this.webRTC.on("dataChannelOpen", (data) => {
      console.log(`[NetworkCoordinator] Data channel open event received for ${data.peerId}`);
      if (window.Logger) {
        window.Logger.log(
          `Data channel open: ${data.peerId}`,
          "connections",
        );
      }

      // Add to connected synths
      this.appState.addConnectedSynth(data.peerId, {
        id: data.peerId,
        connectedAt: Date.now(),
        latency: null,
        state: null,
      });

      console.log(`[NetworkCoordinator] Emitting network:synthConnected for ${data.peerId}`);
      // Auto-send program on connection
      this.eventBus.emit("network:synthConnected", {
        synthId: data.peerId,
        channel: data.channel,
      });
    });

    // Legacy param channel support
    this.webRTC.on("paramChannelOpen", (data) => {
      if (window.Logger) {
        window.Logger.log(
          `Parameter channel open: ${data.peerId}`,
          "connections",
        );
      }

      // Add to connected synths
      this.appState.addConnectedSynth(data.peerId, {
        id: data.peerId,
        connectedAt: Date.now(),
        latency: null,
        state: null,
      });

      // Auto-send program on connection
      this.eventBus.emit("network:synthConnected", {
        synthId: data.peerId,
        channel: data.channel,
      });
    });

    this.webRTC.on("dataChannelClosed", (data) => {
      if (window.Logger) {
        window.Logger.log(
          `Data channel closed: ${data.peerId}`,
          "connections",
        );
      }
      this.appState.removeConnectedSynth(data.peerId);
    });

    // Legacy param channel support
    this.webRTC.on("paramChannelClosed", (data) => {
      if (window.Logger) {
        window.Logger.log(
          `Parameter channel closed: ${data.peerId}`,
          "connections",
        );
      }
      this.appState.removeConnectedSynth(data.peerId);
    });

    this.webRTC.on("commandChannelOpen", (data) => {
      if (window.Logger) {
        window.Logger.log(
          `Command channel open: ${data.peerId}`,
          "connections",
        );
      }
    });

    // Unified data message handling
    this.webRTC.on("dataMessage", (data) => {
      this.handleDataMessage(data);
    });

    // Legacy message handling for compatibility
    this.webRTC.on("paramMessage", (data) => {
      this.handleParamMessage(data);
    });

    this.webRTC.on("commandMessage", (data) => {
      this.handleCommandMessage(data);
    });

    // Listen for synth connections to auto-send programs
    this.eventBus.on("network:synthConnected", (data) => {
      this.onSynthConnected(data.synthId, data.channel);
    });
  }

  /**
   * Handle unified data channel messages
   * @private
   */
  handleDataMessage(data) {
    const { peerId, data: message, peerData } = data;

    // Route to appropriate handler based on message type
    if (message.type === MessageTypes.COMMAND || 
        message.type === MessageTypes.SAVE_TO_BANK || 
        message.type === MessageTypes.LOAD_FROM_BANK) {
      this.handleCommandMessage(data);
    } else {
      this.handleParamMessage(data);
    }
  }

  /**
   * Handle parameter channel messages
   * @private
   */
  handleParamMessage(data) {
    const { peerId, data: message, peerData } = data;

    switch (message.type) {
      case "pong":
        // Update latency tracking
        this.appState.updateSynthLatency(peerId, peerData.latency);

        // Also update state if included in pong message
        if (message.state) {
          this.appState.updateSynthState(peerId, {
            audioEnabled: message.state.audio_enabled,
            instrumentJoined: message.state.joined,
            state: message.state
          });
        }

        if (window.Logger) {
          window.Logger.log(
            `Pong from ${peerId}: ${peerData.latency}ms`,
            "performance",
          );
        }
        break;

      // DEPRECATED: Program requests removed - programs are pushed automatically
      // case "request_program":
      //   if (window.Logger) {
      //     window.Logger.log(`Program request from ${peerId}`, "messages");
      //   }
      //   this.eventBus.emit("network:programRequested", {
      //     synthId: peerId,
      //     timestamp: Date.now(),
      //   });
      //   break;
        
      case "request_bank_program":
        if (window.Logger) {
          window.Logger.log(`Bank program request from ${peerId} for bank ${message.bank}`, "messages");
        }

        // Emit bank program request event for handling by other modules
        this.eventBus.emit("network:bankProgramRequested", {
          synthId: peerId,
          bankId: message.bank,
          transition: message.transition,
          timestamp: Date.now(),
        });
        break;

      case "state_update":
        // Update synth state with enhanced information
        // Handle both direct fields and nested state object
        const stateUpdate = message.state || {};
        this.appState.updateSynthState(peerId, {
          state: stateUpdate,
          audioEnabled: message.audioEnabled || message.audio_enabled || stateUpdate.audio_enabled,
          instrumentJoined: message.instrumentJoined || message.joined || stateUpdate.joined
        });
        break;

      default:
        // Emit generic parameter message event
        this.eventBus.emit("network:paramMessage", {
          synthId: peerId,
          message,
          timestamp: Date.now(),
        });
    }
  }

  /**
   * Handle command channel messages
   * @private
   */
  handleCommandMessage(data) {
    const { peerId, data: message } = data;

    if (window.Logger) {
      window.Logger.log(`Command from ${peerId}: ${message.type}`, "messages");
    }

    // Emit command message event
    this.eventBus.emit("network:commandMessage", {
      synthId: peerId,
      message,
      timestamp: Date.now(),
    });
  }

  /**
   * Send program to specific synth
   * @param {string} synthId - Target synth ID
   * @param {Object} program - Program data
   * @param {Object} transition - Transition timing
   * @returns {boolean} Success status
   */
  sendProgramToSynth(synthId, program, transition = null) {
    // Extract power state if it's embedded in the program
    const power = program.power !== undefined ? program.power : true;
    
    // Create clean program without power field
    const cleanProgram = { ...program };
    delete cleanProgram.power;
    
    // Use protocol builder
    const message = MessageBuilders.program(cleanProgram, power, transition);
    
    // Validate before sending
    try {
      validateMessage(message);
    } catch (error) {
      if (window.Logger) {
        window.Logger.log(`Invalid program message: ${error.message}`, "error");
      }
      return false;
    }

    const success = this.webRTC.sendDataMessage(synthId, message);

    if (success && window.Logger) {
      window.Logger.log(`Sent program to ${synthId}`, "messages");
    }

    return success;
  }

  /**
   * Send command to specific synth
   * @param {string} synthId - Target synth ID
   * @param {Object} command - Command data
   * @returns {boolean} Success status
   */
  sendCommandToSynth(synthId, command) {
    // Ensure command has proper format
    let message;
    
    // Handle legacy command format
    if (command.type === MessageTypes.SAVE_TO_BANK || command.type === MessageTypes.LOAD_FROM_BANK) {
      message = command; // Already in correct format
    } else if (command.type === "command") {
      // Convert to protocol format
      message = MessageBuilders.command(command.name, command.value, command.data);
      if (command.bank !== undefined) {
        message.bank = command.bank;
      }
    } else {
      // Assume it's a raw command
      message = command;
    }
    
    // Validate before sending
    try {
      validateMessage(message);
    } catch (error) {
      if (window.Logger) {
        window.Logger.log(`Invalid command message: ${error.message}`, "error");
      }
      return false;
    }
    
    const success = this.webRTC.sendDataMessage(synthId, message);

    if (success && window.Logger) {
      window.Logger.log(
        `Sent command to ${synthId}: ${command.type}${command.name ? ` (${command.name})` : ''}`,
        "messages",
      );
    } else if (!success && window.Logger) {
      window.Logger.log(
        `Failed to send command to ${synthId}: ${command.type}${command.name ? ` (${command.name})` : ''}`,
        "error",
      );
    }

    return success;
  }

  /**
   * Broadcast program to all connected synths
   * @param {Object} program - Program data
   * @param {Object} transition - Transition timing
   * @returns {number} Number of synths that received the program
   */
  broadcastProgram(program, transition = null) {
    const connectedSynths = this.appState.getNested("connections.synths");
    let successCount = 0;

    connectedSynths.forEach((synthData, synthId) => {
      if (this.sendProgramToSynth(synthId, program, transition)) {
        successCount++;
      }
    });

    if (window.Logger) {
      window.Logger.log(
        `Broadcast program to ${successCount}/${connectedSynths.size} synths`,
        "messages",
      );
    }

    return successCount;
  }

  /**
   * Handle new synth connection - automatically send current program
   * @param {string} synthId - The synth that connected
   * @param {RTCDataChannel} channel - The data channel (optional)
   */
  onSynthConnected(synthId, channel = null) {
    console.log(`[NetworkCoordinator] onSynthConnected called for ${synthId}`);
    if (window.Logger) {
      window.Logger.log(`Synth ${synthId} connected - sending current program`, 'network');
    }
    
    // Get the active program from PartManager's last sent program
    const partManager = window.partManager || this.appState.get('partManager');
    const systemState = this.appState.getSystemState();
    
    console.log(`[NetworkCoordinator] PartManager available:`, !!partManager);
    console.log(`[NetworkCoordinator] PartManager lastSentProgram:`, !!partManager?.lastSentProgram);
    
    if (partManager && partManager.lastSentProgram) {
      // Use the last successfully sent program (the active program)
      const baseProgram = partManager.lastSentProgram.baseProgram;
      console.log(`[NetworkCoordinator] Got active program with ${Object.keys(baseProgram).length} parameters`);
      
      // Send the base program to the synth
      // PartManager will handle assigning specific frequency/expression via sendProgramToSpecificSynth
      const sentProgram = {
        ...baseProgram,
        power: systemState.audio.power
      };
      
      console.log(`[NetworkCoordinator] Triggering program send for ${synthId}`);
      
      // Use PartManager to send program with proper frequency/expression assignment
      partManager.sendProgramToSpecificSynth(synthId);
      
      // Track that we sent to this synth
      const connections = this.appState.getNested('connections.synths');
      const existingConnection = connections.get(synthId) || {};
      connections.set(synthId, {
        ...existingConnection,
        connected: true,
        lastProgramSent: Date.now()
      });
      this.appState.setNested('connections.synths', new Map(connections));
      
      if (window.Logger) {
        window.Logger.log(`Triggered program send to synth ${synthId}`, 'network');
      }
    } else {
      console.log(`[NetworkCoordinator] No active program available`);
      if (window.Logger) {
        window.Logger.log(`No active program to send to synth ${synthId} - user hasn't sent a program yet`, 'network');
      }
    }
  }


  /**
   * Broadcast program to all connected synths
   * @param {Object} program - Program to broadcast
   */
  broadcastProgram(program) {
    const systemState = this.appState.getSystemState();
    
    // Add power state to program
    const programWithPower = {
      ...program,
      power: systemState.audio.power
    };
    
    // Send to all connected synths
    const synths = this.appState.getNested('connections.synths');
    let successCount = 0;
    
    synths.forEach((synthInfo, synthId) => {
      if (synthInfo.connected) {
        if (this.sendProgramToSynth(synthId, programWithPower)) {
          successCount++;
        }
      }
    });
    
    if (window.Logger) {
      window.Logger.log(`Broadcast program to ${successCount}/${synths.size} synths`, 'network');
    }
    
    return successCount;
  }

  /**
   * Broadcast command to all connected synths
   * @param {Object} command - Command data (or name and value for simple commands)
   * @returns {number} Number of synths that received the command
   */
  broadcastCommand(command) {
    const connectedSynths = this.appState.getNested("connections.synths");
    let successCount = 0;

    connectedSynths.forEach((synthData, synthId) => {
      if (this.sendCommandToSynth(synthId, command)) {
        successCount++;
      }
    });

    if (window.Logger) {
      window.Logger.log(
        `Broadcast command to ${successCount}/${connectedSynths.size} synths: ${command.type}`,
        "messages",
      );
    }

    return successCount;
  }

  /**
   * Ping all connected synths
   */
  pingAllSynths() {
    this.webRTC.pingAllPeers();
  }

  /**
   * Kick another controller
   * @param {string} controllerId - Controller ID to kick
   */
  kickController(controllerId) {
    this.webSocket.kickController(controllerId);
  }

  /**
   * Request current controller list
   */
  requestControllerList() {
    this.webSocket.requestControllerList();
  }

  /**
   * Start status monitoring
   * @private
   */
  startStatusMonitoring() {
    this.stopStatusMonitoring();

    this.statusUpdateInterval = setInterval(() => {
      this.updateNetworkStatus();
    }, 5000); // Update every 5 seconds
  }

  /**
   * Stop status monitoring
   * @private
   */
  stopStatusMonitoring() {
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
      this.statusUpdateInterval = null;
    }
  }

  /**
   * Update network status information
   * @private
   */
  updateNetworkStatus() {
    // Update WebSocket status
    const wsStatus = this.webSocket.getStatus();

    // Update connection status based on WebSocket
    const isConnected = this.appState.getNested("connections.websocket.connected");
    
    // Simply update connection state based on WebSocket status
    if (wsStatus.connected) {
      this.appState.setNested("connections.websocket.connected", true);
      this.appState.setNested("connections.websocket.reconnecting", false);
    } else if (wsStatus.connecting) {
      this.appState.setNested("connections.websocket.connected", false);
      this.appState.setNested("connections.websocket.reconnecting", true);
    } else {
      this.appState.setNested("connections.websocket.connected", false);
      this.appState.setNested("connections.websocket.reconnecting", false);
    }

    // Ping all synths for latency updates
    if (wsStatus.connected) {
      this.pingAllSynths();
    }

    // Clean up disconnected peers
    const currentTime = Date.now();
    const connectedSynths = this.appState.getNested("connections.synths");

    connectedSynths.forEach((synthData, synthId) => {
      const peerInfo = this.webRTC.getPeerInfo(synthId);

      // Remove synths that are no longer connected
      if (
        !peerInfo ||
        peerInfo.connectionState === "disconnected" ||
        peerInfo.connectionState === "failed"
      ) {
        this.appState.removeConnectedSynth(synthId);
      }

      // Mark synths as stale if no recent ping
      else if (synthData.lastPing && currentTime - synthData.lastPing > 30000) {
        if (window.Logger) {
          window.Logger.log(
            `Synth ${synthId} appears stale (no ping for 30s)`,
            "performance",
          );
        }
      }
    });
  }

  /**
   * Get network status summary
   * @returns {Object} Network status information
   */
  getNetworkStatus() {
    const wsStatus = this.webSocket.getStatus();
    const connectedSynths = this.appState.getNested("connections.synths");
    const averageLatency = this.appState.getNested("connections.metrics.averageLatency");

    return {
      websocket: {
        connected: wsStatus.connected,
        connecting: wsStatus.connecting,
        url: wsStatus.url,
        clientId: wsStatus.clientId,
        reconnectAttempts: wsStatus.reconnectAttempts,
        queuedMessages: wsStatus.queuedMessages,
      },
      webrtc: {
        connectedPeers: connectedSynths.size,
        peers: Array.from(connectedSynths.keys()),
        averageLatency,
      },
      overall: {
        status: this.appState.getNested("connections.websocket.connected") ? "connected" : "disconnected",
        controllerId: this.controllerId,
        initialized: this.isInitialized,
      },
    };
  }

  /**
   * Add event listener for network events
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    return this.eventBus.on(`network:${event}`, handler);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  off(event, handler) {
    this.eventBus.off(`network:${event}`, handler);
  }
}

// Create global instance
export const networkCoordinator = new NetworkCoordinator();

// Make available globally for backward compatibility
if (typeof window !== "undefined") {
  window.NetworkCoordinator = NetworkCoordinator;
  window.networkCoordinator = networkCoordinator;
}
