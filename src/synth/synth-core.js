// synth-core.js
// Core synthesis functionality shared between individual synths and test ensemble

import { SystemConfig } from '/js/config/system.config.js';

export class SynthCore {
  constructor(synthId, options = {}) {
    this.synthId = synthId;
    this.options = {
      enableLogging: true,
      storagePrefix: "synth-banks",
      ...options,
    };

    // Audio nodes
    this.audioContext = null;
    this.bowedStringNode = null;
    this.gainNode = null;
    this.pannerNode = null;
    this.analyserNode = null;
    this.reverbNode = null;

    // State
    this.currentProgram = null;
    this.isPoweredOn = true;
    this.isInitialized = false;
    this.isCalibrating = false;
    this.isBowing = false;
    this.hasReceivedProgram = false;

    // Banking
    this.synthBanks = new Map();

    // Calibration nodes
    this.pinkNoiseNode = null;
    this.calibrationGainNode = null;

    // Get worklet modules from config
    this.workletModules = SystemConfig.audio.worklets.modules.map(
      module => SystemConfig.audio.worklets.basePath + module
    );

    // Default parameter values from config
    this.defaultParameters = {
      fundamentalFrequency: SystemConfig.parameters.fundamentalFrequency.default,
      stringDamping: SystemConfig.parameters.stringDamping.default,
      bowPosition: SystemConfig.parameters.bowPosition.default,
      bowSpeed: SystemConfig.parameters.bowSpeed.default,
      bowForce: SystemConfig.parameters.bowForce.default,
      brightness: SystemConfig.parameters.brightness.default,
      bodyResonance: SystemConfig.parameters.bodyResonance.default,
      bodyType: SystemConfig.parameters.bodyType.default,
      stringMaterial: SystemConfig.parameters.stringMaterial.default,
      vibratoEnabled: SystemConfig.parameters.vibratoEnabled.default,
      vibratoRate: SystemConfig.parameters.vibratoRate.default,
      vibratoDepth: SystemConfig.parameters.vibratoDepth.default,
      tremoloEnabled: SystemConfig.parameters.tremoloEnabled.default,
      tremoloSpeed: SystemConfig.parameters.tremoloSpeed.default,
      tremoloDepth: SystemConfig.parameters.tremoloDepth.default,
      tremoloArticulation: SystemConfig.parameters.tremoloArticulation.default,
      trillEnabled: SystemConfig.parameters.trillEnabled.default,
      trillSpeed: SystemConfig.parameters.trillSpeed.default,
      trillInterval: SystemConfig.parameters.trillInterval.default,
      trillArticulation: SystemConfig.parameters.trillArticulation.default,
      masterGain: SystemConfig.parameters.masterGain.default,
      power: SystemConfig.parameters.power.default,
    };
  }

  // Initialize audio context and load worklets
  async initialize(audioContext, destination) {
    this.audioContext = audioContext;

    try {
      // Load all required worklet modules
      await this.loadWorklets();

      // Create audio node chain
      await this.createAudioNodes(destination);

      // Don't load from localStorage - keep banks in memory only

      this.isInitialized = true;
      
      // Set the initial program state to defaults without applying it
      this.currentProgram = { ...this.defaultParameters };
      
      // Mark that we haven't received a program from controller yet
      this.hasReceivedProgram = false;
      
    } catch (error) {
      this.log(`Failed to initialize synth core: ${error.message}`, "error");
      throw error;
    }
  }

  // Load audio worklet modules
  async loadWorklets() {
    const loadPromises = this.workletModules.map(async (module) => {
      try {
        await this.audioContext.audioWorklet.addModule(module);
      } catch (error) {
        this.log(
          `Warning: Failed to load worklet ${module}: ${error.message}`,
          "warn",
        );
      }
    });

    await Promise.all(loadPromises);
  }

