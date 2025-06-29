// ensemble-app.js - Multi-synth test ensemble application
import { SynthCore } from '../../../src/synth/synth-core.js';
import { Logger } from '../modules/core/Logger.js';
import { SystemConfig } from '../config/system.config.js';

// Wrapper class for SynthCore in ensemble
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
    this.isVisualizerRunning = false;

    // State
    this.currentNote = null;
    this.currentExpression = null;
    this.isActive = false;
    this.currentProgram = null;
    this.audioInitialized = false;
    this.pendingProgram = null;

    // Banking
    this.synthBanks = new Map();

    // WebRTC connections
    this.ws = null;
    this.controllers = new Map();

    // Calculate pan position
    this.panPosition = totalSynths === 1 ? 0 : (index / (totalSynths - 1)) * 2 - 1;

    // Create SynthCore instance
    this.synthCore = new SynthCore(id, { enableLogging: true });
  }

  async initialize(audioCtx, destination) {
    // Create additional nodes for ensemble-specific features
    this.panner = audioCtx.createStereoPanner();
    this.panner.pan.value = this.panPosition;

    this.analyser = audioCtx.createAnalyser();
    this.analyser.fftSize = 256;

    // Initialize SynthCore
    await this.synthCore.initialize(audioCtx, this.analyser);

    // Connect SynthCore output through our panner to destination
    this.analyser.connect(this.panner);
    this.panner.connect(destination);

    // Ensure we have the analyser reference
    this.analyser = this.synthCore.analyserNode || this.analyser;

    this.audioInitialized = true;
    Logger.log(`[${this.id}] SynthCore initialized with panning`, "lifecycle");
    
    // Start visualizer if we have a canvas
    if (this.canvas) {
      this.startVisualizer();
    }
    
    // Apply any pending program or request one
    if (this.pendingProgram) {
      Logger.log(`[${this.id}] Applying pending program after initialization`, "lifecycle");
      this.synthCore.applyProgram(this.pendingProgram.program, this.pendingProgram.transition);
      this.pendingProgram = null;
    } else {
      this.requestCurrentProgram();
    }
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
    this.controllers.forEach((controller) => {
      if (controller.channel && controller.channel.readyState === "open") {
        controller.channel.send(JSON.stringify({
          type: "command",
          data: { type: "request-program" },
          timestamp: Date.now()
        }));
      }
    });
  }

  startVisualizer() {
    this.isVisualizerRunning = true;
    this.drawVisualizer();
  }

  drawVisualizer() {
    if (!this.isVisualizerRunning) return;
    requestAnimationFrame(() => this.drawVisualizer());

    if (!this.ctx || !this.analyser) return;

    // Get time domain data for waveform
    const bufferLength = this.analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);
    this.analyser.getFloatTimeDomainData(dataArray);
    
    // Clear canvas
    this.ctx.fillStyle = "rgba(0, 0, 0, 1)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Set up drawing style
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = "#ffffff";
    this.ctx.lineCap = "round";
    
    // Begin path for waveform
    this.ctx.beginPath();
    
    // Draw centered waveform
    const centerY = this.canvas.height / 2;
    const sliceWidth = this.canvas.width / bufferLength;
    let x = 0;
    
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i];
      const y = centerY + v * centerY * 0.8;
      
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
      
      x += sliceWidth;
    }
    
    this.ctx.stroke();
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
    
    // Handle window resize
    window.addEventListener('resize', () => {
      this.synths.forEach(synth => {
        if (synth.resizeCanvas) {
          synth.resizeCanvas();
        }
      });
    });
  }

  async handleStartEnsemble() {
    const button = document.getElementById("start-ensemble");
    const synthCount = parseInt(document.getElementById("synth-count-setup").value);
    
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
      
      // Switch phases
      document.getElementById("setup-phase").style.display = "none";
      document.getElementById("running-phase").style.display = "block";
      
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
      document.getElementById("calibrate-btn").disabled = false;
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
        synth.updateConnectionStatus(true);
        
        // Register with server
        synth.ws.send(JSON.stringify({
          type: "register",
          client_id: synth.id
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

  async handleSynthMessage(synth, message) {
    // Handle WebSocket messages for synth
    // This would include controller discovery, WebRTC setup, etc.
    // Simplified for now
    Logger.log(`[${synth.id}] Received message: ${message.type}`, "messages");
  }

  calibrateAllSynths() {
    this.synths.forEach(synth => {
      if (synth.synthCore) {
        synth.synthCore.startCalibrationNoise(0.7);
      }
    });
    
    document.getElementById("calibrate-btn").style.display = "none";
    document.getElementById("join-all-btn").style.display = "inline-block";
    
    this.log("Started calibration for all synths", "info");
  }

  joinAllSynths() {
    this.synths.forEach(synth => {
      if (synth.synthCore) {
        synth.synthCore.stopCalibrationNoise();
        synth.synthCore.setPower(true);
      }
    });
    
    document.getElementById("join-all-btn").style.display = "none";
    
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
    document.getElementById("volume-display").textContent = Math.round(volume * 100) + "%";
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
        synth.synthBanks.clear();
        if (synth.synthCore) {
          synth.synthCore.synthBanks.clear();
        }
        console.log(`Cleared localStorage for ${synth.id}`);
      });
      console.log('All synth banks cleared from localStorage');
    };
  }
}

// Initialize on load
const ensembleApp = new EnsembleApp();

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ensembleApp.init());
} else {
  ensembleApp.init();
}

// Export for debugging
window.ensembleApp = ensembleApp;