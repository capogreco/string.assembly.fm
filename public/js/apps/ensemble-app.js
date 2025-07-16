// ensemble-app.js - Multi-synth test ensemble application
import { SynthClient } from "../modules/synth/SynthClient.js";
import { Logger } from "../modules/core/Logger.js";
import { SystemConfig } from "../config/system.config.js";

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
    this.hasInitialized = false; // Track if audio has been initialized

    // WebRTC connections
    this.ws = null;
    this.controllers = new Map();

    // Calculate pan position
    this.panPosition =
      totalSynths === 1 ? 0 : (index / (totalSynths - 1)) * 2 - 1;

    // Create SynthClient instance with ensemble options
    this.synthClient = new SynthClient(id, {
      enableLogging: true,
      enableVisualizer: true,
      panPosition: this.panPosition,
    });
  }

  async initialize(audioCtx, destination) {
    // Initialize SynthClient with ensemble destination
    await this.synthClient.initializeAudio(audioCtx, destination);

    // Set canvas for visualizer if available
    if (this.canvas) {
      this.synthClient.setVisualizerCanvas(this.canvas);
    }

    // Mark as initialized - ensemble synths are ready immediately
    this.hasInitialized = true;

    // Set power on by default for ensemble synths
    this.synthClient.setPower(true);

    // SynthClient initialized

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
    Logger.log(
      `[${this.id}] requestCurrentProgram called but deprecated - using push model`,
      "lifecycle",
    );
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
    // EnsembleApp initializing

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
    document
      .getElementById("start-ensemble")
      ?.addEventListener("click", () => this.handleStartEnsemble());
    document
      .getElementById("synth-count")
      ?.addEventListener("change", (e) => this.handleSynthCountChange(e));
    document
      .getElementById("master-volume")
      ?.addEventListener("input", (e) => this.handleVolumeChange(e));
    document
      .getElementById("calibrate-btn")
      ?.addEventListener("click", () => this.calibrateAllSynths());
    document
      .getElementById("join-all-btn")
      ?.addEventListener("click", () => this.joinAllSynths());

    // Handle window resize (SynthClient handles canvas resizing internally)
    window.addEventListener("resize", () => {
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

      console.log(`Ensemble started with ${synthCount} synths`);
    } catch (error) {
      button.disabled = false;
      button.textContent = "Start Ensemble";
      this.log(`Failed to start ensemble: ${error.message}`, "error");
    }
  }

  async initializeAudioSystem() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();

      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
        // Audio context resumed
      }

      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = SystemConfig.audio.defaults.masterVolume;
      this.masterGain.connect(this.audioContext.destination);

      // Loading audio worklets...
      const { basePath, modules } = SystemConfig.audio.worklets;
      for (const module of modules) {
        await this.audioContext.audioWorklet.addModule(basePath + module);
      }
      // Audio worklets loaded successfully
    }
  }

  async initializeEnsembleAudio() {
    if (this.audioInitialized) return;

    try {
      // Initialize audio system
      await this.initializeAudioSystem();

      // Initialize audio for all synths
      const initPromises = this.synths.map((synth) =>
        synth.initialize(this.audioContext, this.masterGain),
      );

      await Promise.all(initPromises);

      this.audioInitialized = true;
      // All synths audio initialized

      // Broadcast state update to all connected controllers for each synth
      this.synths.forEach((synth) => {
        this.broadcastSynthState(synth);
      });

      // Update UI
      const calibrateBtn = document.getElementById("calibrate-btn");
      if (calibrateBtn) calibrateBtn.disabled = false;
    } catch (error) {
      this.log(`Audio initialization error: ${error.message}`, "error");
      throw error;
    }
  }

  // Broadcast state update for a synth to all connected controllers
  broadcastSynthState(synth) {
    const stateMessage = {
      type: "state_update",
      state: {
        synthId: synth.id,
        ready: synth.synthClient.audioInitialized,
        power: synth.synthClient.synthCore.isPoweredOn,
        hasProgram: synth.synthClient.getState().isActive,
        // Required fields for controller UI indicators
        audio_enabled: synth.hasInitialized,
        joined: synth.hasInitialized,
      },
    };

    synth.controllers.forEach((controller, controllerId) => {
      if (
        controller.connected &&
        controller.dataChannel &&
        controller.dataChannel.readyState === "open"
      ) {
        controller.dataChannel.send(JSON.stringify(stateMessage));
        // State update sent
      }
    });
  }

  async recreateSynths(count) {
    // Clean up existing synths
    this.synths.forEach((synth) => {
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

    // Created synth instances
  }

  connectAllSynthsToController() {
    this.synths.forEach((synth) => {
      this.connectSynthToWebSocket(synth);
    });
  }

  connectSynthToWebSocket(synth) {
    if (!synth.ws || synth.ws.readyState !== WebSocket.OPEN) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      synth.ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

      synth.ws.addEventListener("open", () => {
        // Connected to server
        // Registering with server
        synth.updateConnectionStatus(true);

        // Register with server as a synth (not a controller)
        synth.ws.send(
          JSON.stringify({
            type: "register",
            client_id: synth.id,
            client_type: "synth", // Important! This identifies it as a synth
          }),
        );

        // Request controllers
        synth.ws.send(
          JSON.stringify({
            type: "request-controllers",
            source: synth.id,
          }),
        );
      });

      synth.ws.addEventListener("message", async (event) => {
        const message = JSON.parse(event.data);
        await this.handleSynthMessage(synth, message);
      });

      synth.ws.addEventListener("close", () => {
        // Disconnected from server
        synth.updateConnectionStatus(false);
      });
    }
  }

  async connectSynthToController(synth, controllerId) {
    // Connecting to controller
    const controller = synth.controllers.get(controllerId);
    if (!controller) {
      // Controller not found in map
      return;
    }

    // Don't reconnect if already connected
    if (
      controller.connected &&
      controller.connection &&
      controller.connection.connectionState === "connected"
    ) {
      // Already connected to controller
      return;
    }

    // Close any existing connection
    if (controller.connection) {
      controller.connection.close();
    }

    // Initiating connection to controller

    try {
      const pc = new RTCPeerConnection({ 
        iceServers: this.rtcConfig.iceServers 
      });
      controller.connection = pc;
      // Created RTCPeerConnection

      // Create unified data channel
      const dataChannel = pc.createDataChannel("data");
      controller.channel = dataChannel;
      // Created data channel
      // Initial channel state

      dataChannel.addEventListener("open", () => {
        // Data channel opened
        // Channel ready
        // Channel label set
        // Data channel connected
        controller.connected = true;

        // Add to SynthClient's controllers with data channel reference
        synth.synthClient.controllers.set(controllerId, {
          ...controller,
          dataChannel: dataChannel,
        });

        // Send immediate state update (pong message)
        dataChannel.send(
          JSON.stringify({
            type: "pong",
            timestamp: Date.now(),
            state: {
              synthId: synth.id,
              ready: synth.synthClient.audioInitialized,
              power: synth.synthClient.synthCore.isPoweredOn,
              // Required fields for controller UI indicators
              audio_enabled: synth.hasInitialized, // Ensemble synths have audio enabled after initialization
              joined: synth.hasInitialized, // Ensemble synths auto-join when initialized (no calibration phase)
            },
          }),
        );

        // No need to request program - controller will push automatically
        this.log(
          `[${synth.id}] Connected to controller ${controllerId}`,
          "info",
        );
      });

      dataChannel.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        Logger.log(
          `[${synth.id}] Received data channel message:`,
          message.type,
          "messages",
        );
        Logger.log(`[${synth.id}] Full message:`, message, "messages");
        Logger.log(
          `[${synth.id}] Has synthClient:`,
          !!synth.synthClient,
          "parts",
        );

        // Handle ping messages directly
        if (message.type === "ping") {
          const pongMessage = {
            type: "pong",
            timestamp: message.timestamp,
            state: {
              synthId: synth.id,
              ready: synth.synthClient.audioInitialized,
              power: synth.synthClient.synthCore.isPoweredOn,
              hasProgram: synth.synthClient.getState().isActive,
              // Required fields for controller UI indicators
              audio_enabled: synth.hasInitialized, // Ensemble synths have audio enabled after initialization
              joined: synth.hasInitialized, // Ensemble synths auto-join when initialized (no calibration phase)
            },
          };
          dataChannel.send(JSON.stringify(pongMessage));
          // Sent pong response
        } else if (synth.synthClient) {
          // Pass other messages to SynthClient for handling
          synth.synthClient.handleControllerMessage(controllerId, message);
        } else {
          Logger.log(`[${synth.id}] ERROR: No synthClient available!`, "error");
        }
      });

      dataChannel.addEventListener("close", () => {
        // Data channel closed
        controller.connected = false;

        // Remove from SynthClient's controllers
        synth.synthClient.controllers.delete(controllerId);

        // Disconnected from controller
      });

      // Handle ICE candidates
      pc.addEventListener("icecandidate", (event) => {
        if (event.candidate) {
          synth.ws.send(
            JSON.stringify({
              type: "ice",
              source: synth.id,
              target: controllerId,
              data: event.candidate,
            }),
          );
        }
      });

      // Handle incoming data channels from controller
      pc.addEventListener("datachannel", (event) => {
        // Incoming data channel from controller
        const incomingChannel = event.channel;

        // Replace our outgoing channel with the incoming one
        controller.channel = incomingChannel;

        incomingChannel.addEventListener("open", () => {
          // Incoming channel opened
        });

        incomingChannel.addEventListener("message", (event) => {
          const message = JSON.parse(event.data);
          // Received message on incoming channel
          // Message details

          // Handle ping messages directly
          if (message.type === "ping") {
            const pongMessage = {
              type: "pong",
              timestamp: message.timestamp,
              state: {
                synthId: synth.id,
                ready: synth.synthClient.audioInitialized,
                power: synth.synthClient.synthCore.isPoweredOn,
                hasProgram: synth.synthClient.getState().isActive,
                // Required fields for controller UI indicators
                audio_enabled: synth.hasInitialized, // Ensemble synths have audio enabled after initialization
                joined: synth.hasInitialized, // Ensemble synths auto-join when initialized (no calibration phase)
              },
            };
            incomingChannel.send(JSON.stringify(pongMessage));
            // Sent pong response on incoming channel
          } else if (synth.synthClient) {
            synth.synthClient.handleControllerMessage(controllerId, message);
          }
        });

        incomingChannel.addEventListener("close", () => {
          // Incoming channel closed
        });
      });

      // Handle connection state changes
      pc.addEventListener("connectionstatechange", () => {
        // Connection state changed
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected"
        ) {
          controller.connected = false;
          // Connection failed
        }
      });

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      synth.ws.send(
        JSON.stringify({
          type: "offer",
          source: synth.id,
          target: controllerId,
          data: offer,
        }),
      );

      // Sent offer to controller
    } catch (error) {
      Logger.log(`[${synth.id}] Failed to connect: ${error.message}`, "error");
      controller.connected = false;
      // Failed to connect
    }
  }

  async handleSynthMessage(synth, message) {
    // Debug logging
    // Received WebSocket message
    // Message type: message.type

    switch (message.type) {
      case "controllers-list":
        // Received list of active controllers
        // Controllers available
        // Found controllers

        // Connect to each controller
        for (const controllerId of message.controllers) {
          if (!synth.controllers.has(controllerId)) {
            synth.controllers.set(controllerId, {
              id: controllerId,
              connection: null,
              channel: null,
              connected: false,
              iceQueue: [],
            });
            this.connectSynthToController(synth, controllerId);
          }
        }
        break;

      case "controller-joined":
        // New controller joined
        // New controller joined
        // Controller joined notification

        // Connect to new controller
        if (!synth.controllers.has(message.controller_id)) {
          synth.controllers.set(message.controller_id, {
            id: message.controller_id,
            connection: null,
            channel: null,
            connected: false,
            iceQueue: [],
          });
          this.connectSynthToController(synth, message.controller_id);
        }
        break;

      case "controller-left":
        // Controller left
        // Controller left
        // Controller left notification

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
        // Received answer from controller
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
        // Received ICE candidate
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
            Logger.log(`[${synth.id}] Error adding ICE candidate: ${error.message}`, "error");
          }
        }
        break;

      default:
        // Unknown message type
        break;
    }
  }

  calibrateAllSynths() {
    this.synths.forEach(async (synth) => {
      if (synth.synthClient && synth.synthClient.audioInitialized) {
        await synth.synthClient.startCalibration(0.7);
      }
    });

    const calibrateBtn = document.getElementById("calibrate-btn");
    const joinBtn = document.getElementById("join-all-btn");
    if (calibrateBtn) calibrateBtn.style.display = "none";
    if (joinBtn) joinBtn.style.display = "inline-block";

    // Started calibration for all synths
  }

  joinAllSynths() {
    this.synths.forEach((synth) => {
      if (synth.synthClient && synth.synthClient.audioInitialized) {
        synth.synthClient.endCalibration();
        synth.synthClient.synthCore.setPower(true);
      }
    });

    const joinBtn = document.getElementById("join-all-btn");
    if (joinBtn) joinBtn.style.display = "none";

    // All synths joined instrument
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

    // Log entry added
  }

  addUtilityFunctions() {
    // Add utility function to window
    window.clearAllSynthBanks = () => {
      this.synths.forEach((synth) => {
        const storageKey = `synth-banks-${synth.id}`;
        localStorage.removeItem(storageKey);
        synth.synthClient.synthBanks.clear();
        // Cleared localStorage
      });
      console.log("All synth banks cleared from localStorage");
    };
  }
}

// Don't create instance here - ensemble.html will create and initialize it

// Export the class for use in ensemble.html
export { EnsembleApp };