  // Create the audio node chain
  async createAudioNodes(destination) {
    // Create bowed string worklet node
    try {
      this.bowedStringNode = new AudioWorkletNode(
        this.audioContext,
        "continuous-excitation-processor",
        {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        },
      );
    } catch (error) {
      this.log(
        `Failed to create bowed string worklet: ${error.message}`,
        "error",
      );
      throw new Error("Bowed string worklet is required but failed to load");
    }

    // Create gain node for volume control
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = this.defaultParameters.masterGain;

    // Create stereo panner for positioning
    this.pannerNode = this.audioContext.createStereoPanner();
    this.pannerNode.pan.value = 0;

    // Create analyser for level monitoring
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;

    // Create reverb node (optional)
    try {
      this.reverbNode = new AudioWorkletNode(
        this.audioContext,
        "fdn-reverb-processor",
      );
      this.reverbNode.parameters.get("roomSize").value = 0.3;
      this.reverbNode.parameters.get("damping").value = 0.5;
      this.reverbNode.parameters.get("mix").value = 0.2;
    } catch (error) {
      this.log(`Reverb worklet not available: ${error.message}`, "warn");
      this.reverbNode = null;
    }

    // Create calibration nodes
    try {
      this.pinkNoiseNode = new AudioWorkletNode(
        this.audioContext,
        "ridge-rat-type2-pink-noise-generator",
      );
      this.calibrationGainNode = this.audioContext.createGain();
      this.calibrationGainNode.gain.value = 0; // Initially silent
    } catch (error) {
      this.log(`Failed to create calibration nodes: ${error.message}`, "warn");
    }

    // Connect the audio chain
    this.connectAudioChain(destination);

    // Don't apply default parameters here - wait until after isInitialized is set
  }

  // Connect audio nodes in chain
  connectAudioChain(destination) {
    let currentNode = this.bowedStringNode;

    // Connect through reverb if available
    if (this.reverbNode) {
      currentNode.connect(this.reverbNode);
      currentNode = this.reverbNode;
    }

    // Connect through gain, panner, analyser to destination
    currentNode.connect(this.gainNode);
    this.gainNode.connect(this.pannerNode);
    this.pannerNode.connect(this.analyserNode);
    this.analyserNode.connect(destination);
  }

  // Get the analyser node for visualization
  getAnalyserNode() {
    return this.analyserNode;
  }

