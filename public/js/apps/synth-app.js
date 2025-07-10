// synth-app.js - Single synth instance application
import { SynthClient } from '../modules/synth/SynthClient.js';
import { Logger } from '../modules/core/Logger.js';
import { WaveformVisualizer } from '../modules/ui/WaveformVisualizer.js';
import { SystemConfig } from '../config/system.config.js';
import { MessageBuilders, validateMessage, MessageTypes, isMessageType } from '../protocol/MessageProtocol.js';

class SynthApp {
  constructor() {
    this.synthId = `synth-${Math.random().toString(36).substr(2, 9)}`;
    this.synthClient = new SynthClient(this.synthId, {
      enableLogging: true,
      enableVisualizer: true
    });
    
    this.ws = null;
    this.audioContext = null;
    this.controllers = new Map();
    this.rtcConfig = SystemConfig.network.webrtc;
    this.hasJoinedInstrument = false;
    
    // UI elements
    this.statusEl = document.getElementById("status");
    this.calibrationButton = document.getElementById("start_calibration");
    this.joinButton = document.getElementById("join_instrument");
    this.calibrationPhase = document.getElementById("calibration_phase");
    this.calibrationContent = document.getElementById("calibration_content");
    this.joinPhase = document.getElementById("join_phase");
    this.canvas = document.getElementById("visualizer");
    this.visualizer = null;
    
    // Initialize logging
    Logger.log("SynthApp initializing", "lifecycle");
  }

  async init() {
    // console.log("[DEBUG] init() called");
    
    // Fetch ICE servers
    await this.fetchIceServers();
    
    // Setup canvas and visualizer
    if (this.canvas) {
      this.visualizer = new WaveformVisualizer(this.canvas, {
        lineWidth: 2,
        strokeStyle: '#60a5fa',
        backgroundColor: '#1a1a2e',
        amplitudeScale: 0.4
      });
      this.resizeCanvas();
      window.addEventListener('resize', () => this.resizeCanvas());
      // Start the visualizer animation loop
      this.visualizer.start();
      
      // Set canvas on SynthClient for its internal visualizer
      this.synthClient.setVisualizerCanvas(this.canvas);
    }
    
    // Connect WebSocket
    this.connectWebSocket();
    
    // Setup UI handlers
    this.setupUI();
  }

  async fetchIceServers() {
    try {
      const response = await fetch("/ice-servers");
      const data = await response.json();
      if (data.ice_servers) {
        this.rtcConfig.iceServers = data.ice_servers;
        // console.log("[DEBUG] ICE servers loaded:", this.rtcConfig.iceServers);
        Logger.log("ICE servers loaded", "connections");
      }
    } catch (error) {
      // console.log("[DEBUG] Failed to fetch ICE servers:", error);
      Logger.log("Failed to fetch ICE servers, using defaults", "error");
    }
  }

  resizeCanvas() {
    if (this.canvas && this.visualizer) {
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;
      
      // Only resize if dimensions actually changed
      if (this.canvas.width !== newWidth || this.canvas.height !== newHeight) {
        this.visualizer.resize(newWidth, newHeight);
        // console.log("[DEBUG] Canvas resized to:", newWidth, "x", newHeight);
      }
    }
  }

  connectWebSocket() {
    const wsUrl = SystemConfig.network.websocket.url;
    // console.log("[DEBUG] Connecting to WebSocket:", wsUrl);
    this.ws = new WebSocket(wsUrl);

    this.ws.addEventListener("open", () => {
      // console.log("[DEBUG] WebSocket connected");
      Logger.log("Connected to server", "connections");
      this.updateStatus(`Connected as ${this.synthId}`);
      
      // Register as a synth (not a controller)
      const registerMsg = {
        type: "register",
        client_id: this.synthId,
        client_type: "synth"  // Help server identify this is a synth
      };
      // console.log("[DEBUG] Sending registration:", registerMsg);
      this.ws.send(JSON.stringify(registerMsg));
      
      // Request controllers after a short delay to ensure registration is processed
      setTimeout(() => {
        const requestMsg = {
          type: "request-controllers",
          source: this.synthId
        };
        // console.log("[DEBUG] Requesting controllers:", requestMsg);
        this.ws.send(JSON.stringify(requestMsg));
      }, 100);
    });

    this.ws.addEventListener("message", async (event) => {
      const message = JSON.parse(event.data);
      await this.handleMessage(message);
    });

    this.ws.addEventListener("close", () => {
      Logger.log("Disconnected from server", "connections");
      this.updateStatus("Disconnected - Reconnecting...");
      setTimeout(() => this.connectWebSocket(), SystemConfig.network.websocket.reconnectDelay);
    });

    this.ws.addEventListener("error", (error) => {
      Logger.log(`WebSocket error: ${error}`, "error");
    });
  }

