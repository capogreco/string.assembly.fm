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
    this.hasReceivedProgram = false; // Track if we've ever received a valid program
    
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
      // Use applyStoredProgram to ensure assignment checks
      this.applyStoredProgram(this.pendingProgram.transition);
      this.pendingProgram = null;
    } else if (!this.hasReceivedProgram) {
      // No program received yet - ensure silence
      Logger.log(`[${this.synthId}] No program received yet - ensuring silence`, "lifecycle");
      this.synthCore.setPower(false);
    }
  }
  
  /**
   * Handle incoming message from controller
   * @param {string} controllerId - Controller ID
   * @param {Object} message - Message object
   */
  handleControllerMessage(controllerId, message) {
    Logger.log(`[${this.synthId}] Received message from ${controllerId}: ${message.type}`, 'synth');
    
    // Route based on message type
    switch (message.type) {
      case MessageTypes.PROGRAM:
        this.handleProgram(message);
        break;
        
      case MessageTypes.COMMAND:
        if (message.name === 'power') {
          // Update stored power state
          this.storedPower = message.value;
          
          // If we have a program and are turning power on, apply it
          if (message.value && this.hasReceivedProgram && this.storedProgram) {
            Logger.log(`[${this.synthId}] Power turned on - applying stored program`, 'synth');
            this.applyStoredProgram();
          } else if (!message.value) {
            // Power off - silence the synth
            Logger.log(`[${this.synthId}] Power turned off`, 'synth');
            this.synthCore.setPower(false);
          }
        }
        // Add other command handlers as needed
        break;
        
      case MessageTypes.SAVE_TO_BANK:
        this.saveToBank(message.bankNumber);
        break;
        
      case MessageTypes.LOAD_FROM_BANK:
        this.loadFromBank(message.bankNumber);
        break;
        
      default:
        Logger.log(`[${this.synthId}] Unknown message type: ${message.type}`, 'warn');
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
    
    // Mark that we've received a program
    this.hasReceivedProgram = true;
    
    // Debug log the program structure
    Logger.log(`[${this.synthId}] Stored program structure:`, 'synth');
    Logger.log(`- Has parts: ${!!this.storedProgram.parts}`, 'synth');
    if (this.storedProgram.parts) {
      Logger.log(`- Parts type: ${typeof this.storedProgram.parts}`, 'synth');
      Logger.log(`- Parts keys: ${Object.keys(this.storedProgram.parts).join(', ')}`, 'synth');
      Logger.log(`- Has assignment for ${this.synthId}: ${!!this.storedProgram.parts[this.synthId]}`, 'synth');
    }
    
    // Check if this program has a valid part assignment for this synth
    const hasAssignment = this.hasValidAssignment(this.storedProgram);
    Logger.log(`[${this.synthId}] Program has assignment: ${hasAssignment}`, 'synth');
    
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
    console.log(`[${this.synthId}] applyStoredProgram called with transition:`, transition);
    
    if (!this.storedProgram) {
      Logger.log(`[${this.synthId}] No stored program to apply`, 'synth');
      return;
    }
    
    console.log(`[${this.synthId}] Stored program keys:`, Object.keys(this.storedProgram));
    console.log(`[${this.synthId}] storedPower:`, this.storedPower);
    
    // Check if we have a valid assignment
    const hasAssignment = this.hasValidAssignment(this.storedProgram);
    console.log(`[${this.synthId}] hasAssignment result:`, hasAssignment);
    
    if (!hasAssignment) {
      Logger.log(`[${this.synthId}] No assignment for this synth - staying silent`, 'synth');
      this.synthCore.setPower(false);
      return;
    }
    
    // Get the assignment and apply frequency
    const assignment = this.storedProgram.parts[this.synthId];
    Logger.log(`[${this.synthId}] Applying assignment: freq=${assignment.frequency}Hz, expr=${assignment.expression?.type || 'none'}`, 'synth');
    
    // Add fundamental frequency to program
    const programToApply = {
      ...this.storedProgram,
      fundamentalFrequency: assignment.frequency
    };
    
    console.log(`[${this.synthId}] Program to apply has fundamentalFrequency:`, programToApply.fundamentalFrequency);
    
    // Apply expression parameters if present
    if (assignment.expression && assignment.expression.type !== 'none') {
      this.applyExpressionToProgram(programToApply, assignment.expression);
    }
    
    // Check other silence conditions
    if (!this.shouldPlaySound(programToApply)) {
      Logger.log(`[${this.synthId}] Program conditions require silence`, 'synth');
      this.synthCore.setPower(false);
      return;
    }
    
    console.log(`[${this.synthId}] All checks passed, applying program to synthCore`);
    console.log(`[${this.synthId}] isPoweredOn before:`, this.synthCore.isPoweredOn);
    
    // Apply the program normally
    if (this.storedPower) {
      this.synthCore.applyProgram(programToApply, transition);
      this.synthCore.setPower(true);
      console.log(`[${this.synthId}] Called applyProgram and setPower(true)`);
    } else {
      this.synthCore.setPower(false);
      console.log(`[${this.synthId}] storedPower is false, called setPower(false)`);
    }
    
    console.log(`[${this.synthId}] isPoweredOn after:`, this.synthCore.isPoweredOn);
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
    
    // Check if we should be playing sound after calibration
    if (this.hasReceivedProgram && this.storedProgram) {
      Logger.log(`[${this.synthId}] Checking program after calibration`, 'synth');
      this.applyStoredProgram();
    } else {
      Logger.log(`[${this.synthId}] No program received yet - staying silent after calibration`, 'synth');
      this.synthCore.setPower(false);
    }
  }
  
  /**
   * Apply expression parameters to program
   * @param {Object} program - Program to modify
   * @param {Object} expression - Expression configuration
   */
  applyExpressionToProgram(program, expression) {
    // Reset all expression flags
    program.vibratoEnabled = 0;
    program.tremoloEnabled = 0;
    program.trillEnabled = 0;
    
    if (!expression || expression.type === 'none') {
      return;
    }
    
    switch (expression.type) {
      case 'vibrato':
        program.vibratoEnabled = 1;
        program.vibratoDepth = expression.depth || 0.01;
        // Note: Harmonic ratios would be applied by PartManager
        break;
        
      case 'tremolo':
        program.tremoloEnabled = 1;
        program.tremoloDepth = expression.depth || 0.3;
        program.tremoloArticulation = expression.articulation || 0.8;
        break;
        
      case 'trill':
        program.trillEnabled = 1;
        program.trillInterval = expression.interval || 2;
        program.trillArticulation = expression.articulation || 0.7;
        break;
    }
  }
  
  /**
   * Check if this synth has a valid part assignment in the program
   * @param {Object} program - Program to check
   * @returns {boolean} True if this synth has an assignment
   */
  hasValidAssignment(program) {
    console.log(`[${this.synthId}] Checking assignment:`, {
      hasParts: !!program.parts,
      partsType: typeof program.parts,
      partsKeys: program.parts ? Object.keys(program.parts) : 'no parts',
      myId: this.synthId,
      hasMyAssignment: program.parts ? !!program.parts[this.synthId] : false,
      myAssignment: program.parts ? program.parts[this.synthId] : 'none'
    });
    
    if (!program) return false;
    
    // Check if program has part assignments
    if (!program.parts || !program.parts[this.synthId]) {
      return false;
    }
    
    const assignment = program.parts[this.synthId];
    console.log(`[${this.synthId}] Assignment details:`, assignment);
    
    // Validate assignment has required fields
    return assignment && 
           typeof assignment.frequency === 'number' && 
           assignment.frequency > 0;
  }
  
  /**
   * Check if program conditions allow sound to be played
   * @param {Object} program - Program to check
   * @returns {boolean} True if sound should be played
   */
  shouldPlaySound(program) {
    console.log(`[${this.synthId}] shouldPlaySound check:`, {
      hasProgram: !!program,
      bowPressure: program?.bowPressure,
      bowForce: program?.bowForce,
      hasChord: !!program?.chord,
      chordFrequencies: program?.chord?.frequencies,
      chordLength: program?.chord?.frequencies?.length
    });
    
    if (!program) return false;
    
    // Check bow pressure - if zero, no sound
    if (program.bowPressure === 0) {
      Logger.log(`[${this.synthId}] Bow pressure is zero - no sound`, 'synth');
      return false;
    }
    
    // Also check bowForce (might be the actual parameter name)
    if (program.bowForce === 0) {
      Logger.log(`[${this.synthId}] Bow force is zero - no sound`, 'synth');
      return false;
    }
    
    // Check if chord has any frequencies
    if (!program.chord || !program.chord.frequencies || program.chord.frequencies.length === 0) {
      Logger.log(`[${this.synthId}] No chord frequencies - no sound`, 'synth');
      return false;
    }
    
    // All conditions met
    return true;
  }
  
  /**
   * Set power state
   * @param {boolean} on - Power state
   */
  setPower(on) {
    this.storedPower = on;
    if (!this.isCalibrating && this.synthCore.isInitialized) {
      // Only apply power if we have a valid program with assignment
      if (on && this.hasReceivedProgram && this.hasValidAssignment(this.storedProgram) && this.shouldPlaySound(this.storedProgram)) {
        this.synthCore.setPower(true);
      } else {
        this.synthCore.setPower(false);
      }
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
      hasReceivedProgram: this.hasReceivedProgram,
      hasAssignment: this.hasValidAssignment(this.storedProgram),
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