  // Apply a program to the synth
  applyProgram(program, transitionData = null) {
    if (!this.isInitialized) {
      this.log("Cannot apply program: synth not initialized", "warn");
      return;
    }

    if (!this.bowedStringNode) {
      this.log(
        "Cannot apply program: bowed string worklet not available",
        "error",
      );
      return;
    }

    this.currentProgram = { ...program };
    
    // Mark that we've received a program
    this.hasReceivedProgram = true;
    

    // Determine if we should apply immediately or with transition
    const applyTime =
      transitionData && transitionData.delay
        ? this.audioContext.currentTime + transitionData.delay
        : this.audioContext.currentTime;

    if (transitionData) {
      // Send transition configuration to worklet first
      this.bowedStringNode.port.postMessage({
        type: "setTransitionConfig",
        config: {
          duration: transitionData.duration || 1.0,
          spread: transitionData.spread || 0.2,
          stagger: transitionData.stagger || "sync",
          variance: transitionData.variance || 0.1,
        },
      });

      // Determine target expression from program
      const hasVibrato =
        program.vibratoEnabled === true || program.vibratoEnabled === 1;
      const hasTremolo =
        program.tremoloEnabled === true || program.tremoloEnabled === 1;
      const hasTrill =
        program.trillEnabled === true || program.trillEnabled === 1;
      const targetExpression = hasVibrato
        ? "VIBRATO"
        : hasTremolo
          ? "TREMOLO"
          : hasTrill
            ? "TRILL"
            : "NONE";

      // Schedule expression change
      this.bowedStringNode.port.postMessage({
        type: "setExpression",
        expression: targetExpression,
        startTime: applyTime,
      });
    } else {
      // No transition data - apply expression immediately
      const hasVibrato =
        program.vibratoEnabled === true || program.vibratoEnabled === 1;
      const hasTremolo =
        program.tremoloEnabled === true || program.tremoloEnabled === 1;
      const hasTrill =
        program.trillEnabled === true || program.trillEnabled === 1;
      const targetExpression = hasVibrato
        ? "VIBRATO"
        : hasTremolo
          ? "TREMOLO"
          : hasTrill
            ? "TRILL"
            : "NONE";

      this.bowedStringNode.port.postMessage({
        type: "setExpression",
        expression: targetExpression,
        startTime: applyTime,
      });
    }

    // Apply parameters to worklet (with timing and transitions)
    for (const [param, value] of Object.entries(program)) {
      if (this.bowedStringNode.parameters.has(param)) {
        const audioParam = this.bowedStringNode.parameters.get(param);

        if (param === 'fundamentalFrequency' && transitionData && transitionData.duration) {
          // Handle frequency ramp via message for sample-accurate sync with expressions
          this.bowedStringNode.port.postMessage({
            type: 'rampFrequency',
            target: value,
            duration: transitionData.duration,
            startTime: applyTime
          });
          // Also set the final value on the AudioParam for consistency
          audioParam.setValueAtTime(value, applyTime + transitionData.duration);
        } else if (transitionData && transitionData.duration) {
          // For glissando transitions, only ramp parameters that actually change
          const currentValue = audioParam.value;
          const glissandoEnabled = !transitionData || transitionData.glissando !== false;
          
          if (glissandoEnabled && Math.abs(currentValue - value) < 0.001) {
            // Value unchanged during glissando, just set it to ensure stability
            audioParam.setValueAtTime(value, applyTime);
          } else {
            // Value changed or non-glissando transition, apply ramp
            audioParam.setValueAtTime(currentValue, applyTime);
            audioParam.linearRampToValueAtTime(
              value,
              applyTime + transitionData.duration,
            );
          }
        } else {
          // Immediate change
          audioParam.setValueAtTime(value, applyTime);
        }
      }
    }

    // Handle special parameters
    if (program.masterGain !== undefined) {
      // If calibrating, keep gain at 0 regardless of program settings
      const targetGain = this.isCalibrating ? 0 : (program.masterGain * (this.isPoweredOn ? 1 : 0));
      const glissandoEnabled = !transitionData || transitionData.glissando !== false;
      
      this.log(`Gain transition: glissando=${transitionData?.glissando}, glissandoEnabled=${glissandoEnabled}, crossfade=${!glissandoEnabled}`);

      if (transitionData && transitionData.duration && !glissandoEnabled) {
        // Crossfade envelope for non-glissando transitions
        const midpointTime = applyTime + (transitionData.duration / 2);
        
        // Fade out to silence
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, applyTime);
        this.gainNode.gain.linearRampToValueAtTime(0, midpointTime);
        
        // Fade in from silence
        this.gainNode.gain.setValueAtTime(0, midpointTime);
        this.gainNode.gain.linearRampToValueAtTime(targetGain, applyTime + transitionData.duration);
      } else if (transitionData && transitionData.duration) {
        // Normal gain transition for glissando mode
        // Only ramp if the gain is actually changing
        const currentGain = this.gainNode.gain.value;
        if (Math.abs(currentGain - targetGain) > 0.001) {
          this.gainNode.gain.setValueAtTime(currentGain, applyTime);
          this.gainNode.gain.linearRampToValueAtTime(
            targetGain,
            applyTime + transitionData.duration,
          );
        } else {
          // Gain unchanged, just set it to ensure stability
          this.gainNode.gain.setValueAtTime(targetGain, applyTime);
        }
      } else {
        // Immediate change
        this.gainNode.gain.setValueAtTime(targetGain, applyTime);
      }
    }

    if (program.power !== undefined) {
      this.setPower(program.power);
    }

    // Handle bowing state changes
    const shouldBow =
      program.fundamentalFrequency && program.fundamentalFrequency > 0 && this.hasReceivedProgram;

    if (this.isCalibrating) {
    } else if (shouldBow && !this.isBowing) {
      // Start bowing
      this.log(`Starting bowing (freq=${program.fundamentalFrequency}, delay=${transitionData?.delay || 0})`);
      this.bowedStringNode.port.postMessage({
        type: "setBowing",
        value: true,
        startTime: applyTime,
      });
      this.isBowing = true;
    } else if (!shouldBow && this.isBowing) {
      // Stop bowing
      this.log(`Stopping bowing (freq=${program.fundamentalFrequency})`);
      this.bowedStringNode.port.postMessage({
        type: "setBowing",
        value: false,
        startTime: applyTime,
      });
      this.isBowing = false;
    } else {
    }

