/**
 * SynthClient - Unified synth client for all contexts
 * Replaces duplicated synth logic between synth-app.js and ensemble-app.js
 */

import { SynthCore } from '../../../../src/synth/synth-core.js';
import { Logger } from '../core/Logger.js';
import { SystemConfig } from '../../config/system.config.js';
import { MessageTypes, isMessageType } from '../../protocol/MessageProtocol.js';

export class SynthClient {
  constructor(synthId, options = {}) {
    this.synthId = synthId;
    this.options = {
      enableLogging: true,
      enableVisualizer: true,
      audioDestination: null,  // For custom routing (ensemble)
      panPosition: 0,         // For stereo positioning in ensemble
      ...options
    };
    
    // Core components
    this.synthCore = new SynthCore(synthId, {
      enableLogging: this.options.enableLogging
    });
    
    // State
    this.audioContext = null;
    this.isCalibrating = false;
    this.storedProgram = null;
    this.storedPower = false;
    this.audioInitialized = false;
    this.pendingProgram = null;
    
    // Connections
    this.controllers = new Map();
    this.ws = null;
    
    // Audio nodes (for ensemble routing)
    this.panner = null;
    this.analyser = null;
    
    // UI elements (optional)
    this.visualizerCanvas = null;
    this.statusElement = null;
    this.isVisualizerRunning = false;
    
    // Banking
    this.synthBanks = new Map();
    
    Logger.log(`SynthClient ${synthId} created`, 'synth');
  }
  
  /**
   * Initialize audio system
   * @param {AudioContext} audioContext - Web Audio context
   * @param {AudioNode} destination - Audio destination (optional, defaults to context destination)
   */
  async initializeAudio(audioContext, destination = null) {
    this.audioContext = audioContext;
    const outputDestination = destination || audioContext.destination;
    
    // Create audio nodes for ensemble support
    if (this.options.panPosition !== undefined && this.options.panPosition !== 0) {
      this.panner = audioContext.createStereoPanner();
      this.panner.pan.value = this.options.panPosition;
    }
    
    // Create analyser for visualizer
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    
    // Initialize SynthCore with analyser
    await this.synthCore.initialize(audioContext, this.analyser);
    
    // Connect audio routing
    if (this.panner) {
      this.analyser.connect(this.panner);
      this.panner.connect(outputDestination);
    } else {
      this.analyser.connect(outputDestination);
    }
    
    // Ensure we have the analyser reference from SynthCore
    this.analyser = this.synthCore.analyserNode || this.analyser;
    
    this.audioInitialized = true;
    Logger.log(`SynthClient ${this.synthId} audio initialized with panning: ${this.options.panPosition}`, 'synth');
    
    // Start visualizer if enabled and canvas is set
    if (this.options.enableVisualizer && this.visualizerCanvas) {
      this.startVisualizer();
    }
    
    // Apply any pending program
    if (this.pendingProgram) {
      Logger.log(`[${this.synthId}] Applying pending program after initialization`, "lifecycle");
      this.synthCore.applyProgram(this.pendingProgram.program, this.pendingProgram.transition);
      this.pendingProgram = null;
    }
  }
  
  /**
   * Handle incoming program message from controller
   * @param {Object} programMessage - Complete program message conforming to protocol
   */
  handleProgram(programMessage) {
    Logger.log(`[${this.synthId}] Received program update`, 'synth');
    
    // Handle protocol-compliant messages
    if (isMessageType(programMessage, MessageTypes.PROGRAM)) {
      // Protocol format: { type, program, power, transition?, timestamp }
      const { program, power, transition } = programMessage;
      
      // Store the program and power state
      this.storedProgram = program;
      if (power !== undefined) {
        this.storedPower = power;
      }
      
      // Store transition if provided
      this.storedTransition = transition || null;
    } else {
      // Legacy format handling for backward compatibility
      Logger.log(`[${this.synthId}] Received legacy program format`, 'warn');
      const program = programMessage.program || programMessage;
      const power = programMessage.power;
      const transition = programMessage.transition;
      
      this.storedProgram = program;
      if (power !== undefined) {
        this.storedPower = power;
      }
      this.storedTransition = transition || null;
    }
    
    if (!this.audioInitialized) {
      // Store for later application
      this.pendingProgram = { 
        program: this.storedProgram, 
        transition: this.storedTransition 
      };
      Logger.log(`[${this.synthId}] Storing program for later application (audio not initialized)`, "lifecycle");
      return;
    }
    
    // Apply immediately if ready, otherwise wait
    if (!this.isCalibrating && this.synthCore.isInitialized) {
      this.applyStoredProgram(this.storedTransition);
    } else {
      Logger.log(`[${this.synthId}] Storing program for later application (${
        !this.synthCore.isInitialized ? 'not initialized' : 'calibrating'
      })`, 'synth');
    }
  }
  
  /**
   * Apply stored program to SynthCore
   * @param {Object} transition - Transition data (optional)
   */
  applyStoredProgram(transition = null) {
    if (!this.storedProgram) return;
    
    if (this.storedPower) {
      this.synthCore.applyProgram(this.storedProgram, transition);
      this.synthCore.setPower(true);
    } else {
      this.synthCore.setPower(false);
    }
  }
  
