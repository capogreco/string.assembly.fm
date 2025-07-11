// basic-processor.js - Modal String Synthesis with Continuous Bow Excitation

// Simplex Noise implementation for organic detune
class SimplexNoise {
  constructor(seed = Math.random()) {
    this.seed = seed;
    this.perm = new Uint8Array(512);
    this.gradP = new Array(512);
    
    // Gradient vectors for 2D
    const grad2 = [
      [1, 1], [-1, 1], [1, -1], [-1, -1],
      [1, 0], [-1, 0], [0, 1], [0, -1]
    ];
    
    // Initialize permutation table with seed
    let n = seed * 16807 % 2147483647;
    for (let i = 0; i < 256; i++) {
      n = n * 16807 % 2147483647;
      this.perm[i] = this.perm[i + 256] = n % 256;
    }
    
    // Assign gradients
    for (let i = 0; i < 512; i++) {
      this.gradP[i] = grad2[this.perm[i] % 8];
    }
    
    // Constants
    this.F2 = 0.5 * (Math.sqrt(3) - 1);
    this.G2 = (3 - Math.sqrt(3)) / 6;
  }
  
  noise2D(x, y) {
    // Skew the input space to determine which simplex cell we're in
    const s = (x + y) * this.F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    
    const t = (i + j) * this.G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;
    
    // Determine which simplex we're in
    let i1, j1;
    if (x0 > y0) {
      i1 = 1; j1 = 0;
    } else {
      i1 = 0; j1 = 1;
    }
    
    const x1 = x0 - i1 + this.G2;
    const y1 = y0 - j1 + this.G2;
    const x2 = x0 - 1 + 2 * this.G2;
    const y2 = y0 - 1 + 2 * this.G2;
    
    // Get gradient indices
    const gi0 = this.perm[(i + this.perm[j & 255]) & 255];
    const gi1 = this.perm[(i + i1 + this.perm[(j + j1) & 255]) & 255];
    const gi2 = this.perm[(i + 1 + this.perm[(j + 1) & 255]) & 255];
    
    // Calculate contributions from three corners
    let n0 = 0, n1 = 0, n2 = 0;
    
    const t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const g0 = this.gradP[gi0];
      n0 = t0 * t0 * t0 * t0 * (g0[0] * x0 + g0[1] * y0);
    }
    
    const t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const g1 = this.gradP[gi1];
      n1 = t1 * t1 * t1 * t1 * (g1[0] * x1 + g1[1] * y1);
    }
    
    const t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const g2 = this.gradP[gi2];
      n2 = t2 * t2 * t2 * t2 * (g2[0] * x2 + g2[1] * y2);
    }
    
    // Scale result to [-1, 1]
    return 70 * (n0 + n1 + n2);
  }
}

const NUM_STRING_MODES = 32; // Number of modes for the string resonator bank

class ContinuousExcitationProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "fundamentalFrequency",
        defaultValue: 220,
        minValue: 20.0,
        maxValue: 2000.0,
        automationRate: "a-rate",
      },
      {
        name: "stringDamping",
        defaultValue: 0.5,
        minValue: 0.01,
        maxValue: 0.99,
        automationRate: "k-rate",
      },
      {
        name: "bowForce",
        defaultValue: 0.5,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: "k-rate",
      },
      {
        name: "bowPosition",
        defaultValue: 0.12,
        minValue: 0.02,
        maxValue: 0.5,
        automationRate: "k-rate",
      }, // 0.02 = very close to bridge, 0.5 = middle of string
      {
        name: "bowSpeed",
        defaultValue: 0.5,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: "k-rate",
      }, // 0 = very slow, 1 = very fast
      {
        name: "brightness",
        defaultValue: 0.5,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: "k-rate",
      }, // Overall brightness control

      // --- Vibrato parameters ---
      {
        name: "vibratoEnabled",
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      }, // 0=off, 1=on
      {
        name: "vibratoRate",
        defaultValue: 5.0,
        minValue: 0.0,
        maxValue: 10.0,
        automationRate: "k-rate",
      }, // Hz
      {
        name: "vibratoDepth",
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: "k-rate",
      }, // 0-1
      // TODO: Future enhancement - Add asymmetric vibrato waveshaping
      // - vibratoShape: 0=sine, 0.5=triangle, 1=square
      // - vibratoAsymmetry: -1=faster up/slower down, 0=symmetric, 1=slower up/faster down
      // - vibratoOnset: 0=immediate, 1=gradual (fade in over first second)

      // --- Trill parameters ---
      {
        name: "trillEnabled",
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      }, // 0=off, 1=on
      {
        name: "trillInterval",
        defaultValue: 1,
        minValue: 1,
        maxValue: 12,
        automationRate: "k-rate",
      }, // semitones above base note
      {
        name: "trillSpeed",
        defaultValue: 5.0,
        minValue: 3.0,
        maxValue: 12.0,
        automationRate: "k-rate",
      }, // Hz
      {
        name: "trillArticulation",
        defaultValue: 0.7,
        minValue: 0.1,
        maxValue: 0.95,
        automationRate: "k-rate",
      }, // 0.1=very separated, 0.95=very connected

      // --- Tremolo parameters ---
      {
        name: "tremoloEnabled",
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      }, // 0=off, 1=on
      {
        name: "tremoloSpeed",
        defaultValue: 4.0,
        minValue: 1.0,
        maxValue: 12.0,
        automationRate: "k-rate",
      }, // Hz
      {
        name: "tremoloDepth",
        defaultValue: 0.7,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: "k-rate",
      }, // 0-1
      {
        name: "tremoloArticulation",
        defaultValue: 0.5,
        minValue: 0.01,
        maxValue: 0.99,
        automationRate: "k-rate",
      },

      // --- Body Resonator Parameters ---
      // bodyType is now handled via messages
      {
        name: "bodyResonance",
        defaultValue: 0.3,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: "k-rate",
      },

      // --- Master Output ---
      {
        name: "masterGain",
        defaultValue: 0.5,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: "k-rate",
      }, // Master volume control
      {
        name: "detune",
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: "k-rate",
      }, // Detune amount (0 = no detune, 1 = max detune)
    ];
  }

  constructor(options) {
    super(options);
    this.sampleRate = sampleRate; // Globally available in AudioWorkletGlobalScope

    // Cached AudioParam values to detect changes and trigger coefficient updates
    const descriptors = ContinuousExcitationProcessor.parameterDescriptors;
    this._cachedFundamentalFrequency = descriptors.find(
      (p) => p.name === "fundamentalFrequency",
    ).defaultValue;
    this._cachedStringDamping = descriptors.find(
      (p) => p.name === "stringDamping",
    ).defaultValue;
    this._cachedBrightness = descriptors.find(
      (p) => p.name === "brightness",
    ).defaultValue;
    this._cachedBowPosition = descriptors.find(
      (p) => p.name === "bowPosition",
    ).defaultValue;
    this._cachedBodyResonance = descriptors.find(
      (p) => p.name === "bodyResonance",
    ).defaultValue;

    // Initialize cached values for message-controlled discrete parameters
    this._cachedStringMaterial = 0; // Default to "Steel"
    this._cachedBodyType = 0; // Default to "Violin"
    
    // Detune noise initialization
    const noiseSeed = Date.now() * Math.random(); // Unique seed for each instance
    this.detuneNoise = new SimplexNoise(noiseSeed);
    this.detuneNoiseTime = 0;
    this.detuneNoiseRate = 0.005555555556; // Hz - exactly 1/180 (3 minute period)
    this.currentDetuneMultiplier = 1.0;
    this._cachedDetuneMultiplier = 1.0; // Track to detect changes

    // --- String Modal Resonator Parameters & State Arrays (Biquad-based) ---
    this.stringMode_b0 = new Float32Array(NUM_STRING_MODES);
    this.stringMode_b1 = new Float32Array(NUM_STRING_MODES);
    this.stringMode_b2 = new Float32Array(NUM_STRING_MODES);
    this.stringMode_a1 = new Float32Array(NUM_STRING_MODES);
    this.stringMode_a2 = new Float32Array(NUM_STRING_MODES);
    this.stringMode_z1_states = new Float32Array(NUM_STRING_MODES);
    this.stringMode_z2_states = new Float32Array(NUM_STRING_MODES);

    // Store mode properties (frequencies, amplitudes for gain scaling)
    this.modeFrequencies = new Float32Array(NUM_STRING_MODES); // Still useful for target frequencies
    this.modeAmplitudes = new Float32Array(NUM_STRING_MODES); // For scaling biquad gains

    // --- Bow Excitation State ---
    this.isBowing = false;
    this.sawPhase = 0.0;
    this.pulsePhase = 0.0;

    // Bow position affects which harmonics are suppressed
    this.harmonicGains = new Float32Array(NUM_STRING_MODES);

    // Dynamic bow pressure tracking
    this._lastDynamicCutoff = 0.5;

    // Attack/Release envelope
    this.bowEnvelope = 0.0;
    this.bowEnvelopeTarget = 0.0;
    this.bowEnvelopeRate = 0.005; // ~20ms at 48kHz

    // Expression state machine
    this.expressionState = {
      current: "NONE",
      target: "NONE",
      finalTarget: null, // For two-stage transitions (e.g., VIBRATO → NONE → TREMOLO)
      phase: "IDLE", // IDLE, STOPPING, WAITING, STARTING
      stopProgress: 0.0,
      startProgress: 0.0,
    };

    // Transition control settings
    this.transitionSettings = {
      duration: 1.0, // Base transition time in seconds
      spread: 0.2, // 20% timing diversity
      stagger: "sync", // sync, cascade, or random
      variance: 0.1, // 10% individual variation
    };

    // Stagger timing tracking
    this.staggerStartTime = {};
    this.staggerDelays = {};

    // Natural transition parameters
    this.transitionParams = {
      vibrato: {
        baseStopRate: 0.0015, // Base rate for 1 second duration
        baseStartRate: 0.002,
        stopRate: 0.0015, // Will be updated by _updateTransitionRates()
        startRate: 0.002,
        canStopAt: () => true, // Vibrato can stop at any phase point
      },
      tremolo: {
        baseStopRate: 0.006,
        baseStartRate: 0.0015,
        stopRate: 0.006,
        startRate: 0.0015,
        canStopAt: () => {
          // Tremolo stops at stroke boundaries
          return (
            this.tremoloPhase < 0.05 ||
            this.tremoloPhase > 0.95 ||
            (this.tremoloPhase > 0.45 && this.tremoloPhase < 0.55)
          );
        },
      },
      trill: {
        baseStopRate: 0.009,
        baseStartRate: 0.0025,
        stopRate: 0.009,
        startRate: 0.0025,
        canStopAt: () => {
          // Trill stops at note boundaries
          return (
            this.trillPhase < 0.05 ||
            (this.trillPhase > 0.45 && this.trillPhase < 0.55)
          );
        },
      },
    };

    // Initialize rates based on current duration
    this._updateTransitionRates();

    // Master progress tracking for each expression
    this.vibratoMasterProgress = 0.0;
    this.tremoloMasterProgress = 0.0;
    this.trillMasterProgress = 0.0;

    // Expression phases (keep for DSP calculations)
    this.vibratoPhase = 0.0;
    this.trillPhase = 0.0;
    this.tremoloPhase = 0.0;

    // Keep these for DSP state
    this.trillCurrentSpeed = 3.0; // Start at minimum speed
    this.lastTrillState = 0; // Track if we're on upper or lower note
    this.tremoloStrokeCount = 0;
    this.lastTremoloState = 0;
    this.tremoloGroupPhase = 0.0; // For natural grouping accents
    this.tremoloScratchiness = 0.0;
    this.tremoloBowSpeed = 1.0;

    // For debugging
    this.debugCounter = 0;
    this.currentFrame = 0;
    this.scheduledMessages = []; // Message queue for sample-accurate scheduling

    // Frequency ramping state
    this.isRampingFrequency = false;
    this.freqRampStartValue = 0;
    this.freqRampTargetValue = 0;
    this.freqRampProgress = 0; // 0 to 1
    this.freqRampIncrement = 0;

    // Flags for discrete parameter changes needing coefficient updates
    this._stringCoefficientsNeedRecalculation = false;
    this._bodyCoefficientsNeedRecalculation = false;

    // --- LPF State ---
    this.lpf_b0 = 1;
    this.lpf_b1 = 0;
    this.lpf_b2 = 0;
    this.lpf_a1 = 0;
    this.lpf_a2 = 0;
    this.lpf_z1 = 0;
    this.lpf_z2 = 0;

    // --- Modal Body Resonator Base Parameters & State Arrays ---
    // Body presets: [violin, viola, cello, guitar, none]
    this.bodyPresets = [
      {
        // Violin
        freqs: [280, 460, 580, 700, 840],
        qs: [12, 15, 10, 8, 8],
        gains: [1.0, 0.8, 0.7, 0.5, 0.3],
      },
      {
        // Viola
        freqs: [220, 380, 500, 650, 780],
        qs: [10, 12, 9, 7, 7],
        gains: [1.0, 0.85, 0.7, 0.5, 0.3],
      },
      {
        // Cello
        freqs: [100, 200, 300, 400, 500],
        qs: [8, 10, 8, 6, 6],
        gains: [1.0, 0.9, 0.8, 0.6, 0.4],
      },
      {
        // Guitar
        freqs: [100, 200, 400, 500, 600],
        qs: [15, 12, 10, 8, 8],
        gains: [1.0, 0.7, 0.8, 0.5, 0.4],
      },
      {
        // None
        freqs: [100, 200, 300, 400, 500],
        qs: [1, 1, 1, 1, 1],
        gains: [0, 0, 0, 0, 0],
      },
    ];
    this.numBodyModes = 5;

    this.bodyMode_b0 = new Float32Array(this.numBodyModes);
    this.bodyMode_b1 = new Float32Array(this.numBodyModes);
    this.bodyMode_b2 = new Float32Array(this.numBodyModes);
    this.bodyMode_a1 = new Float32Array(this.numBodyModes);
    this.bodyMode_a2 = new Float32Array(this.numBodyModes);
    this.bodyMode_z1_states = new Float32Array(this.numBodyModes);
    this.bodyMode_z2_states = new Float32Array(this.numBodyModes);

    // --- Output Scaling ---
    // More reasonable scaling - modes add constructively at fundamental
    this.outputScalingFactor = 0.3;

    // Master gain scaling
    this.masterGainScale = 10.0; // Boost range for master gain (0-10x)

    // Calculate initial coefficients
    this._calculateStringModeCoefficients(); // Renamed from _calculateModalParameters
    this._calculateLpfCoefficients();
    this._calculateModalBodyCoefficients(); // Calculate initial Body Modal coefficients

    this.port.onmessage = this._handleMessage.bind(this);
  }

  _handleMessage(event) {
    const data = event.data;
    if (!data) return;

    if (data.startTime && data.startTime > currentTime) {
      // This is a scheduled message, queue it
      this.scheduledMessages.push(data);
      return;
    }

    // Process immediate messages
    this._processMessage(data);
  }

  _processMessage(data) {
    if (data.type === "setBowing") {
      this.isBowing = data.value;
      this.bowEnvelopeTarget = data.value ? 1.0 : 0.0;
      if (this.isBowing) {
        this._resetStringModeStates();
        this._resetLpfState();
        this._resetBodyModeStates();
      }
    } else if (data.type === "rampFrequency") {
      this.isRampingFrequency = true;
      this.freqRampStartValue = this._cachedFundamentalFrequency;
      this.freqRampTargetValue = data.target;
      this.freqRampProgress = 0;
      const rampDurationInSamples = data.duration * this.sampleRate;
      this.freqRampIncrement = rampDurationInSamples > 0 ? 1.0 / rampDurationInSamples : 1.0;
    } else if (data.type === "setExpression") {
      const validExpressions = ["NONE", "VIBRATO", "TREMOLO", "TRILL"];
      if (validExpressions.includes(data.expression)) {
        const newTarget = data.expression;
        const state = this.expressionState;
        if (state.current !== "NONE" && newTarget !== "NONE" && state.current !== newTarget) {
          state.target = "NONE";
          state.finalTarget = newTarget;
        } else {
          state.target = newTarget;
          state.finalTarget = null;
        }
      }
    } else if (data.type === "setTransitionConfig") {
      if (data.config) {
        if (data.config.duration !== undefined) this.transitionSettings.duration = Math.max(0.5, Math.min(5.0, data.config.duration));
        if (data.config.spread !== undefined) this.transitionSettings.spread = Math.max(0.0, Math.min(1.0, data.config.spread));
        if (data.config.stagger !== undefined && ["sync", "cascade", "random"].includes(data.config.stagger)) this.transitionSettings.stagger = data.config.stagger;
        if (data.config.variance !== undefined) this.transitionSettings.variance = Math.max(0.0, Math.min(1.0, data.config.variance));
        this._updateTransitionRates();
      }
    } else if (data.type === "setStringMaterial") {
      if (data.value !== undefined && data.value !== this._cachedStringMaterial) {
        this._cachedStringMaterial = data.value;
        this._stringCoefficientsNeedRecalculation = true;
      }
    } else if (data.type === "setBodyType") {
      if (data.value !== undefined && data.value !== this._cachedBodyType) {
        this._cachedBodyType = data.value;
        this._bodyCoefficientsNeedRecalculation = true;
      }
    }
  }

  _updateTransitionRates() {
    // Update transition rates based on current duration setting
    const duration = this.transitionSettings.duration;

    // Update vibrato rates
    this.transitionParams.vibrato.stopRate =
      this.transitionParams.vibrato.baseStopRate / duration;
    this.transitionParams.vibrato.startRate =
      this.transitionParams.vibrato.baseStartRate / duration;

    // Update tremolo rates
    this.transitionParams.tremolo.stopRate =
      this.transitionParams.tremolo.baseStopRate / duration;
    this.transitionParams.tremolo.startRate =
      this.transitionParams.tremolo.baseStartRate / duration;

    // Update trill rates
    this.transitionParams.trill.stopRate =
      this.transitionParams.trill.baseStopRate / duration;
    this.transitionParams.trill.startRate =
      this.transitionParams.trill.baseStartRate / duration;
  }

  _resetBodyModeStates() {
    for (let i = 0; i < this.numBodyModes; i++) {
      this.bodyMode_z1_states[i] = 0.0;
      this.bodyMode_z2_states[i] = 0.0;
    }
  }

  _resetLpfState() {
    this.lpf_z1 = 0.0;
    this.lpf_z2 = 0.0;
  }

  _resetStringModeStates() {
    // Reset biquad filter states for string modes
    for (let i = 0; i < NUM_STRING_MODES; i++) {
      this.stringMode_z1_states[i] = 0.0;
      this.stringMode_z2_states[i] = 0.0;
    }
  }

  _calculateStaggerDelay(expression) {
    // Calculate and store stagger delays when transition starts
    const spread = this.transitionSettings.spread;
    const duration = this.transitionSettings.duration;

    // Only calculate once per transition
    if (this.staggerDelays[expression] === undefined) {
      if (this.transitionSettings.stagger === "cascade") {
        // Cascade: expressions start in order
        const order = { VIBRATO: 0, TREMOLO: 1, TRILL: 2 };
        const orderIndex = order[expression] || 0;
        this.staggerDelays[expression] = orderIndex * spread * duration * 0.3; // 30% of spread duration
      } else if (this.transitionSettings.stagger === "random") {
        // Random: random delay within spread range
        this.staggerDelays[expression] =
          Math.random() * spread * duration * 0.5;
      } else {
        // sync: no delay
        this.staggerDelays[expression] = 0;
      }
    }

    return this.staggerDelays[expression];
  }

  _shouldDelayForStagger(expression, progress) {
    // Check if we should delay based on stagger settings
    if (this.transitionSettings.stagger === "sync" || progress > 0) {
      return false;
    }

    // Initialize start time if needed
    if (!this.staggerStartTime[expression]) {
      this.staggerStartTime[expression] = this.currentFrame;
    }

    const delay = this._calculateStaggerDelay(expression);
    const elapsedFrames = this.currentFrame - this.staggerStartTime[expression];
    const delayFrames = delay * this.sampleRate; // Convert seconds to frames

    return elapsedFrames < delayFrames;
  }

  _clearStaggerState(expression) {
    // Clear stagger state when transition completes or is interrupted
    delete this.staggerStartTime[expression];
    delete this.staggerDelays[expression];
  }

  _updateExpressionState() {
    const state = this.expressionState;

    switch (state.phase) {
      case "IDLE":
        // Check if we need to start a transition
        if (state.current !== state.target) {
          // Enforce hub-and-spoke: must go through NONE
          if (state.current !== "NONE" && state.target !== "NONE") {
            // Can't go directly between expressions - must stop current first
            state.target = "NONE";
            // Note: finalTarget is set in _handleMessage when this occurs
          }
          state.phase = "STOPPING";
          state.stopProgress = 0.0;
        }
        break;

      case "STOPPING":
        if (state.current === "NONE") {
          // No expression to stop, go directly to starting
          state.phase = "STARTING";
          state.startProgress = 0.0;
        } else {
          // Handle interrupted transitions
          if (state.target === state.current) {
            // User wants to go back - reverse direction
            state.phase = "STARTING";
            state.startProgress = 1.0 - state.stopProgress;
            break;
          }

          const params = this.transitionParams[state.current.toLowerCase()];

          // Check if we can stop at this point
          if (params.canStopAt()) {
            // Apply stagger and variance to stop progress
            let effectiveRate = params.stopRate;

            // Apply variance
            if (this.transitionSettings.variance > 0) {
              const varianceFactor =
                1.0 + (Math.random() - 0.5) * this.transitionSettings.variance;
              effectiveRate *= varianceFactor;
            }

            state.stopProgress += effectiveRate;

            if (state.stopProgress >= 1.0) {
              // Fully stopped
              state.phase = "WAITING";
            }
          }
        }
        break;

      case "WAITING":
        // Brief pause between expressions
        state.current = "NONE";

        // Check if we have a final target to reach
        if (state.finalTarget && state.finalTarget !== "NONE") {
          state.target = state.finalTarget;
          state.finalTarget = null;
        }

        state.phase = "STARTING";
        state.startProgress = 0.0;
        break;

      case "STARTING":
        if (state.target === "NONE") {
          // No expression to start
          state.current = "NONE";
          state.phase = "IDLE";
        } else {
          // Handle interrupted transitions
          if (state.target === "NONE" && state.current !== "NONE") {
            // User wants to go back to NONE - reverse
            state.phase = "STOPPING";
            state.stopProgress = 1.0 - state.startProgress;
            break;
          }

          const params = this.transitionParams[state.target.toLowerCase()];

          // Apply stagger and variance to start progress
          let effectiveRate = params.startRate;

          // Check stagger delay
          if (this._shouldDelayForStagger(state.target, state.startProgress)) {
            return; // Still in delay period
          }

          // Apply variance
          if (this.transitionSettings.variance > 0) {
            const varianceFactor =
              1.0 + (Math.random() - 0.5) * this.transitionSettings.variance;
            effectiveRate *= varianceFactor;
          }

          state.startProgress += effectiveRate;

          if (state.startProgress >= 1.0) {
            // Fully started
            state.current = state.target;
            state.phase = "IDLE";
            state.startProgress = 1.0;
            this._clearStaggerState(state.target);
          }
        }
        break;
    }

    // Update master progress for each expression
    // Vibrato
    if (
      (state.phase === "IDLE" && state.current === "VIBRATO") ||
      (state.phase === "STARTING" && state.target === "VIBRATO")
    ) {
      this.vibratoMasterProgress =
        state.phase === "IDLE" ? 1.0 : state.startProgress;
    } else if (state.phase === "STOPPING" && state.current === "VIBRATO") {
      this.vibratoMasterProgress = 1.0 - state.stopProgress;
    } else {
      this.vibratoMasterProgress = 0.0;
    }

    // Tremolo
    if (
      (state.phase === "IDLE" && state.current === "TREMOLO") ||
      (state.phase === "STARTING" && state.target === "TREMOLO")
    ) {
      this.tremoloMasterProgress =
        state.phase === "IDLE" ? 1.0 : state.startProgress;
    } else if (state.phase === "STOPPING" && state.current === "TREMOLO") {
      this.tremoloMasterProgress = 1.0 - state.stopProgress;
    } else {
      this.tremoloMasterProgress = 0.0;
    }

    // Trill
    if (
      (state.phase === "IDLE" && state.current === "TRILL") ||
      (state.phase === "STARTING" && state.target === "TRILL")
    ) {
      this.trillMasterProgress =
        state.phase === "IDLE" ? 1.0 : state.startProgress;
    } else if (state.phase === "STOPPING" && state.current === "TRILL") {
      this.trillMasterProgress = 1.0 - state.stopProgress;
    } else {
      this.trillMasterProgress = 0.0;
    }

    // Clamp all progress values
    this.vibratoMasterProgress = Math.max(
      0.0,
      Math.min(1.0, this.vibratoMasterProgress),
    );
    this.tremoloMasterProgress = Math.max(
      0.0,
      Math.min(1.0, this.tremoloMasterProgress),
    );
    this.trillMasterProgress = Math.max(
      0.0,
      Math.min(1.0, this.trillMasterProgress),
    );
  }

  _calculateStringModeCoefficients() {
    const Fs = this.sampleRate;
    const fundamental = this._cachedFundamentalFrequency;
    const bowPos = this._cachedBowPosition || 0.1; // Default if not yet set

    // Get material properties
    const material = Math.round(this._cachedStringMaterial || 0);
    let inharmonicity, dampingFactor, brightnessScale;

    switch (material) {
      case 0: // Steel - bright, low damping, moderate inharmonicity
        inharmonicity = 0.0003;
        dampingFactor = 0.8;
        brightnessScale = 1.0;
        break;
      case 1: // Gut - warm, higher damping, very low inharmonicity
        inharmonicity = 0.00005;
        dampingFactor = 1.5;
        brightnessScale = 0.7;
        break;
      case 2: // Nylon - mellow, high damping, low inharmonicity
        inharmonicity = 0.0001;
        dampingFactor = 2.0;
        brightnessScale = 0.5;
        break;
      case 3: // Wound - complex, moderate damping, higher inharmonicity
        inharmonicity = 0.0005;
        dampingFactor = 1.2;
        brightnessScale = 0.85;
        break;
      default:
        inharmonicity = 0.0003;
        dampingFactor = 1.0;
        brightnessScale = 1.0;
    }

    // Calculate modes with proper harmonic series and damping
    for (let i = 0; i < NUM_STRING_MODES; i++) {
      // Harmonic series with material-specific inharmonicity
      const modeNumber = i + 1;
      const modeFreq =
        fundamental *
        modeNumber *
        Math.sqrt(1 + inharmonicity * modeNumber * modeNumber);

      if (modeFreq > 0 && modeFreq < Fs / 2) {
        // Q decreases with mode number (higher modes decay faster)
        const baseQ = 200 / dampingFactor;
        const modeQ =
          (baseQ / Math.sqrt(modeNumber)) *
          (1 - this._cachedStringDamping * 0.8);

        // Mode amplitude decreases with mode number, affected by material brightness
        const modeAmplitude =
          (brightnessScale * Math.pow(0.95, modeNumber - 1)) / modeNumber;

        const omega = (2 * Math.PI * modeFreq) / Fs;
        const s_omega = Math.sin(omega);
        const c_omega = Math.cos(omega);
        const alpha = s_omega / (2 * modeQ);

        const a0_norm = 1 + alpha;
        this.stringMode_b0[i] = (alpha * modeAmplitude) / a0_norm;
        this.stringMode_b1[i] = 0;
        this.stringMode_b2[i] = (-alpha * modeAmplitude) / a0_norm;
        this.stringMode_a1[i] = (-2 * c_omega) / a0_norm;
        this.stringMode_a2[i] = (1 - alpha) / a0_norm;

        this.modeAmplitudes[i] = modeAmplitude;
        this.modeFrequencies[i] = modeFreq;

        // Calculate harmonic gain based on bow position
        // Harmonics at integer multiples of 1/bowPos are suppressed
        const harmonicAtNode = Math.abs(
          Math.sin(Math.PI * modeNumber * bowPos),
        );
        this.harmonicGains[i] = harmonicAtNode;
      } else {
        // Mode is out of range, silence it
        this.stringMode_b0[i] = 0;
        this.stringMode_b1[i] = 0;
        this.stringMode_b2[i] = 0;
        this.stringMode_a1[i] = 0;
        this.stringMode_a2[i] = 0;
        this.modeAmplitudes[i] = 0;
        this.modeFrequencies[i] = 0;
        this.harmonicGains[i] = 0;
      }
    }
  }

  _calculateLpfCoefficients(dynamicBrightness = null) {
    const Fs = this.sampleRate;
    const brightness =
      dynamicBrightness !== null ? dynamicBrightness : this._cachedBrightness;

    // Map brightness to frequency range
    const minF = 200,
      maxF = Math.min(12000, Fs * 0.45);
    let actualCutoffFreq = minF * Math.pow(maxF / minF, brightness);
    actualCutoffFreq = Math.max(minF, Math.min(maxF, actualCutoffFreq));

    // Fixed reasonable Q
    const actualQ_lpf = 0.8;

    // Calculate LPF coefficients
    const omega_lpf = (2 * Math.PI * actualCutoffFreq) / Fs;
    const s_lpf = Math.sin(omega_lpf);
    const c_lpf = Math.cos(omega_lpf);
    const alpha_lpf = s_lpf / (2 * actualQ_lpf);

    const b0_lpf_coeff = (1 - c_lpf) / 2;
    const b1_lpf_coeff = 1 - c_lpf;
    const b2_lpf_coeff = (1 - c_lpf) / 2;
    const a0_lpf_coeff = 1 + alpha_lpf;
    const a1_lpf_rbj = -2 * c_lpf;
    const a2_lpf_rbj = 1 - alpha_lpf;

    this.lpf_b0 = b0_lpf_coeff / a0_lpf_coeff;
    this.lpf_b1 = b1_lpf_coeff / a0_lpf_coeff;
    this.lpf_b2 = b2_lpf_coeff / a0_lpf_coeff;
    this.lpf_a1 = a1_lpf_rbj / a0_lpf_coeff;
    this.lpf_a2 = a2_lpf_rbj / a0_lpf_coeff;
  }

  _calculateModalBodyCoefficients() {
    const Fs = this.sampleRate;
    const bodyType = Math.round(this._cachedBodyType || 0);
    const preset = this.bodyPresets[bodyType];

    for (let i = 0; i < this.numBodyModes; i++) {
      const F0_param = preset.freqs[i];
      const Q_param = preset.qs[i];
      const Gain_param = preset.gains[i];

      if (
        F0_param <= 0 ||
        F0_param >= Fs / 2 ||
        Q_param <= 0 ||
        Gain_param === 0
      ) {
        this.bodyMode_b0[i] = 1;
        this.bodyMode_b1[i] = 0;
        this.bodyMode_b2[i] = 0;
        this.bodyMode_a1[i] = 0;
        this.bodyMode_a2[i] = 0;
        continue;
      }

      const omega = (2 * Math.PI * F0_param) / Fs;
      const s_omega = Math.sin(omega);
      const c_omega = Math.cos(omega);
      const alpha = s_omega / (2 * Q_param);

      // BPF coefficients
      const b0_norm = alpha;
      const b1_norm = 0;
      const b2_norm = -alpha;
      const a0_norm = 1 + alpha;
      const a1_norm = -2 * c_omega;
      const a2_norm = 1 - alpha;

      this.bodyMode_b0[i] = (Gain_param * b0_norm) / a0_norm;
      this.bodyMode_b1[i] = (Gain_param * b1_norm) / a0_norm;
      this.bodyMode_b2[i] = (Gain_param * b2_norm) / a0_norm;
      this.bodyMode_a1[i] = a1_norm / a0_norm;
      this.bodyMode_a2[i] = a2_norm / a0_norm;
    }
  }

  _recalculateAllCoefficientsIfNeeded(parameters) {
    let needsRecalcStringModes = false; // Renamed from needsRecalcModal
    let needsRecalcLpf = false;
    let needsRecalcBody = false; // Flag for body resonator
    const tolerance = 1e-6;

    // Check AudioParams that affect string modes
    // Note: _cachedStringMaterial is updated by messages, not read from parameters here

    // Check bowPosition
    const bowPositionVal = parameters.bowPosition[0];
    if (Math.abs(bowPositionVal - this._cachedBowPosition) > tolerance) {
      this._cachedBowPosition = bowPositionVal;
      needsRecalcStringModes = true; // Bow position affects harmonic gains
    }

    // Check fundamentalFrequency INCLUDING detune
    const fundamentalFreqVal = parameters.fundamentalFrequency[0];
    const detuneAmount = parameters.detune[0];
    
    // Calculate detune multiplier for this block
    let detuneMultiplier = 1.0;
    if (this.detuneNoise && detuneAmount > 0) {
      // Apply exponential curve for more resolution near zero
      // detuneAmount^2 gives us quadratic response curve
      const scaledDetuneAmount = detuneAmount * detuneAmount;
      
      // Sample noise for this block
      const noiseValue = this.detuneNoise.noise2D(
        this.detuneNoiseTime,
        this.detuneNoise.seed * 0.0001
      );
      const semitones = noiseValue * scaledDetuneAmount * 12; // ±12 semitones max
      detuneMultiplier = Math.pow(2, semitones / 12);
    }
    
    // Calculate effective fundamental with detune
    const effectiveFundamental = fundamentalFreqVal * detuneMultiplier;
    
    // Check if effective fundamental has changed significantly
    if (
      Math.abs(effectiveFundamental - this._cachedFundamentalFrequency) > tolerance ||
      Math.abs(detuneMultiplier - this._cachedDetuneMultiplier) > 0.01 // 1% change threshold
    ) {
      this._cachedFundamentalFrequency = effectiveFundamental;
      this._cachedDetuneMultiplier = detuneMultiplier;
      this.currentDetuneMultiplier = detuneMultiplier; // Update for excitation signal
      needsRecalcStringModes = true;
    }

    // Check stringDamping
    const stringDampingVal = parameters.stringDamping[0];
    if (Math.abs(stringDampingVal - this._cachedStringDamping) > tolerance) {
      this._cachedStringDamping = stringDampingVal;
      needsRecalcStringModes = true;
    }

    // Check brightness
    const brightnessVal = parameters.brightness[0];
    if (Math.abs(brightnessVal - this._cachedBrightness) > tolerance) {
      this._cachedBrightness = brightnessVal;
      needsRecalcLpf = true;
    }

    // Check AudioParams that affect body modes
    const bodyResonanceVal = parameters.bodyResonance[0];
    if (Math.abs(bodyResonanceVal - this._cachedBodyResonance) > tolerance) {
      this._cachedBodyResonance = bodyResonanceVal;
      needsRecalcBody = true;
    }
    // Note: _cachedBodyType is updated by messages, not read from parameters here

    // Check flags for message-driven discrete changes (stringMaterial, bodyType)
    if (this._stringCoefficientsNeedRecalculation) {
      needsRecalcStringModes = true;
    }
    if (this._bodyCoefficientsNeedRecalculation) {
      needsRecalcBody = true;
    }

    // Perform recalculations
    if (needsRecalcStringModes) {
      this._calculateStringModeCoefficients();
      this._stringCoefficientsNeedRecalculation = false; // Reset flag
    }
    if (needsRecalcLpf) {
      this._calculateLpfCoefficients();
    }
    if (needsRecalcBody) {
      this._calculateModalBodyCoefficients();
      this._bodyCoefficientsNeedRecalculation = false; // Reset flag
    }
  }

  process(inputs, outputs, parameters) {
    // Process scheduled messages
    for (let i = this.scheduledMessages.length - 1; i >= 0; i--) {
      const msg = this.scheduledMessages[i];
      if (msg.startTime <= currentTime) {
        this._processMessage(msg);
        this.scheduledMessages.splice(i, 1);
      }
    }

    // Track current frame for stagger timing
    this.currentFrame++;

    // Always advance detune noise time (even when detune=0)
    this.detuneNoiseTime += (this.detuneNoiseRate * 128) / this.sampleRate;

    // Check for parameter changes (this now handles detune)
    this._recalculateAllCoefficientsIfNeeded(parameters);

    const outputChannel = outputs[0][0];
    const bowForce = parameters.bowForce[0];
    const currentBodyMix = parameters.bodyResonance[0]; // k-rate
    const brightness = parameters.brightness[0];

    // Get bow parameters
    const bowPosition = parameters.bowPosition[0];
    const bowSpeed = parameters.bowSpeed[0];
    const masterGain = parameters.masterGain[0];
    
    // Note: Detune is now handled in _recalculateAllCoefficientsIfNeeded
    // This ensures both excitation and string modes are detuned together

    // Vibrato parameters
    const vibratoEnabled = parameters.vibratoEnabled[0] > 0.5;
    const vibratoRate = parameters.vibratoRate[0];
    const vibratoDepth = parameters.vibratoDepth[0];

    // Trill parameters
    const trillEnabled = parameters.trillEnabled[0] > 0.5;
    const trillInterval = Math.round(parameters.trillInterval[0]); // 1-12 semitones
    const trillTargetSpeed = parameters.trillSpeed[0];
    const trillArticulation = parameters.trillArticulation[0]; // 0.1=separated, 0.95=connected

    // Tremolo parameters
    const tremoloEnabled = parameters.tremoloEnabled[0] > 0.5;
    const tremoloSpeed = parameters.tremoloSpeed[0];
    const tremoloDepth = parameters.tremoloDepth[0];
    const tremoloArticulation = parameters.tremoloArticulation[0]; // 0.01=extreme staccato, 0.99=extreme legato

    // Update expression state machine
    this._updateExpressionState();

    // Initialize modulations
    let pitchModulation = 1.0;
    let ampModulation = 1.0;

    // Dynamic bow physics
    // Bow force affects brightness and noise
    const forceBrightness = 0.2 + bowForce * 0.6; // Dynamic brightness from force
    const forceNoise = Math.pow(bowForce, 1.5) * 0.4; // More force = more noise

    // Bow speed affects harmonic content and smoothness
    const speedHarmonics = Math.pow(bowSpeed, 0.7);
    const speedSmoothness = bowSpeed * 0.5; // Faster = smoother

    // Calculate tone/noise mix from physical parameters
    const toneNoiseMix = Math.max(
      0.3,
      Math.min(0.95, 0.8 - forceNoise + speedSmoothness),
    );

    for (let i = 0; i < outputChannel.length; i++) {
      // Update bow envelope
      if (this.bowEnvelope < this.bowEnvelopeTarget) {
        this.bowEnvelope = Math.min(
          this.bowEnvelopeTarget,
          this.bowEnvelope + this.bowEnvelopeRate,
        );
      } else if (this.bowEnvelope > this.bowEnvelopeTarget) {
        this.bowEnvelope = Math.max(
          this.bowEnvelopeTarget,
          this.bowEnvelope - this.bowEnvelopeRate,
        );
      }

      // Reset modulations for this sample
      pitchModulation = 1.0;
      ampModulation = 1.0;

      // Process Vibrato
      if (this.vibratoMasterProgress > 0.001) {
        const state = this.expressionState;

        // Rate directly follows master progress
        const vibratoRateModFactor = this.vibratoMasterProgress;
        const effectiveVibratoRate = vibratoRate * vibratoRateModFactor;

        // Depth follows different curve
        let vibratoDepthModFactor = 0.0;
        if (
          (state.phase === "IDLE" && state.current === "VIBRATO") ||
          (state.phase === "STARTING" && state.target === "VIBRATO")
        ) {
          // Depth comes in after rate is established
          vibratoDepthModFactor = Math.pow(this.vibratoMasterProgress, 2.0);
          if (state.phase === "IDLE" && state.current === "VIBRATO") {
            vibratoDepthModFactor = 1.0;
          }
        } else if (state.phase === "STOPPING" && state.current === "VIBRATO") {
          // Depth fades early while rate is still slow
          vibratoDepthModFactor = Math.pow(this.vibratoMasterProgress, 0.2);
        }

        const effectiveVibratoDepth = vibratoDepth * vibratoDepthModFactor;

        // Always update phase
        this.vibratoPhase += effectiveVibratoRate / this.sampleRate;
        if (this.vibratoPhase >= 1.0) this.vibratoPhase -= 1.0;

        if (effectiveVibratoDepth > 0.001) {
          const vibratoValue = Math.sin(2 * Math.PI * this.vibratoPhase);
          pitchModulation = 1.0 + vibratoValue * effectiveVibratoDepth * 0.06;
          ampModulation = 1.0 + vibratoValue * effectiveVibratoDepth * 0.2;
        }
      }

      // Process Trill
      if (this.trillMasterProgress > 0.001) {
        const state = this.expressionState;

        // Rate modulation - exponential curve for very slow start
        let trillRateModFactor = this.trillMasterProgress;
        if (state.phase === "STARTING" && state.target === "TRILL") {
          // Exponential curve - stays very slow for first 60% of transition
          trillRateModFactor =
            (Math.exp(this.trillMasterProgress * 3) - 1) / (Math.exp(3) - 1);
        }
        const effectiveTrillSpeed = trillTargetSpeed * trillRateModFactor;

        // Intensity modulation
        let trillIntensityModFactor = 0.0;
        if (
          (state.phase === "IDLE" && state.current === "TRILL") ||
          (state.phase === "STARTING" && state.target === "TRILL")
        ) {
          // Let individual notes be heard clearly at slow speeds
          trillIntensityModFactor = Math.pow(this.trillMasterProgress, 3.0);
          if (state.phase === "IDLE" && state.current === "TRILL") {
            trillIntensityModFactor = 1.0;
          }
        } else if (state.phase === "STOPPING" && state.current === "TRILL") {
          trillIntensityModFactor = Math.pow(this.trillMasterProgress, 0.25);
        }

        const effectiveTrillIntensity = trillIntensityModFactor;

        // Update phase
        const timingVariation = 1.0 + (Math.random() - 0.5) * 0.1;
        const trillIncrement =
          (effectiveTrillSpeed * timingVariation) / this.sampleRate;
        this.trillPhase += trillIncrement;
        if (this.trillPhase >= 1.0) this.trillPhase -= 1.0;

        if (effectiveTrillIntensity > 0.001) {
          // Determine if we're on upper or lower note with articulation control
          // For articulation, we adjust how much of each phase is "active"
          let isActivePhase = false;
          let currentTrillState;

          if (this.trillPhase < 0.5) {
            // First half - lower note
            currentTrillState = 0;
            isActivePhase = this.trillPhase < 0.5 * trillArticulation;
          } else {
            // Second half - upper note
            currentTrillState = 1;
            const adjustedPhase = this.trillPhase - 0.5;
            isActivePhase = adjustedPhase < 0.5 * trillArticulation;
          }

          const trillTransition = currentTrillState !== this.lastTrillState;
          this.lastTrillState = currentTrillState;

          // Calculate pitch change - base note is the lower pitch
          if (currentTrillState === 1 && isActivePhase) {
            // Upper note - trill interval above base
            pitchModulation = Math.pow(2, trillInterval / 12.0);
          } else if (currentTrillState === 0 && isActivePhase) {
            // Lower note (base pitch)
            pitchModulation = 1.0;
          } else {
            // In gap - maintain previous pitch to avoid glitches
            pitchModulation =
              currentTrillState === 1 ? Math.pow(2, trillInterval / 12.0) : 1.0;
          }

          // Amplitude effects for hammer-on/lift-off with articulation
          if (!isActivePhase) {
            // In gap between notes
            ampModulation = 0.1; // Very quiet during gaps
          } else if (currentTrillState === 1) {
            // Upper note (hammered on) - much louder to compensate for psychoacoustic effects
            ampModulation = 1.5;
          } else {
            // Lower note - slightly quieter to increase contrast
            ampModulation = 0.85;
          }

          // Apply intensity to smooth enable/disable
          pitchModulation =
            1.0 + (pitchModulation - 1.0) * effectiveTrillIntensity;
          ampModulation = 1.0 + (ampModulation - 1.0) * effectiveTrillIntensity;
        }
      }

      // Process Tremolo
      if (this.tremoloMasterProgress > 0.001) {
        const state = this.expressionState;

        // Rate modulation - exponential curve for very slow start
        let tremoloRateModFactor = this.tremoloMasterProgress;
        if (state.phase === "STARTING" && state.target === "TREMOLO") {
          // Exponential curve - crawls for first half of transition
          tremoloRateModFactor =
            (Math.exp(this.tremoloMasterProgress * 2.5) - 1) /
            (Math.exp(2.5) - 1);
        }
        const effectiveTremoloSpeed = tremoloSpeed * tremoloRateModFactor;

        // Depth modulation (for amplitude intensity)
        let tremoloDepthModFactor = 0.0;
        if (
          (state.phase === "IDLE" && state.current === "TREMOLO") ||
          (state.phase === "STARTING" && state.target === "TREMOLO")
        ) {
          // Emphasize individual slow strokes at start
          tremoloDepthModFactor = Math.pow(this.tremoloMasterProgress, 2.5);
          if (state.phase === "IDLE" && state.current === "TREMOLO") {
            tremoloDepthModFactor = 1.0;
          }
        } else if (state.phase === "STOPPING" && state.current === "TREMOLO") {
          // Keep some intensity while slowing down
          tremoloDepthModFactor = Math.pow(this.tremoloMasterProgress, 0.3);
        }

        const effectiveTremoloDepth = tremoloDepth * tremoloDepthModFactor;

        // Update phase with timing variation
        const timingVariation = 1.0 + (Math.random() - 0.5) * 0.15;
        const tremoloIncrement =
          (effectiveTremoloSpeed * timingVariation) / this.sampleRate;
        this.tremoloPhase += tremoloIncrement;
        if (this.tremoloPhase >= 1.0) {
          this.tremoloPhase -= 1.0;
          if (effectiveTremoloSpeed > 0.001) this.tremoloStrokeCount++;
        }

        if (effectiveTremoloDepth > 0.001) {
          // Determine bow direction (up/down)
          const currentTremoloState = this.tremoloPhase < 0.5 ? 0 : 1;
          const tremoloTransition =
            currentTremoloState !== this.lastTremoloState;
          this.lastTremoloState = currentTremoloState;

          // Natural grouping - slight accent every 3-4 strokes
          const groupSize = 3 + Math.floor(Math.random() * 2); // 3 or 4
          const isAccented = this.tremoloStrokeCount % groupSize === 0;

          // Model bow speed changes through the stroke cycle
          // Bow slows to zero at turnaround points (0 and 0.5)
          let bowSpeedFactor = 1.0;

          // Adjust phase mapping based on articulation
          // For extreme staccato (0.01), stroke takes up only 1% of cycle
          // For extreme legato (0.99), stroke takes up 99% of cycle
          let phaseInStroke;
          if (currentTremoloState === 0) {
            // First half of cycle
            if (this.tremoloPhase < tremoloArticulation * 0.5) {
              // Active stroke portion
              phaseInStroke = this.tremoloPhase / (tremoloArticulation * 0.5);
            } else {
              // Gap portion - bow speed is zero
              phaseInStroke = 1.0;
            }
          } else {
            // Second half of cycle
            const adjustedPhase = this.tremoloPhase - 0.5;
            if (adjustedPhase < tremoloArticulation * 0.5) {
              // Active stroke portion
              phaseInStroke = adjustedPhase / (tremoloArticulation * 0.5);
            } else {
              // Gap portion - bow speed is zero
              phaseInStroke = 1.0;
            }
          }

          // Calculate bow speed based on phase
          if (phaseInStroke < 1.0) {
            // Active stroke - use raised sine for longer turnarounds
            bowSpeedFactor = Math.pow(Math.sin(phaseInStroke * Math.PI), 2.5);
          } else {
            // In gap - minimal bow speed
            bowSpeedFactor = 0.0;
          }

          // Much more aggressive scratchiness at low speeds
          const nearTurnaround = bowSpeedFactor < 0.5;
          let scratchiness = 0.0;
          if (nearTurnaround) {
            // Extreme noise and irregularity at low bow speeds
            scratchiness = Math.pow((0.5 - bowSpeedFactor) * 2.0, 1.5); // 0 to 1.4
          }

          // Calculate amplitude for tremolo - more extreme dynamics
          let tremoloAmp = 0.5 + bowSpeedFactor * 0.7; // 0.5 to 1.2

          // Create more pronounced gap at turnaround points and during gaps
          if (bowSpeedFactor < 0.15) {
            // Much quieter at direction change
            tremoloAmp = 0.05 + bowSpeedFactor * 0.5;
          } else if (phaseInStroke >= 1.0) {
            // In gap between strokes
            tremoloAmp = 0.02;
          }

          // Simulate increased bow pressure during tremolo
          const tremoloPressureBoost = 1.3;

          // Add accent on grouped notes
          if (isAccented && bowSpeedFactor > 0.5) {
            tremoloAmp += 0.2;
          }

          // Apply depth control
          tremoloAmp = 1.0 + (tremoloAmp - 1.0) * effectiveTremoloDepth;

          // Apply tremolo amplitude modulation with pressure boost
          ampModulation *= tremoloAmp * tremoloPressureBoost;

          // Store scratchiness for use in excitation
          this.tremoloScratchiness = scratchiness * effectiveTremoloDepth;
          this.tremoloBowSpeed = bowSpeedFactor;
        }
      }

      // Generate continuous bow excitation when bowing
      let excitationSignal = 0.0;

      if (this.bowEnvelope > 0.001) {
        let fundamental;
        if (this.isRampingFrequency) {
          this.freqRampProgress += this.freqRampIncrement;
          if (this.freqRampProgress >= 1.0) {
            this.freqRampProgress = 1.0;
            this.isRampingFrequency = false;
          }
          fundamental = this.freqRampStartValue + (this.freqRampTargetValue - this.freqRampStartValue) * this.freqRampProgress;
        } else {
          fundamental = parameters.fundamentalFrequency.length > 1
            ? parameters.fundamentalFrequency[i]
            : parameters.fundamentalFrequency[0];
        }

        // Apply detune and pitch vibrato only when not ramping frequency
        const detunedFundamental = fundamental * this.currentDetuneMultiplier;
        const vibratoFundamental = this.isRampingFrequency ? detunedFundamental : detunedFundamental * pitchModulation;

        // Sawtooth wave
        const sawIncrement = vibratoFundamental / this.sampleRate;
        this.sawPhase += sawIncrement;
        if (this.sawPhase >= 1.0) this.sawPhase -= 1.0;
        const sawWave = 2.0 * this.sawPhase - 1.0;

        // Create richer harmonic content based on bow speed
        let complexTone = sawWave;
        if (speedHarmonics > 0.2) {
          const harm2Phase = (this.sawPhase * 2.0) % 1.0;
          const harm3Phase = (this.sawPhase * 3.0) % 1.0;
          const harm2 = (2.0 * harm2Phase - 1.0) * 0.25 * speedHarmonics;
          const harm3 = (2.0 * harm3Phase - 1.0) * 0.1 * speedHarmonics;
          complexTone += harm2 + harm3;
        }

        // Bow stick-slip friction simulation
        const friction = (Math.random() - 0.5) * 0.3;
        const toneSignal = complexTone * 0.85 + friction * 0.15;

        // Add noise
        let noiseSignal = Math.random() * 2.0 - 1.0;

        // Add extra scratchiness during tremolo turnarounds
        if (this.tremoloActive && this.tremoloScratchiness > 0) {
          // Much more aggressive scratch noise
          const scratchNoise =
            (Math.random() - 0.5) * this.tremoloScratchiness * 2.0;
          noiseSignal =
            noiseSignal * (1.0 + this.tremoloScratchiness * 2.0) + scratchNoise;
        }

        // Mix tone and noise based on physical parameters
        let effectiveNoiseMix = toneNoiseMix;
        if (this.tremoloActive) {
          // Much more noise during tremolo, especially at low bow speeds
          effectiveNoiseMix = Math.max(
            0.2,
            Math.min(1, toneNoiseMix - 0.3 - this.tremoloScratchiness * 0.7),
          );
        }
        const mixedExcitation =
          toneSignal * effectiveNoiseMix +
          noiseSignal * (1.0 - effectiveNoiseMix);

        // Apply bow force with envelope and amplitude vibrato
        excitationSignal =
          mixedExcitation * bowForce * this.bowEnvelope * ampModulation;
      }

      // Apply excitation to all string modes
      const currentInputToFilters = excitationSignal;

      let y_n_string_modes_summed = 0.0;

      // Process each string mode resonator (biquad filter)
      for (let mode = 0; mode < NUM_STRING_MODES; mode++) {
        // Standard biquad difference equation
        const y_n_mode =
          this.stringMode_b0[mode] * currentInputToFilters +
          this.stringMode_z1_states[mode];
        this.stringMode_z1_states[mode] =
          this.stringMode_b1[mode] * currentInputToFilters -
          this.stringMode_a1[mode] * y_n_mode +
          this.stringMode_z2_states[mode];
        this.stringMode_z2_states[mode] =
          this.stringMode_b2[mode] * currentInputToFilters -
          this.stringMode_a2[mode] * y_n_mode;

        // Apply harmonic gain based on bow position
        y_n_string_modes_summed += y_n_mode * this.harmonicGains[mode];
      }

      // Scale the summed string mode output
      const stringOutput = y_n_string_modes_summed * this.outputScalingFactor;

      // Apply dynamic brightness based on bow parameters and trill
      if (this.bowEnvelope > 0.001 && i === 0) {
        let brightnessBoost = forceBrightness * 0.3;

        // Add brightness on trill hammer-ons
        if (
          this.trillActive &&
          this.lastTrillState === 1 &&
          this.trillPhase < 0.1
        ) {
          brightnessBoost += 0.2 * this.trillRampFactor;
        }

        // Add brightness changes based on tremolo bow speed
        if (this.tremoloActive) {
          // Much darker at turnarounds, brighter in middle of stroke
          brightnessBoost +=
            (this.tremoloBowSpeed - 0.5) * 0.4 * this.tremoloRampFactor;
          // Overall darker tone during tremolo (high pressure dulls the sound)
          brightnessBoost -= 0.2 * this.tremoloRampFactor;
        }

        const dynamicBrightness = Math.min(
          1.0,
          brightness * (1.0 + brightnessBoost),
        );

        if (Math.abs(dynamicBrightness - this._lastDynamicCutoff) > 0.01) {
          this._lastDynamicCutoff = dynamicBrightness;
          this._calculateLpfCoefficients(dynamicBrightness);
        }
      }

      // Apply LPF
      const y_n_lpf = this.lpf_b0 * stringOutput + this.lpf_z1;
      this.lpf_z1 =
        this.lpf_b1 * stringOutput - this.lpf_a1 * y_n_lpf + this.lpf_z2;
      this.lpf_z2 = this.lpf_b2 * stringOutput - this.lpf_a2 * y_n_lpf;

      // --- Process 3-Mode Body Resonator ---
      let y_n_body_modes_summed = 0.0;
      const inputToBody = y_n_lpf; // Output of LPF is input to the body model

      for (let ch = 0; ch < this.numBodyModes; ch++) {
        const y_n_mode_ch =
          this.bodyMode_b0[ch] * inputToBody + this.bodyMode_z1_states[ch];
        this.bodyMode_z1_states[ch] =
          this.bodyMode_b1[ch] * inputToBody -
          this.bodyMode_a1[ch] * y_n_mode_ch +
          this.bodyMode_z2_states[ch];
        this.bodyMode_z2_states[ch] =
          this.bodyMode_b2[ch] * inputToBody -
          this.bodyMode_a2[ch] * y_n_mode_ch;
        y_n_body_modes_summed += y_n_mode_ch;
      }

      // Mix LPF output (pre-body) with Body Resonator output ---
      const mixedOutput =
        y_n_lpf * (1.0 - currentBodyMix) +
        y_n_body_modes_summed * currentBodyMix;

      // Apply amplitude vibrato to final output as well (subtle)
      const finalOutput = mixedOutput * (1.0 + (ampModulation - 1.0) * 0.3);

      // Apply master gain with scaling
      const gainedOutput = finalOutput * masterGain * this.masterGainScale;

      // Soft clipping to prevent harsh distortion
      const finalSample = Math.tanh(gainedOutput * 0.5) * 2.0; // Compensate for tanh compression
      outputChannel[i] = finalSample;
    }

    // Debug output
    if (++this.debugCounter % 1000 === 0) {
      this.port.postMessage({
        type: "debug",
        state: this.expressionState,
        progress: {
          vibrato: this.vibratoMasterProgress.toFixed(3),
          tremolo: this.tremoloMasterProgress.toFixed(3),
          trill: this.trillMasterProgress.toFixed(3),
        },
        transitionSettings: this.transitionSettings,
        staggerDelays: this.staggerDelays,
      });
    }

    return true;
  }
}

registerProcessor(
  "continuous-excitation-processor",
  ContinuousExcitationProcessor,
);