    // Log program with expression status and transition info
    const hasVibrato =
      program.vibratoEnabled === true || program.vibratoEnabled === 1;
    const hasTremolo =
      program.tremoloEnabled === true || program.tremoloEnabled === 1;
    const hasTrill =
      program.trillEnabled === true || program.trillEnabled === 1;
    const expression = hasVibrato
      ? "vibrato"
      : hasTremolo
        ? "tremolo"
        : hasTrill
          ? "trill"
          : "none";

  }

  // Set power state
  setPower(powerOn) {
    // If turning power on while calibrating, stop calibration first
    if (powerOn && this.isCalibrating) {
      this.stopCalibrationNoise();
    }

    this.isPoweredOn = powerOn;

    if (powerOn) {
      // Power ON: Restore gain and start bowing if we have a frequency
      if (this.gainNode) {
        const targetGain = this.currentProgram?.masterGain || this.defaultParameters.masterGain;
        this.gainNode.gain.linearRampToValueAtTime(
          targetGain,
          this.audioContext.currentTime + 0.1,
        );
      }
      
      // Start bowing if we have a valid frequency and have received a program from controller
      if (this.currentProgram?.fundamentalFrequency > 0 && this.bowedStringNode && !this.isBowing && this.hasReceivedProgram && !this.isCalibrating) {
        this.bowedStringNode.port.postMessage({
          type: "setBowing",
          value: true,
          startTime: this.audioContext.currentTime,
        });
        this.isBowing = true;
      }
    } else {
      // Power OFF: Stop bowing and let resonance decay naturally
      // Keep gain at current level to allow natural decay
      if (this.bowedStringNode && this.isBowing) {
        this.bowedStringNode.port.postMessage({
          type: "setBowing",
          value: false,
          startTime: this.audioContext.currentTime,
        });
        this.isBowing = false;
      }
    }

    // this.log(`Power ${powerOn ? "ON" : "OFF"}`);
  }

  // Set pan position (-1 to 1)
  setPan(panValue) {
    if (this.pannerNode) {
      this.pannerNode.pan.setValueAtTime(
        Math.max(-1, Math.min(1, panValue)),
        this.audioContext.currentTime,
      );
    }
  }

  // Get current audio level (0-1)
  getAudioLevel() {
    if (!this.analyserNode) return 0;

    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }

    return sum / dataArray.length / 255;
  }

  // Banking: Save current state
  saveToBank(bankId) {
    if (!this.currentProgram) {
      this.log("No current program to save", "warn");
      return false;
    }

    // Store deep copy of current program
    const savedProgram = JSON.parse(JSON.stringify(this.currentProgram));
    
    // Debug logging
    this.log(`Saving to bank ${bankId} - currentProgram trill: enabled=${this.currentProgram.trillEnabled}, speed=${this.currentProgram.trillSpeed}`);
    
    this.synthBanks.set(bankId, savedProgram);

    // Don't persist to localStorage - keep in memory only

    this.log(`Saved program to bank ${bankId}`);
    return true;
  }

  // Banking: Load from bank
  loadFromBank(bankId, fallbackProgram = null) {
    if (this.synthBanks.has(bankId)) {
      // Load saved program
      const savedProgram = this.synthBanks.get(bankId);
      
      // Debug logging
      this.log(`Loading from bank ${bankId} - saved trill: enabled=${savedProgram.trillEnabled}, speed=${savedProgram.trillSpeed}`);
      
      this.applyProgram(savedProgram);
      this.log(`Loaded program from bank ${bankId}`);
      return true;
    } else if (fallbackProgram) {
      // Use fallback program for new synths
      this.applyProgram(fallbackProgram);
      this.log(`No saved program in bank ${bankId}, using fallback`);
      return true;
    } else {
      this.log(`Bank ${bankId} not found and no fallback provided`, "warn");
      return false;
    }
  }

  // Save banks to localStorage
  saveBanksToStorage() {
    try {
      const banksData = {};
      this.synthBanks.forEach((program, bankId) => {
        banksData[bankId] = program;
      });

      const storageKey = `${this.options.storagePrefix}-${this.synthId}`;
      localStorage.setItem(storageKey, JSON.stringify(banksData));
    } catch (error) {
      this.log(`Failed to save banks to storage: ${error.message}`, "error");
    }
  }

  // Load banks from localStorage
  loadBanksFromStorage() {
    try {
      const storageKey = `${this.options.storagePrefix}-${this.synthId}`;
      const saved = localStorage.getItem(storageKey);

      if (saved) {
        const banksData = JSON.parse(saved);
        Object.entries(banksData).forEach(([bankId, program]) => {
          this.synthBanks.set(parseInt(bankId), program);
        });

        this.log(`Loaded ${this.synthBanks.size} banks from storage`);
      }
    } catch (error) {
      this.log(`Failed to load banks from storage: ${error.message}`, "error");
    }
  }

  // Get list of available banks
  getAvailableBanks() {
    return Array.from(this.synthBanks.keys()).sort((a, b) => a - b);
  }

  // Utility: Convert frequency to note name
  frequencyToNote(frequency) {
    const A4 = 440;
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

    const semitones = Math.round(12 * Math.log2(frequency / A4));
    const octave = Math.floor((semitones + 57) / 12);
    const noteIndex = (semitones + 69) % 12;

    return {
      note: noteNames[noteIndex] + octave,
      semitones: semitones,
      frequency: frequency,
    };
  }

  // Utility: Convert note name to frequency
  noteToFrequency(noteName) {
    const noteRegex = /^([A-G])(#|b)?(\d+)$/;
    const match = noteName.match(noteRegex);

    if (!match) {
      this.log(`Invalid note name: ${noteName}`, "warn");
      return 440; // Default to A4
    }

    const [, note, accidental, octave] = match;
    const noteOffsets = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

    let semitones = noteOffsets[note];
    if (accidental === "#") semitones += 1;
    if (accidental === "b") semitones -= 1;

    semitones += (parseInt(octave) - 4) * 12;

    return 440 * Math.pow(2, semitones / 12);
  }

  // Logging utility
  log(message, level = "info") {
    if (!this.options.enableLogging) return;

    const timestamp = new Date().toISOString().substr(11, 12);
    const prefix = `[${timestamp}] [${this.synthId}]`;

    switch (level) {
      case "error":
        console.error(`${prefix} ${message}`);
        break;
      case "warn":
        console.warn(`${prefix} ${message}`);
        break;
      case "info":
      default:
        console.log(`${prefix} ${message}`);
        break;
    }
  }

  // Start calibration noise
  startCalibrationNoise(volume = 0.2) {
    if (
      !this.isInitialized ||
      !this.pinkNoiseNode ||
      !this.calibrationGainNode
    ) {
      this.log(
        "Cannot start calibration: core or calibration nodes not ready",
        "error",
      );
      return false;
    }

    this.isCalibrating = true;

    // Mute synthesis path
    if (this.gainNode) {
      // this.log(`Muting synthesis gain node for calibration (current: ${this.gainNode.gain.value} → 0)`);
      this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
      this.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    }

    // Stop bowing if active
    if (
      this.bowedStringNode &&
      typeof this.bowedStringNode.port?.postMessage === "function"
    ) {
      this.bowedStringNode.port.postMessage({
        type: "setBowing",
        value: false,
        startTime: this.audioContext.currentTime,
      });
      // Reset bowing state
      this.isBowing = false;
    }
    
    // Disconnect synthesis path from gain node during calibration
    try {
      if (this.reverbNode) {
        this.reverbNode.disconnect(this.gainNode);
      } else {
        this.bowedStringNode.disconnect(this.gainNode);
      }
      // this.log("Disconnected synthesis path for calibration");
    } catch (e) {
      this.log("Error disconnecting synthesis path: " + e.message, "warn");
    }

    // Connect and activate calibration path
    try {
      this.pinkNoiseNode.disconnect(); // Disconnect from any previous connections
    } catch (e) {
      /* ignore if not connected */
    }

    this.pinkNoiseNode.connect(this.calibrationGainNode);

    // Connect calibration to analyser (analyser is already connected to destination)
    if (this.analyserNode) {
      this.calibrationGainNode.connect(this.analyserNode);
    } else {
      this.calibrationGainNode.connect(this.audioContext.destination);
    }

    this.calibrationGainNode.gain.setValueAtTime(
      volume,
      this.audioContext.currentTime,
    );

    return true;
  }

  // Stop calibration noise
  stopCalibrationNoise() {
    if (!this.isInitialized || !this.calibrationGainNode) {
      this.log(
        "Cannot stop calibration: core or calibration gain node not ready",
        "warn",
      );
      return;
    }

    this.isCalibrating = false;
    
    // Reconnect synthesis path
    try {
      if (this.reverbNode) {
        this.reverbNode.connect(this.gainNode);
      } else {
        this.bowedStringNode.connect(this.gainNode);
      }
      // this.log("Reconnected synthesis path after calibration");
    } catch (e) {
      this.log("Error reconnecting synthesis path: " + e.message, "warn");
    }
    this.calibrationGainNode.gain.setValueAtTime(
      0,
      this.audioContext.currentTime,
    );

    try {
      if (this.pinkNoiseNode) {
        this.pinkNoiseNode.disconnect(this.calibrationGainNode);
      }
      if (this.analyserNode) {
        this.calibrationGainNode.disconnect(this.analyserNode);
      } else {
        this.calibrationGainNode.disconnect(this.audioContext.destination);
      }
    } catch (e) {
      this.log(
        "Error disconnecting calibration nodes (may already be disconnected)",
        "warn",
      );
    }
  }

  // Cleanup
  destroy() {
    if (this.bowedStringNode) {
      this.bowedStringNode.disconnect();
      this.bowedStringNode = null;
    }

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    if (this.pannerNode) {
      this.pannerNode.disconnect();
      this.pannerNode = null;
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }

    if (this.reverbNode) {
      this.reverbNode.disconnect();
      this.reverbNode = null;
    }

    if (this.pinkNoiseNode) {
      this.pinkNoiseNode.disconnect();
      this.pinkNoiseNode = null;
    }

    if (this.calibrationGainNode) {
      this.calibrationGainNode.disconnect();
      this.calibrationGainNode = null;
    }

    this.synthBanks.clear();
    this.isInitialized = false;

    this.log("Synth core destroyed");
  }
}