  /**
   * Start calibration mode
   * @param {number} level - Calibration noise level (0-1)
   */
  async startCalibration(level = 0.7) {
    if (!this.synthCore.isInitialized) {
      throw new Error('Audio must be initialized before calibration');
    }
    
    this.isCalibrating = true;
    this.synthCore.startCalibrationNoise(level);
    Logger.log(`[${this.synthId}] Calibration started`, "lifecycle");
  }
  
  /**
   * End calibration mode
   */
  endCalibration() {
    if (!this.isCalibrating) return;
    
    this.synthCore.stopCalibrationNoise();
    this.isCalibrating = false;
    Logger.log(`[${this.synthId}] Calibration ended`, "lifecycle");
    
    // Apply stored program if we have one
    if (this.storedProgram) {
      Logger.log(`[${this.synthId}] Applying stored program after calibration`, 'synth');
      this.applyStoredProgram();
    }
  }
  
  /**
   * Set power state
   * @param {boolean} on - Power state
   */
  setPower(on) {
    this.storedPower = on;
    if (!this.isCalibrating && this.synthCore.isInitialized) {
      this.synthCore.setPower(on);
    }
  }
  
  /**
   * Set visualizer canvas
   * @param {HTMLCanvasElement} canvas - Canvas element
   */
  setVisualizerCanvas(canvas) {
    this.visualizerCanvas = canvas;
    if (this.options.enableVisualizer && this.synthCore.analyserNode && canvas) {
      this.startVisualizer();
    }
  }
  
  /**
   * Start waveform visualizer
   */
  startVisualizer() {
    if (!this.visualizerCanvas || !this.analyser || this.isVisualizerRunning) return;
    
    this.isVisualizerRunning = true;
    const ctx = this.visualizerCanvas.getContext('2d');
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      if (!this.isVisualizerRunning || !this.visualizerCanvas) return;
      
      requestAnimationFrame(draw);
      
      this.analyser.getByteTimeDomainData(dataArray);
      
      // Clear canvas
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, this.visualizerCanvas.width, this.visualizerCanvas.height);
      
      // Draw waveform
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.synthCore.isPoweredOn ? '#60a5fa' : '#333';
      ctx.beginPath();
      
      const sliceWidth = this.visualizerCanvas.width / bufferLength;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * this.visualizerCanvas.height * 0.4) / 2;
        
        if (i === 0) {
          ctx.moveTo(x, this.visualizerCanvas.height / 2 + y);
        } else {
          ctx.lineTo(x, this.visualizerCanvas.height / 2 + y);
        }
        
        x += sliceWidth;
      }
      
      ctx.stroke();
    };
    
    draw();
    Logger.log(`[${this.synthId}] Visualizer started`, "ui");
  }
  
  /**
   * Stop visualizer
   */
  stopVisualizer() {
    this.isVisualizerRunning = false;
    Logger.log(`[${this.synthId}] Visualizer stopped`, "ui");
  }
  
  /**
   * DEPRECATED: Program requests removed - controllers now push programs automatically
   * This method is kept for compatibility but does nothing
   */
  requestCurrentProgram() {
    Logger.log(`[${this.synthId}] Program request ignored - controllers push programs automatically`, "info");
    // Do nothing - programs are pushed automatically by controllers
  }
  
  /**
   * Save program to bank
   * @param {number} bankId - Bank number
   * @param {Object} program - Program to save
   */
  saveToBank(bankId, program = null) {
    const programToSave = program || this.storedProgram;
    if (programToSave) {
      this.synthBanks.set(bankId, { ...programToSave });
      Logger.log(`[${this.synthId}] Saved program to bank ${bankId}`, "banking");
    }
  }
  
  /**
   * Load program from bank
   * @param {number} bankId - Bank number
   */
  loadFromBank(bankId) {
    const program = this.synthBanks.get(bankId);
    if (program) {
      this.handleProgram(program, true);
      Logger.log(`[${this.synthId}] Loaded program from bank ${bankId}`, "banking");
      return true;
    }
    return false;
  }
  
  /**
   * Get current state
   */
  getState() {
    return {
      id: this.synthId,
      audioInitialized: this.audioInitialized,
      isCalibrating: this.isCalibrating,
      isPoweredOn: this.synthCore.isPoweredOn,
      isActive: this.storedPower && this.storedProgram,
      panPosition: this.options.panPosition,
      controllersConnected: this.controllers.size
    };
  }
  
  /**
   * Cleanup and dispose
   */
  dispose() {
    this.stopVisualizer();
    
    if (this.synthCore) {
      this.synthCore.setPower(false);
    }
    
    // Disconnect audio nodes
    if (this.panner) {
      this.panner.disconnect();
    }
    if (this.analyser && this.analyser !== this.synthCore.analyserNode) {
      this.analyser.disconnect();
    }
    
    // Clear references
    this.visualizerCanvas = null;
    this.controllers.clear();
    this.synthBanks.clear();
    this.audioContext = null;
    
    Logger.log(`SynthClient ${this.synthId} disposed`, 'synth');
  }
}