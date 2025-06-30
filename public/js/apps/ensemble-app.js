// ensemble-app.js - Multi-synth test ensemble application
import { SynthClient } from '../modules/synth/SynthClient.js';
import { Logger } from '../modules/core/Logger.js';
import { SystemConfig } from '../config/system.config.js';

// Wrapper class using SynthClient for ensemble
class TestSynth {
  constructor(id, index, totalSynths) {
    this.id = id;
    this.index = index;
    this.element = null;
    this.noteDisplay = null;
    this.expressionDisplay = null;
    this.levelMeter = null;
    this.canvas = null;
    this.ctx = null;

    // State
    this.currentNote = null;
    this.currentExpression = null;
    this.isActive = false;

    // WebRTC connections
    this.ws = null;
    this.controllers = new Map();

    // Calculate pan position
    this.panPosition = totalSynths === 1 ? 0 : (index / (totalSynths - 1)) * 2 - 1;

    // Create SynthClient instance with ensemble options
    this.synthClient = new SynthClient(id, {
      enableLogging: true,
      enableVisualizer: true,
      panPosition: this.panPosition
    });
  }

  async initialize(audioCtx, destination) {
    // Initialize SynthClient with ensemble destination
    await this.synthClient.initializeAudio(audioCtx, destination);
    
    // Set canvas for visualizer if available
    if (this.canvas) {
      this.synthClient.setVisualizerCanvas(this.canvas);
    }
    
    Logger.log(`[${this.id}] SynthClient initialized with panning: ${this.panPosition}`, "lifecycle");
    
    // No need to request program - controller will push automatically when connected
  }

  createElements(container) {
    this.element = this.createUI();
    container.appendChild(this.element);
    
    // Update display with stored values if they exist
    if (this.currentNote && this.noteDisplay) {
      this.noteDisplay.textContent = this.currentNote;
    }
    if (this.currentExpression && this.expressionDisplay) {
      this.expressionDisplay.textContent = this.currentExpression;
    }
  }

  createUI() {
    const synthDiv = document.createElement("div");
    synthDiv.className = "synth-instance";
    synthDiv.innerHTML = `
      <div class="synth-header">
        <span class="synth-id">${this.id}</span>
        <span class="connection-status disconnected">●</span>
      </div>
      <div class="synth-content">
        <div class="synth-info">
          <div>Note: <span class="note-display">-</span></div>
          <div>Expr: <span class="expression-display">-</span></div>
        </div>
        <canvas class="synth-visualizer" width="200" height="100"></canvas>
      </div>
    `;

    // Store references
    this.connectionStatus = synthDiv.querySelector(".connection-status");
    this.noteDisplay = synthDiv.querySelector(".note-display");
    this.expressionDisplay = synthDiv.querySelector(".expression-display");
    this.canvas = synthDiv.querySelector(".synth-visualizer");
    this.ctx = this.canvas.getContext("2d");

    return synthDiv;
  }

  updateConnectionStatus(connected) {
    if (this.connectionStatus) {
      this.connectionStatus.className = `connection-status ${connected ? "connected" : "disconnected"}`;
    }
  }

  requestCurrentProgram() {
    // Deprecated - programs are pushed automatically
    Logger.log(`[${this.id}] requestCurrentProgram called but deprecated - using push model`, "lifecycle");
  }

  startVisualizer() {
    // SynthClient handles visualizer internally
    this.synthClient.startVisualizer();
  }
}

class EnsembleApp {
  constructor() {
    this.synths = [];
    this.audioContext = null;
    this.masterGain = null;
    this.isInitialized = false;
    this.audioInitialized = false;
    
    // WebRTC configuration
    this.rtcConfig = SystemConfig.network.webrtc;
  }

  async init() {
    Logger.log("EnsembleApp initializing", "lifecycle");
    
    // Fetch ICE servers
    await this.fetchIceServers();
    
    // Setup UI handlers
    this.setupUI();
    
    // Add utility functions
    this.addUtilityFunctions();
  }