  async handleMessage(message) {
    // console.log("[DEBUG] Received WebSocket message:", message);

    switch (message.type) {
      case "controllers-list":
        // Received list of active controllers
        // console.log("[DEBUG] Controllers list received:", message.controllers);
        Logger.log(`Received controllers list: ${message.controllers.join(", ")}`, "connections");
        
        // Clear controllers that are no longer in the list
        for (const [controllerId, controller] of this.controllers) {
          if (!message.controllers.includes(controllerId)) {
            if (controller.connection) {
              controller.connection.close();
            }
            this.controllers.delete(controllerId);
            this.synthClient.controllers.delete(controllerId);
          }
        }
        
        // Add and connect to any new controllers
        for (const controllerId of message.controllers) {
          if (!this.controllers.has(controllerId)) {
            // console.log(`[DEBUG] Discovered new controller: ${controllerId}`);
            Logger.log(`Discovered controller: ${controllerId}`, "connections");
            this.controllers.set(controllerId, {
              id: controllerId,
              connection: null,
              channel: null,
              connected: false,
              iceQueue: []
            });
            // Auto-connect to discovered controller
            // console.log(`[DEBUG] Auto-connecting to controller: ${controllerId}`);
            this.connectToController(controllerId);
          } else {
            // console.log(`[DEBUG] Controller ${controllerId} already in map`);
          }
        }
        this.updateControllerList();
        break;

      case "controller-joined":
        // New controller joined
        Logger.log(`New controller joined: ${message.controller_id}`, "connections");
        if (!this.controllers.has(message.controller_id)) {
          this.controllers.set(message.controller_id, {
            id: message.controller_id,
            connection: null,
            channel: null,
            connected: false,
            iceQueue: []
          });
          this.connectToController(message.controller_id);
        }
        this.updateControllerList();
        break;

      case "controller-left":
        // Controller disconnected
        Logger.log(`Controller left: ${message.controller_id}`, "connections");
        if (this.controllers.has(message.controller_id)) {
          const controller = this.controllers.get(message.controller_id);
          if (controller.connection) {
            controller.connection.close();
          }
          this.controllers.delete(message.controller_id);
          this.synthClient.controllers.delete(message.controller_id);
        }
        this.updateControllerList();
        break;

      case "answer":
        // Handle WebRTC answer from controller
        // console.log(`[DEBUG] Received answer from ${message.source}`);
        const controller = this.controllers.get(message.source);
        if (controller && controller.connection) {
          // console.log(`[DEBUG] Setting remote description for ${message.source}`);
          await controller.connection.setRemoteDescription(message.data);
          
          // Process any queued ICE candidates
          if (controller.iceQueue && controller.iceQueue.length > 0) {
            // console.log(`[DEBUG] Processing ${controller.iceQueue.length} queued ICE candidates`);
            for (const candidate of controller.iceQueue) {
              await controller.connection.addIceCandidate(candidate);
            }
            controller.iceQueue = [];
          }
        } else {
          // console.log(`[DEBUG] No controller or connection for ${message.source}`);
        }
        break;

      case "ice-candidate":
      case "ice":  // Server sends "ice" not "ice-candidate"
        // Handle ICE candidate from controller
        // console.log(`[DEBUG] Received ICE candidate from ${message.source}`);
        const targetController = this.controllers.get(message.source);
        if (targetController && targetController.connection) {
          try {
            if (targetController.connection.remoteDescription) {
              // console.log(`[DEBUG] Adding ICE candidate immediately`);
              await targetController.connection.addIceCandidate(message.data);
            } else {
              // Queue ICE candidate until remote description is set
              // console.log(`[DEBUG] Queueing ICE candidate (no remote description yet)`);
              targetController.iceQueue.push(message.data);
            }
          } catch (error) {
            // console.log(`[DEBUG] Error adding ICE candidate: ${error.message}`);
          }
        } else {
          // console.log(`[DEBUG] No controller or connection found for ${message.source}`);
        }
        break;
    }
  }