// Export utility functions as well
export const SynthUtils = {
  // Standard parameter validation
  validateProgram(program) {
    const validParams = {
      fundamentalFrequency: { min: 20, max: 20000 },
      stringDamping: { min: 0.01, max: 0.99 },
      bowPosition: { min: 0.02, max: 0.5 },
      bowSpeed: { min: 0, max: 1 },
      bowForce: { min: 0, max: 1 },
      brightness: { min: 0, max: 1 },
      bodyResonance: { min: 0, max: 1 },
      bodyType: { min: 0, max: 4 },
      stringMaterial: { min: 0, max: 3 },
      vibratoRate: { min: 0, max: 20 },
      vibratoDepth: { min: 0, max: 0.1 },
      tremoloSpeed: { min: 0, max: 30 },
      tremoloDepth: { min: 0, max: 1 },
      tremoloArticulation: { min: 0.1, max: 0.95 },
      trillSpeed: { min: 0, max: 30 },
      trillInterval: { min: 1, max: 12 },
      trillArticulation: { min: 0.1, max: 0.95 },
      masterGain: { min: 0, max: 1 },
    };

    const validated = {};

    for (const [param, value] of Object.entries(program)) {
      if (validParams[param]) {
        const { min, max } = validParams[param];
        validated[param] = Math.max(min, Math.min(max, value));
      } else {
        validated[param] = value;
      }
    }

    return validated;
  },

  // Generate random program variations
  generateVariation(baseProgram, variationAmount = 0.1) {
    const varied = { ...baseProgram };

    const varyableParams = [
      "stringDamping",
      "bowPosition",
      "bowSpeed",
      "bowForce",
      "brightness",
      "bodyResonance",
      "vibratoRate",
      "vibratoDepth",
      "tremoloSpeed",
      "tremoloDepth",
      "trillSpeed",
    ];

    varyableParams.forEach((param) => {
      if (varied[param] !== undefined) {
        const variation = (Math.random() - 0.5) * 2 * variationAmount;
        varied[param] = Math.max(0, Math.min(1, varied[param] + variation));
      }
    });

    return this.validateProgram(varied);
  },
};