  async fetchIceServers() {
    try {
      const response = await fetch("/ice-servers");
      const data = await response.json();
      if (data.ice_servers) {
        this.rtcConfig.iceServers = data.ice_servers;
        Logger.log("ICE servers loaded", "connections");
      }
    } catch (error) {
      Logger.log("Failed to fetch ICE servers, using defaults", "error");
    }
  }

  setupUI() {
    document.getElementById("start-ensemble")?.addEventListener("click", () => this.handleStartEnsemble());
    document.getElementById("synth-count")?.addEventListener("change", (e) => this.handleSynthCountChange(e));
    document.getElementById("master-volume")?.addEventListener("input", (e) => this.handleVolumeChange(e));
    document.getElementById("calibrate-btn")?.addEventListener("click", () => this.calibrateAllSynths());
    document.getElementById("join-all-btn")?.addEventListener("click", () => this.joinAllSynths());
    
    // Handle window resize (SynthClient handles canvas resizing internally)
    window.addEventListener('resize', () => {
      // No action needed - SynthClient handles its own canvas management
    });
  }

  async handleStartEnsemble() {
    const button = document.getElementById("start-ensemble");
    const synthCount = parseInt(document.getElementById("synth-count").value);
    
    button.disabled = true;
    button.textContent = "Starting...";
    
    try {
      // Create synths
      await this.recreateSynths(synthCount);
      
      // Initialize connections
      this.isInitialized = true;
      this.connectAllSynthsToController();
      
      // Initialize audio
      await this.initializeEnsembleAudio();
      
      // Update status
      document.getElementById("status").textContent = "Running";
      
      this.log(`Ensemble started with ${synthCount} synths`, "info");
    } catch (error) {
      button.disabled = false;
      button.textContent = "Start Ensemble";
      this.log(`Failed to start ensemble: ${error.message}`, "error");
    }
  }