  async connectToController(controllerId) {
    // console.log(`[DEBUG] connectToController called for: ${controllerId}`);
    const controller = this.controllers.get(controllerId);
    if (!controller) {
      // console.log(`[DEBUG] Controller ${controllerId} not found in map`);
      Logger.log(`Controller ${controllerId} not found in map`, "error");
      return;
    }
    
    // Don't reconnect if already connected
    if (controller.connected && controller.connection && 
        controller.connection.connectionState === "connected") {
      // console.log(`[DEBUG] Already connected to controller ${controllerId}`);
      Logger.log(`Already connected to controller ${controllerId}`, "connections");
      return;
    }
    
    // Close any existing connection
    if (controller.connection) {
      // console.log(`[DEBUG] Closing existing connection to ${controllerId}`);
      controller.connection.close();
    }
    
    // console.log(`[DEBUG] Creating new RTCPeerConnection for ${controllerId}`);
    Logger.log(`Initiating connection to controller ${controllerId}`, "connections");
    
    try {
      const pc = new RTCPeerConnection(this.rtcConfig);
      controller.connection = pc;

    // Create unified data channel
    const dataChannel = pc.createDataChannel("data");
    controller.channel = dataChannel;

    dataChannel.addEventListener("open", () => {
      // console.log(`[DEBUG] Data channel OPENED to controller ${controllerId}`);
      Logger.log(`Data channel open to controller ${controllerId}`, "connections");
      controller.connected = true;
      
      // Add to SynthClient's controllers with data channel reference
      this.synthClient.controllers.set(controllerId, {
        ...controller,
        dataChannel: dataChannel
      });
      
      this.updateControllerList();

      // Send immediate state update
      dataChannel.send(JSON.stringify({
        type: "pong",
        timestamp: Date.now(),
        state: this.getSynthState()
      }));

      // No need to request program - controller will push automatically
    });

    dataChannel.addEventListener("message", (event) => {
      this.handleDataChannelMessage(controllerId, JSON.parse(event.data));
    });

    dataChannel.addEventListener("close", () => {
      Logger.log(`Data channel closed to controller ${controllerId}`, "connections");
      controller.connected = false;
      
      // Remove from SynthClient's controllers
      this.synthClient.controllers.delete(controllerId);
      
      this.updateControllerList();
    });

    // Handle ICE candidates
    pc.addEventListener("icecandidate", (event) => {
      if (event.candidate) {
        this.sendMessage({
          type: "ice-candidate",
          source: this.synthId,
          target: controllerId,
          data: event.candidate
        });
      }
    });

    // Handle connection state changes
    pc.addEventListener("connectionstatechange", () => {
      Logger.log(`Connection state to ${controllerId}: ${pc.connectionState}`, "connections");
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        controller.connected = false;
        this.updateControllerList();
      }
    });

    // Create and send offer
    // console.log(`[DEBUG] Creating WebRTC offer for ${controllerId}`);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const offerMessage = {
      type: "offer",
      source: this.synthId,
      target: controllerId,
      data: offer
    };
    // console.log(`[DEBUG] Sending offer to ${controllerId}:`, offerMessage);
    this.sendMessage(offerMessage);
    
    } catch (error) {
      Logger.log(`Failed to connect to controller ${controllerId}: ${error.message}`, "error");
      controller.connected = false;
      this.updateControllerList();
    }
  }

  handleDataChannelMessage(controllerId, message) {
    // Validate message before processing
    try {
      validateMessage(message);
    } catch (error) {
      Logger.log(`Invalid message from ${controllerId}: ${error.message}`, "error");
      Logger.log("[ERROR] Invalid message:", message, error, 'error');
      return;
    }
    

    switch (message.type) {
      case MessageTypes.PING:
        // Respond to ping
        const controller = this.controllers.get(controllerId);
        if (controller && controller.channel && controller.channel.readyState === "open") {
          const pongMessage = MessageBuilders.pong(message.timestamp, this.getSynthState());
          controller.channel.send(JSON.stringify(pongMessage));
        }
        break;

      case MessageTypes.PROGRAM:
        // Receive program from controller
        Logger.log(`"[DEBUG] Received program message:", message`, 'messages');
        Logger.log(`"[DEBUG] Program has parts:", !!message.program?.parts`, 'messages');
        Logger.log(`"[DEBUG] Program parts:", message.program?.parts`, 'messages');
        
        // Use SynthClient to handle complete program message
        this.synthClient.handleProgram(message);
        break;

      case MessageTypes.COMMAND:
        // Handle commands
        Logger.log(`"[DEBUG] Received command:", message`, 'messages');
        
        if (message.name === "power") {
          // Handle power on/off
          const powerOn = message.value;
          Logger.log(`[DEBUG] Setting power to: ${powerOn}`, 'parameters');
          this.synthClient.setPower(powerOn);
        } else if (message.data && message.data.type === "request-state") {
          // DEPRECATED: State requests removed - use ping/pong for state updates
          this.sendStateToController(controllerId);
        }
        break;
        
      case MessageTypes.SAVE_TO_BANK:
        // TODO: Implement bank saving
        break;
        
      case MessageTypes.LOAD_FROM_BANK:
        // TODO: Implement bank loading
        break;
        
      default:
        // Handle legacy message types for backward compatibility
        if (message.type === "ping") {
          // Legacy ping format
          const controller = this.controllers.get(controllerId);
          if (controller && controller.channel && controller.channel.readyState === "open") {
            const pongMessage = MessageBuilders.pong(message.timestamp, this.getSynthState());
            controller.channel.send(JSON.stringify(pongMessage));
          }
        } else {
          Logger.log(`Unknown message type: ${message.type}`, "warn");
        }
        break;
    }
  }

  sendMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // console.log(`[DEBUG] Sending WebSocket message:`, message);
      this.ws.send(JSON.stringify(message));
    } else {
      // console.log(`[DEBUG] Cannot send message, WebSocket not open. State:`, this.ws?.readyState);
    }
  }

  sendStateToController(controllerId) {
    const controller = this.controllers.get(controllerId);
    if (controller && controller.channel && controller.channel.readyState === "open") {
      controller.channel.send(JSON.stringify({
        type: "state",
        timestamp: Date.now(),
        state: this.getSynthState()
      }));
    }
  }

  requestCurrentProgram() {
    // DEPRECATED: Program requests removed - controllers now push programs automatically
    Logger.log(`[${this.synthId}] Program request ignored - controllers push programs automatically`, "info");
    // Do nothing - programs are pushed automatically by controllers
  }

  getSynthState() {
    const clientState = this.synthClient.getState();
    return {
      synthId: this.synthId,
      isCalibrating: clientState.isCalibrating,
      isPowered: clientState.isPoweredOn,
      hasProgram: clientState.isActive,
      audioContextState: this.audioContext ? this.audioContext.state : 'none',
      // These are the fields expected by the controller for UI indicators
      audio_enabled: clientState.audioInitialized && this.audioContext && this.audioContext.state === 'running',
      joined: this.hasJoinedInstrument
    };
  }

  broadcastStateUpdate() {
    // Send state update to all connected controllers
    const state = this.getSynthState();
    const stateMessage = {
      type: "state_update",
      state: state
    };
    
    this.controllers.forEach((controller, controllerId) => {
      if (controller.connected && controller.channel && controller.channel.readyState === 'open') {
        controller.channel.send(JSON.stringify(stateMessage));
        Logger.log(`State update sent to controller ${controllerId}`, "messages");
      }
    });
  }

  setupUI() {
    // Calibration button handler
    if (this.calibrationButton) {
      this.calibrationButton.addEventListener("click", () => this.startCalibration());
    }

    // Join button handler
    if (this.joinButton) {
      this.joinButton.addEventListener("click", () => this.joinInstrument());
    }
  }

  async startCalibration() {
    // Initialize audio context and start calibration
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      await this.synthClient.initializeAudio(this.audioContext);
      
      // Connect visualizer to the analyser
      if (this.visualizer && this.synthClient.analyser) {
        this.visualizer.setAnalyserNode(this.synthClient.analyser);
      }
    }
    
    // Start calibration via SynthClient
    await this.synthClient.startCalibration(0.7);
    
    // Update UI
    if (this.calibrationContent) {
      this.calibrationContent.style.display = "none";
    }
    if (this.joinPhase) {
      this.joinPhase.style.display = "block";
    }
    
    Logger.log("Started calibration", "lifecycle");
    
    // Send state update to notify controllers that audio is enabled
    this.broadcastStateUpdate();
  }

  async joinInstrument() {
    if (!this.synthClient.audioInitialized) {
      Logger.log("SynthClient not initialized", "error");
      return;
    }

    // End calibration and set power
    this.synthClient.endCalibration();
    this.synthClient.setPower(true);
    
    // Set joined flag
    this.hasJoinedInstrument = true;
    
    // Request program from controllers if none stored
    if (!this.synthClient.storedProgram) {
      this.synthClient.requestCurrentProgram();
    }
    
    // Hide calibration UI
    if (this.calibrationPhase) {
      this.calibrationPhase.style.display = "none";
    }
    
    // Update visualizer
    if (this.canvas) {
      this.canvas.classList.remove("dimmed");
    }
    
    Logger.log("Joined instrument", "lifecycle");
    
    // Send state update to all connected controllers
    this.broadcastStateUpdate();
    
    // Request wake lock
    this.requestWakeLock();
  }

  async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        const wakeLock = await navigator.wakeLock.request('screen');
        Logger.log("Wake lock acquired", "lifecycle");
        
        // Show wake lock status
        const wakeLockStatus = document.getElementById("wake-lock-status");
        if (wakeLockStatus) {
          wakeLockStatus.style.display = "block";
        }
      } catch (err) {
        Logger.log(`Wake lock failed: ${err.message}`, "error");
      }
    }
  }

  updateStatus(text) {
    if (this.statusEl) {
      this.statusEl.textContent = text;
    }
  }

  updateControllerList() {
    const controllerListEl = document.getElementById("controller_list");
    if (!controllerListEl) return;

    // console.log("[DEBUG] updateControllerList called");
    // console.log("[DEBUG] All controllers:", Array.from(this.controllers.entries()).map(([id, c]) => ({
    //   id,
    //   connected: c.connected,
    //   hasConnection: !!c.connection,
    //   connectionState: c.connection?.connectionState
    // })));

    const connectedControllers = Array.from(this.controllers.values())
      .filter(c => c.connected)
      .map(c => c.id);

    // console.log("[DEBUG] Connected controllers:", connectedControllers);

    if (connectedControllers.length === 0) {
      controllerListEl.textContent = "None";
      controllerListEl.style.color = "#64748b";
    } else {
      controllerListEl.textContent = connectedControllers.join(", ");
      controllerListEl.style.color = "#60a5fa";
    }
  }

  // Visualizer is now handled by WaveformVisualizer module
}