  async initializeAudioSystem() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
        this.log("Audio context resumed", "info");
      }

      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = SystemConfig.audio.defaults.masterVolume;
      this.masterGain.connect(this.audioContext.destination);

      this.log("Loading audio worklets...", "info");
      const { basePath, modules } = SystemConfig.audio.worklets;
      for (const module of modules) {
        await this.audioContext.audioWorklet.addModule(basePath + module);
      }
      this.log("Audio worklets loaded successfully", "info");
    }
  }

  async initializeEnsembleAudio() {
    if (this.audioInitialized) return;
    
    try {
      // Initialize audio system
      await this.initializeAudioSystem();

      // Initialize audio for all synths
      const initPromises = this.synths.map(synth => 
        synth.initialize(this.audioContext, this.masterGain)
      );
      
      await Promise.all(initPromises);
      
      this.audioInitialized = true;
      this.log("All synths audio initialized", "info");
      
      // Update UI
      const calibrateBtn = document.getElementById("calibrate-btn");
      if (calibrateBtn) calibrateBtn.disabled = false;
    } catch (error) {
      this.log(`Audio initialization error: ${error.message}`, "error");
      throw error;
    }
  }

  async recreateSynths(count) {
    // Clean up existing synths
    this.synths.forEach(synth => {
      if (synth.ws) {
        synth.ws.close();
      }
    });
    this.synths = [];

    // Create container
    const container = document.getElementById("synth-grid");
    container.innerHTML = "";

    // Create new synths
    for (let i = 0; i < count; i++) {
      const synthId = `synth-${Math.random().toString(36).substr(2, 9)}`;
      const synth = new TestSynth(synthId, i, count);
      synth.createElements(container);
      this.synths.push(synth);
    }

    this.log(`Created ${count} synth instances`, "info");
  }

  connectAllSynthsToController() {
    this.synths.forEach(synth => {
      this.connectSynthToWebSocket(synth);
    });
  }

  connectSynthToWebSocket(synth) {
    if (!synth.ws || synth.ws.readyState !== WebSocket.OPEN) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      synth.ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

      synth.ws.addEventListener("open", () => {
        this.log(`[${synth.id}] Connected to server`, "info");
        console.log(`[${synth.id}] Registering with server as synth type`);
        synth.updateConnectionStatus(true);
        
        // Register with server as a synth (not a controller)
        synth.ws.send(JSON.stringify({
          type: "register",
          client_id: synth.id,
          client_type: "synth"  // Important! This identifies it as a synth
        }));
        
        // Request controllers
        synth.ws.send(JSON.stringify({
          type: "request-controllers",
          source: synth.id
        }));
      });

      synth.ws.addEventListener("message", async (event) => {
        const message = JSON.parse(event.data);
        await this.handleSynthMessage(synth, message);
      });

      synth.ws.addEventListener("close", () => {
        this.log(`[${synth.id}] Disconnected from server`, "info");
        synth.updateConnectionStatus(false);
      });
    }
  }

  async connectSynthToController(synth, controllerId) {
    console.log(`[${synth.id}] Connecting to controller ${controllerId}`);
    const controller = synth.controllers.get(controllerId);
    if (!controller) {
      Logger.log(`[${synth.id}] Controller ${controllerId} not found in map`, "error");
      return;
    }
    
    // Don't reconnect if already connected
    if (controller.connected && controller.connection && 
        controller.connection.connectionState === "connected") {
      Logger.log(`[${synth.id}] Already connected to controller ${controllerId}`, "connections");
      return;
    }
    
    // Close any existing connection
    if (controller.connection) {
      controller.connection.close();
    }
    
    Logger.log(`[${synth.id}] Initiating connection to controller ${controllerId}`, "connections");
    
    try {
      const pc = new RTCPeerConnection(this.rtcConfig);
      controller.connection = pc;
      console.log(`[${synth.id}] Created RTCPeerConnection`);

      // Create unified data channel
      const dataChannel = pc.createDataChannel("data");
      controller.channel = dataChannel;
      console.log(`[${synth.id}] Created data channel with label: "data"`);
      console.log(`[${synth.id}] Initial channel state:`, dataChannel.readyState);

      dataChannel.addEventListener("open", () => {
        console.log(`[${synth.id}] Data channel OPENED to controller ${controllerId}`);
        console.log(`[${synth.id}] Channel readyState:`, dataChannel.readyState);
        console.log(`[${synth.id}] Channel label:`, dataChannel.label);
        Logger.log(`[${synth.id}] Data channel open to controller ${controllerId}`, "connections");
        controller.connected = true;
        
        // Add to SynthClient's controllers with data channel reference
        synth.synthClient.controllers.set(controllerId, {
          ...controller,
          dataChannel: dataChannel
        });
        
        // Send immediate state update (pong message)
        dataChannel.send(JSON.stringify({
          type: "pong",
          timestamp: Date.now(),
          state: {
            synthId: synth.id,
            ready: synth.synthClient.audioInitialized,
            power: synth.synthClient.synthCore.isPoweredOn
          }
        }));

        // No need to request program - controller will push automatically
        this.log(`[${synth.id}] Connected to controller ${controllerId}`, "info");
      });

      dataChannel.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        console.log(`[${synth.id}] Received data channel message:`, message.type);
        console.log(`[${synth.id}] Full message:`, message);
        console.log(`[${synth.id}] Has synthClient:`, !!synth.synthClient);
        
        // Pass message to SynthClient for handling
        if (synth.synthClient) {
          console.log(`[${synth.id}] Calling synthClient.handleControllerMessage`);
          synth.synthClient.handleControllerMessage(controllerId, message);
        } else {
          console.log(`[${synth.id}] ERROR: No synthClient available!`);
        }
      });

      dataChannel.addEventListener("close", () => {
        Logger.log(`[${synth.id}] Data channel closed to controller ${controllerId}`, "connections");
        controller.connected = false;
        
        // Remove from SynthClient's controllers
        synth.synthClient.controllers.delete(controllerId);
        
        this.log(`[${synth.id}] Disconnected from controller ${controllerId}`, "info");
      });

      // Handle ICE candidates
      pc.addEventListener("icecandidate", (event) => {
        if (event.candidate) {
          synth.ws.send(JSON.stringify({
            type: "ice",
            source: synth.id,
            target: controllerId,
            data: event.candidate
          }));
        }
      });

      // Handle incoming data channels from controller
      pc.addEventListener("datachannel", (event) => {
        console.log(`[${synth.id}] Incoming data channel from controller:`, event.channel.label);
        const incomingChannel = event.channel;
        
        // Replace our outgoing channel with the incoming one
        controller.channel = incomingChannel;
        
        incomingChannel.addEventListener("open", () => {
          console.log(`[${synth.id}] Incoming channel OPENED from controller ${controllerId}`);
        });
        
        incomingChannel.addEventListener("message", (event) => {
          const message = JSON.parse(event.data);
          console.log(`[${synth.id}] Received message on incoming channel:`, message.type);
          console.log(`[${synth.id}] Full message:`, message);
          
          if (synth.synthClient) {
            synth.synthClient.handleControllerMessage(controllerId, message);
          }
        });
        
        incomingChannel.addEventListener("close", () => {
          console.log(`[${synth.id}] Incoming channel closed from controller ${controllerId}`);
        });
      });
      
      // Handle connection state changes
      pc.addEventListener("connectionstatechange", () => {
        Logger.log(`[${synth.id}] Connection state to ${controllerId}: ${pc.connectionState}`, "connections");
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          controller.connected = false;
          this.log(`[${synth.id}] Connection failed to controller ${controllerId}`, "error");
        }
      });

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      synth.ws.send(JSON.stringify({
        type: "offer",
        source: synth.id,
        target: controllerId,
        data: offer
      }));
      
      console.log(`[${synth.id}] Sent offer to controller ${controllerId}`);
      
    } catch (error) {
      Logger.log(`[${synth.id}] Failed to connect to controller ${controllerId}: ${error.message}`, "error");
      controller.connected = false;
      this.log(`[${synth.id}] Failed to connect to controller ${controllerId}: ${error.message}`, "error");
    }
  }

  async handleSynthMessage(synth, message) {
    // Debug logging
    console.log(`[${synth.id}] Received WebSocket message:`, message.type, message);
    Logger.log(`[${synth.id}] Received message: ${message.type}`, "messages");
    
    switch (message.type) {
      case "controllers-list":
        // Received list of active controllers
        console.log(`[${synth.id}] Controllers available:`, message.controllers);
        this.log(`[${synth.id}] Controllers: ${message.controllers.join(", ")}`, "info");
        
        // Connect to each controller
        for (const controllerId of message.controllers) {
          if (!synth.controllers.has(controllerId)) {
            synth.controllers.set(controllerId, {
              id: controllerId,
              connection: null,
              channel: null,
              connected: false,
              iceQueue: []
            });
            this.connectSynthToController(synth, controllerId);
          }
        }
        break;
        
      case "controller-joined":
        // New controller joined
        console.log(`[${synth.id}] New controller joined:`, message.controller_id);
        this.log(`[${synth.id}] Controller ${message.controller_id} joined`, "info");
        
        // Connect to new controller
        if (!synth.controllers.has(message.controller_id)) {
          synth.controllers.set(message.controller_id, {
            id: message.controller_id,
            connection: null,
            channel: null,
            connected: false,
            iceQueue: []
          });
          this.connectSynthToController(synth, message.controller_id);
        }
        break;
        
      case "controller-left":
        // Controller left
        console.log(`[${synth.id}] Controller left:`, message.controller_id);
        this.log(`[${synth.id}] Controller ${message.controller_id} left`, "info");
        
        // Clean up connection
        if (synth.controllers.has(message.controller_id)) {
          const controller = synth.controllers.get(message.controller_id);
          if (controller.connection) {
            controller.connection.close();
          }
          synth.controllers.delete(message.controller_id);
          synth.synthClient.controllers.delete(message.controller_id);
        }
        break;
        
      case "answer":
        // Handle WebRTC answer from controller
        console.log(`[${synth.id}] Received answer from ${message.source}`);
        const controller = synth.controllers.get(message.source);
        if (controller && controller.connection) {
          await controller.connection.setRemoteDescription(message.data);
          
          // Process any queued ICE candidates
          if (controller.iceQueue && controller.iceQueue.length > 0) {
            for (const candidate of controller.iceQueue) {
              await controller.connection.addIceCandidate(candidate);
            }
            controller.iceQueue = [];
          }
        }
        break;
        
      case "ice":
        // Handle ICE candidate from controller
        console.log(`[${synth.id}] Received ICE candidate from ${message.source}`);
        const targetController = synth.controllers.get(message.source);
        if (targetController && targetController.connection) {
          try {
            if (targetController.connection.remoteDescription) {
              await targetController.connection.addIceCandidate(message.data);
            } else {
              // Queue ICE candidate until remote description is set
              targetController.iceQueue.push(message.data);
            }
          } catch (error) {
            console.error(`[${synth.id}] Error adding ICE candidate:`, error);
          }
        }
        break;
        
      default:
        console.log(`[${synth.id}] Unknown message type:`, message.type);
        break;
    }
  }

  calibrateAllSynths() {
    this.synths.forEach(async synth => {
      if (synth.synthClient && synth.synthClient.audioInitialized) {
        await synth.synthClient.startCalibration(0.7);
      }
    });
    
    const calibrateBtn = document.getElementById("calibrate-btn");
    const joinBtn = document.getElementById("join-all-btn");
    if (calibrateBtn) calibrateBtn.style.display = "none";
    if (joinBtn) joinBtn.style.display = "inline-block";
    
    this.log("Started calibration for all synths", "info");
  }

  joinAllSynths() {
    this.synths.forEach(synth => {
      if (synth.synthClient && synth.synthClient.audioInitialized) {
        synth.synthClient.endCalibration();
        synth.synthClient.synthCore.setPower(true);
      }
    });
    
    const joinBtn = document.getElementById("join-all-btn");
    if (joinBtn) joinBtn.style.display = "none";
    
    this.log("All synths joined instrument", "info");
  }

  handleSynthCountChange(e) {
    const newCount = parseInt(e.target.value);
    if (this.isInitialized) {
      this.recreateSynths(newCount);
      this.connectAllSynthsToController();
      if (this.audioInitialized) {
        this.initializeEnsembleAudio();
      }
    }
  }

  handleVolumeChange(e) {
    const volume = parseFloat(e.target.value);
    if (this.masterGain) {
      this.masterGain.gain.value = volume;
    }
    const volumeDisplay = document.getElementById("volume-display");
    if (volumeDisplay) {
      volumeDisplay.textContent = Math.round(volume * 100) + "%";
    }
  }

  log(message, type = "info") {
    const logArea = document.getElementById("log-area");
    if (!logArea) return;
    
    const entry = document.createElement("div");
    entry.className = `log-entry ${type}`;
    entry.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
    logArea.appendChild(entry);
    logArea.scrollTop = logArea.scrollHeight;

    // Keep only last 100 entries
    while (logArea.children.length > 100) {
      logArea.removeChild(logArea.firstChild);
    }
    
    // Also use Logger module
    Logger.log(message, type === "error" ? "error" : "lifecycle");
  }

  addUtilityFunctions() {
    // Add utility function to window
    window.clearAllSynthBanks = () => {
      this.synths.forEach(synth => {
        const storageKey = `synth-banks-${synth.id}`;
        localStorage.removeItem(storageKey);
        synth.synthClient.synthBanks.clear();
        console.log(`Cleared localStorage for ${synth.id}`);
      });
      console.log('All synth banks cleared from localStorage');
    };
  }
}

// Don't create instance here - ensemble.html will create and initialize it

// Export the class for use in ensemble.html
export { EnsembleApp };