// Initialize on load
const synthApp = new SynthApp();

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => synthApp.init());
} else {
  synthApp.init();
}

// Export for debugging
window.synthApp = synthApp;

// Add debug functions
window.debugSynth = {
  showControllers: () => {
    Logger.log("[DEBUG] Current controllers:", 'debug');
    synthApp.controllers.forEach((controller, id) => {
      Logger.log(`  ${id}: connected=${controller.connected}, state=${controller.connection?.connectionState}`, 'lifecycle');
    });
  },
  
  requestControllers: () => {
    Logger.log("[DEBUG] Manually requesting controllers list", 'debug');
    if (synthApp.ws && synthApp.ws.readyState === WebSocket.OPEN) {
      synthApp.ws.send(JSON.stringify({
        type: "request-controllers",
        source: synthApp.synthId
      }));
    } else {
      Logger.log("[DEBUG] WebSocket not connected", 'connections');
    }
  },
  
  showCanvasInfo: () => {
    Logger.log("[DEBUG] Canvas info:", 'debug');
    Logger.log(`"  Element:", synthApp.canvas`, 'lifecycle');
    Logger.log(`"  Visualizer:", synthApp.visualizer`, 'lifecycle');
    Logger.log(`"  Dimensions:", synthApp.canvas?.width, "x", synthApp.canvas?.height`, 'lifecycle');
    Logger.log(`"  Class:", synthApp.canvas?.className`, 'lifecycle');
    Logger.log(`"  Computed style opacity:", window.getComputedStyle(synthApp.canvas).opacity`, 'lifecycle');
  }
};