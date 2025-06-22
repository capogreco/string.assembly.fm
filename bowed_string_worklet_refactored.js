const NUM_STRING_MODES = 16;

class ContinuousExcitationProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "fundamentalFrequency",
        defaultValue: 440,
        minValue: 20,
        maxValue: 4000,
        automationRate: "a-rate",
      },
      {
        name: "stringDamping",
        defaultValue: 0.0001,
        minValue: 0.00001,
        maxValue: 0.01,
        automationRate: "k-rate",
      },
      {
        name: "brightness",
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
      {
        name: "bowPosition",
        defaultValue: 0.75,
        minValue: 0.1,
        maxValue: 0.9,
        automationRate: "k-rate",
      },
      {
        name: "bowForce",
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
      {
        name: "bowSpeed",
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
      {
        name: "stringMaterial",
        defaultValue: 0,
        minValue: 0,
        maxValue: 4,
        automationRate: "k-rate",
      },
      {
        name: "bodyType",
        defaultValue: 0,
        minValue: 0,
        maxValue: 4,
        automationRate: "k-rate",
      },
      {
        name: "bodyResonance",
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
      {
        name: "masterGain",
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
      // Vibrato parameters
      {
        name: "vibratoEnabled",
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
      {
        name: "vibratoRate",
        defaultValue: 5,
        minValue: 0.1,
        maxValue: 15,
        automationRate: "k-rate",
      },
      {
        name: "vibratoDepth",
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
      // Trill parameters
      {
        name: "trillEnabled",
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
      {
        name: "trillInterval",
        defaultValue: 2,
        minValue: 1,
        maxValue: 12,
        automationRate: "k-rate",
      },
      {
        name: "trillSpeed",
        defaultValue: 6,
        minValue: 3,
        maxValue: 15,
        automationRate: "k-rate",
      },
      {
        name: "trillArticulation",
        defaultValue: 0.5,
        minValue: 0.1,
        maxValue: 0.95,
        automationRate: "k-rate",
      },
      // Tremolo parameters
      {
        name: "tremoloEnabled",
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
      {
        name: "tremoloSpeed",
        defaultValue: 10,
        minValue: 2,
        maxValue: 30,
        automationRate: "k-rate",
      },
      {
        name: "tremoloDepth",
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
      {
        name: "tremoloArticulation",
        defaultValue: 0.5,
        minValue: 0.01,
        maxValue: 0.99,
        automationRate: "k-rate",
      },
    ];
  }

  constructor(options) {
    super(options);
    this.sampleRate = sampleRate;

    // Initialize cached parameters
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
    this._cachedStringMaterial = descriptors.find(
      (p) => p.name === "stringMaterial",
    ).defaultValue;
    this._cachedBodyType = descriptors.find(
      (p) => p.name === "bodyType",
    ).defaultValue;

    // String resonator arrays
    this.stringMode_b0 = new Float32Array(NUM_STRING_MODES);
    this.stringMode_b1 = new Float32Array(NUM_STRING_MODES);
    this.stringMode_b2 = new Float32Array(NUM_STRING_MODES);
    this.stringMode_a1 = new Float32Array(NUM_STRING_MODES);
    this.stringMode_a2 = new Float32Array(NUM_STRING_MODES);
    this.stringMode_z1_states = new Float32Array(NUM_STRING_MODES);
    this.stringMode_z2_states = new Float32Array(NUM_STRING_MODES);
    this.modeFrequencies = new Float32Array(NUM_STRING_MODES);
    this.modeAmplitudes = new Float32Array(NUM_STRING_MODES);

    // Bow state
    this.isBowing = false;
    this.sawPhase = 0.0;
    this.pulsePhase = 0.0;
    this.harmonicGains = new Float32Array(NUM_STRING_MODES);
    this._lastDynamicCutoff = 0.5;
    this.bowEnvelope = 0.0;
    this.bowEnvelopeTarget = 0.0;
    this.bowEnvelopeRate = 0.005;

    // Expression system - NEW ARCHITECTURE
    this.expressionMixer = new ExpressionMixer(this.sampleRate);

    // LPF state
    this.lpf_b0 = 1;
    this.lpf_b1 = 0;
    this.lpf_b2 = 0;
    this.lpf_a1 = 0;
    this.lpf_a2 = 0;
    this.lpf_z1 = 0;
    this.lpf_z2 = 0;

    // Body resonator initialization
    this.bodyPresets = [
      {
        freqs: [280, 460, 580, 700, 840],
        qs: [12, 15, 10, 8, 8],
        gains: [1.0, 0.8, 0.7, 0.5, 0.3],
      },
      {
        freqs: [220, 380, 500, 650, 780],
        qs: [10, 12, 9, 7, 7],
        gains: [1.0, 0.85, 0.7, 0.5, 0.3],
      },
      {
        freqs: [100, 200, 300, 400, 500],
        qs: [8, 10, 8, 6, 6],
        gains: [1.0, 0.9, 0.8, 0.6, 0.4],
      },
      {
        freqs: [100, 200, 400, 500, 600],
        qs: [15, 12, 10, 8, 8],
        gains: [1.0, 0.7, 0.8, 0.5, 0.4],
      },
      {
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

    this.outputScalingFactor = 0.3;
    this.masterGainScale = 10.0;

    // Calculate initial coefficients
    this._calculateStringModeCoefficients();
    this._calculateLpfCoefficients();
    this._calculateModalBodyCoefficients();

    this.port.onmessage = this._handleMessage.bind(this);
  }

  _handleMessage(event) {
    if (event.data.type === "startBowing") {
      this.isBowing = true;
      this.bowEnvelopeTarget = 1.0;
    } else if (event.data.type === "stopBowing") {
      this.isBowing = false;
      this.bowEnvelopeTarget = 0.0;
    }
  }

  _resetBodyModeStates() {
    this.bodyMode_z1_states.fill(0);
    this.bodyMode_z2_states.fill(0);
  }

  _resetLpfState() {
    this.lpf_z1 = 0;
    this.lpf_z2 = 0;
  }

  _resetStringModeStates() {
    this.stringMode_z1_states.fill(0);
    this.stringMode_z2_states.fill(0);
  }

  _calculateStringModeCoefficients() {
    const fundamental = this._cachedFundamentalFrequency;
    const damping = this._cachedStringDamping;
    const stringMaterial = Math.floor(this._cachedStringMaterial);

    const materials = [
      { inharmonicity: 0.0005, dampingScale: 1.0 },
      { inharmonicity: 0.0003, dampingScale: 0.8 },
      { inharmonicity: 0.0001, dampingScale: 0.6 },
      { inharmonicity: 0.001, dampingScale: 1.2 },
      { inharmonicity: 0.00001, dampingScale: 0.5 },
    ];

    const material =
      materials[Math.min(Math.max(0, stringMaterial), materials.length - 1)];

    for (let mode = 0; mode < NUM_STRING_MODES; mode++) {
      const modeNumber = mode + 1;
      const stretchFactor = Math.sqrt(
        1 + material.inharmonicity * modeNumber * modeNumber,
      );
      const modalFreq = fundamental * modeNumber * stretchFactor;
      this.modeFrequencies[mode] = modalFreq;

      const frequencyDamping = 1.0 + Math.pow(modeNumber / 8.0, 2);
      const modalDecay = damping * material.dampingScale * frequencyDamping;
      const a = Math.exp(-modalDecay);
      const r = 0.999 * a;

      const omega = (2 * Math.PI * modalFreq) / this.sampleRate;
      const cosOmega = Math.cos(omega);

      this.stringMode_b0[mode] = 1;
      this.stringMode_b1[mode] = 0;
      this.stringMode_b2[mode] = -1;
      this.stringMode_a1[mode] = -2 * r * cosOmega;
      this.stringMode_a2[mode] = r * r;

      const baseAmplitude = 1.0 / modeNumber;
      const brightnessFactor = Math.pow(2, -(modeNumber - 1) * 0.5);
      this.modeAmplitudes[mode] = baseAmplitude * brightnessFactor;
    }

    this._updateHarmonicGains();
  }

  _updateHarmonicGains() {
    const bowPos = this._cachedBowPosition;
    for (let mode = 0; mode < NUM_STRING_MODES; mode++) {
      const modeNumber = mode + 1;
      const suppressionFactor =
        Math.abs(Math.sin((modeNumber * Math.PI * bowPos) / 2)) + 0.1;
      this.harmonicGains[mode] = this.modeAmplitudes[mode] * suppressionFactor;
    }
  }

  _calculateLpfCoefficients(dynamicCutoff) {
    const cutoff =
      dynamicCutoff !== undefined ? dynamicCutoff : this._cachedBrightness;
    const minFreq = 200;
    const maxFreq = 8000;
    const cutoffFreq = minFreq + (maxFreq - minFreq) * cutoff * cutoff;

    const omega = (2 * Math.PI * cutoffFreq) / this.sampleRate;
    const cosOmega = Math.cos(omega);
    const sinOmega = Math.sin(omega);
    const Q = 0.7071;
    const alpha = sinOmega / (2 * Q);

    const b0 = (1 - cosOmega) / 2;
    const b1 = 1 - cosOmega;
    const b2 = (1 - cosOmega) / 2;
    const a0 = 1 + alpha;
    const a1 = -2 * cosOmega;
    const a2 = 1 - alpha;

    this.lpf_b0 = b0 / a0;
    this.lpf_b1 = b1 / a0;
    this.lpf_b2 = b2 / a0;
    this.lpf_a1 = a1 / a0;
    this.lpf_a2 = a2 / a0;
  }

  _calculateModalBodyCoefficients() {
    const bodyType = Math.floor(this._cachedBodyType);
    const preset =
      this.bodyPresets[
        Math.min(Math.max(0, bodyType), this.bodyPresets.length - 1)
      ];

    for (let ch = 0; ch < this.numBodyModes; ch++) {
      const freq = preset.freqs[ch];
      const Q = preset.qs[ch];
      const gain = preset.gains[ch];

      const omega = (2 * Math.PI * freq) / this.sampleRate;
      const cosOmega = Math.cos(omega);
      const sinOmega = Math.sin(omega);
      const alpha = sinOmega / (2 * Q);

      const b0 = alpha * gain;
      const b1 = 0;
      const b2 = -alpha * gain;
      const a0 = 1 + alpha;
      const a1 = -2 * cosOmega;
      const a2 = 1 - alpha;

      this.bodyMode_b0[ch] = b0 / a0;
      this.bodyMode_b1[ch] = b1 / a0;
      this.bodyMode_b2[ch] = b2 / a0;
      this.bodyMode_a1[ch] = a1 / a0;
      this.bodyMode_a2[ch] = a2 / a0;
    }
  }

  _recalculateAllCoefficientsIfNeeded(parameters) {
    let needsStringRecalc = false;
    let needsLpfRecalc = false;
    let needsBodyRecalc = false;
    let needsHarmonicUpdate = false;

    if (
      parameters.fundamentalFrequency[0] !== this._cachedFundamentalFrequency
    ) {
      this._cachedFundamentalFrequency = parameters.fundamentalFrequency[0];
      needsStringRecalc = true;
    }

    if (parameters.stringDamping[0] !== this._cachedStringDamping) {
      this._cachedStringDamping = parameters.stringDamping[0];
      needsStringRecalc = true;
    }

    if (parameters.brightness[0] !== this._cachedBrightness) {
      this._cachedBrightness = parameters.brightness[0];
      needsLpfRecalc = true;
    }

    if (parameters.bowPosition[0] !== this._cachedBowPosition) {
      this._cachedBowPosition = parameters.bowPosition[0];
      needsHarmonicUpdate = true;
    }

    if (parameters.stringMaterial[0] !== this._cachedStringMaterial) {
      this._cachedStringMaterial = parameters.stringMaterial[0];
      needsStringRecalc = true;
    }

    if (parameters.bodyType[0] !== this._cachedBodyType) {
      this._cachedBodyType = parameters.bodyType[0];
      needsBodyRecalc = true;
    }

    if (needsStringRecalc) {
      this._calculateStringModeCoefficients();
    } else if (needsHarmonicUpdate) {
      this._updateHarmonicGains();
    }

    if (needsLpfRecalc) {
      this._calculateLpfCoefficients();
    }

    if (needsBodyRecalc) {
      this._calculateModalBodyCoefficients();
    }
  }

  process(inputs, outputs, parameters) {
    this._recalculateAllCoefficientsIfNeeded(parameters);

    const outputChannel = outputs[0][0];
    const bowForce = parameters.bowForce[0];
    const currentBodyMix = parameters.bodyResonance[0];
    const brightness = parameters.brightness[0];
    const bowPosition = parameters.bowPosition[0];
    const bowSpeed = parameters.bowSpeed[0];
    const masterGain = parameters.masterGain[0];

    // Get expression modulations using the new mixer
    const expressionParams = {
      vibratoEnabled: parameters.vibratoEnabled,
      vibratoRate: parameters.vibratoRate,
      vibratoDepth: parameters.vibratoDepth,
      trillEnabled: parameters.trillEnabled,
      trillInterval: parameters.trillInterval,
      trillSpeed: parameters.trillSpeed,
      trillArticulation: parameters.trillArticulation,
      tremoloEnabled: parameters.tremoloEnabled,
      tremoloSpeed: parameters.tremoloSpeed,
      tremoloDepth: parameters.tremoloDepth,
      tremoloArticulation: parameters.tremoloArticulation,
    };

    // Dynamic bow physics
    const forceBrightness = 0.2 + bowForce * 0.6;
    const forceNoise = Math.pow(bowForce, 1.5) * 0.4;
    const speedHarmonics = Math.pow(bowSpeed, 0.7);
    const speedSmoothness = bowSpeed * 0.5;
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

      // Get expression modulations for this sample
      const modulations = this.expressionMixer.processSample(expressionParams);

      // Generate continuous bow excitation
      let excitationSignal = 0.0;

      if (this.bowEnvelope > 0.001) {
        const fundamental =
          parameters.fundamentalFrequency.length > 1
            ? parameters.fundamentalFrequency[i]
            : parameters.fundamentalFrequency[0];

        // Apply pitch modulation from expressions
        const modulatedFundamental = fundamental * modulations.pitch;

        // Sawtooth wave
        const sawIncrement = modulatedFundamental / this.sampleRate;
        this.sawPhase += sawIncrement;
        if (this.sawPhase >= 1.0) this.sawPhase -= 1.0;
        const sawWave = 2.0 * this.sawPhase - 1.0;

        // Create richer harmonic content
        let complexTone = sawWave;
        if (speedHarmonics > 0.2) {
          const harm2Phase = (this.sawPhase * 2.0) % 1.0;
          const harm3Phase = (this.sawPhase * 3.0) % 1.0;
          const harm2 = (2.0 * harm2Phase - 1.0) * 0.25 * speedHarmonics;
          const harm3 = (2.0 * harm3Phase - 1.0) * 0.1 * speedHarmonics;
          complexTone += harm2 + harm3;
        }

        // Bow friction simulation
        const friction = (Math.random() - 0.5) * 0.3;
        const toneSignal = complexTone * 0.85 + friction * 0.15;

        // Add noise with expression-based modifications
        let noiseSignal = Math.random() * 2.0 - 1.0;

        // Add any additional noise from expressions (e.g., tremolo scratchiness)
        if (modulations.additionalNoise) {
          noiseSignal *= 1.0 + modulations.additionalNoise;
        }

        // Mix tone and noise
        let effectiveNoiseMix = toneNoiseMix;
        if (modulations.noiseMixAdjust) {
          effectiveNoiseMix = Math.max(
            0.2,
            Math.min(1, toneNoiseMix + modulations.noiseMixAdjust),
          );
        }

        const mixedExcitation =
          toneSignal * effectiveNoiseMix +
          noiseSignal * (1.0 - effectiveNoiseMix);

        // Apply force, envelope, and amplitude modulation
        excitationSignal =
          mixedExcitation * bowForce * this.bowEnvelope * modulations.amplitude;
      }

      // Process string modes
      let y_n_string_modes_summed = 0.0;
      const currentInputToFilters = excitationSignal;

      for (let mode = 0; mode < NUM_STRING_MODES; mode++) {
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

        y_n_string_modes_summed += y_n_mode * this.harmonicGains[mode];
      }

      const stringOutput = y_n_string_modes_summed * this.outputScalingFactor;

      // Apply dynamic brightness
      if (this.bowEnvelope > 0.001 && i === 0) {
        let brightnessBoost = forceBrightness * 0.3;

        // Add any brightness modifications from expressions
        if (modulations.brightnessAdjust) {
          brightnessBoost += modulations.brightnessAdjust;
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

      // Process body resonator
      let y_n_body_modes_summed = 0.0;
      const inputToBody = y_n_lpf;

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

      // Mix pre-body and post-body signals
      const mixedOutput =
        y_n_lpf * (1.0 - currentBodyMix) +
        y_n_body_modes_summed * currentBodyMix;

      // Apply final gain and soft clipping
      const gainedOutput = mixedOutput * masterGain * this.masterGainScale;
      const finalSample = Math.tanh(gainedOutput * 0.5) * 2.0;
      outputChannel[i] = finalSample;
    }

    return true;
  }
}

// Expression Mixer - handles smooth transitions between expression states
class ExpressionMixer {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;

    // Expression processors
    this.vibrato = new VibratoProcessor(sampleRate);
    this.tremolo = new TremoloProcessor(sampleRate);
    this.trill = new TrillProcessor(sampleRate);

    // Smooth mixing levels
    this.vibratoMix = 0.0;
    this.tremoloMix = 0.0;
    this.trillMix = 0.0;

    // Transition smoothing (100ms)
    this.transitionRate = 1.0 / (sampleRate * 0.1);
  }

  processSample(parameters) {
    // Update mix levels smoothly
    const vibratoTarget = parameters.vibratoEnabled[0] > 0.5 ? 1.0 : 0.0;
    const tremoloTarget = parameters.tremoloEnabled[0] > 0.5 ? 1.0 : 0.0;
    const trillTarget = parameters.trillEnabled[0] > 0.5 ? 1.0 : 0.0;

    this.vibratoMix += (vibratoTarget - this.vibratoMix) * this.transitionRate;
    this.tremoloMix += (tremoloTarget - this.tremoloMix) * this.transitionRate;
    this.trillMix += (trillTarget - this.trillMix) * this.transitionRate;

    // Process each expression
    const vibratoOut = this.vibrato.process(
      parameters.vibratoRate[0],
      parameters.vibratoDepth[0],
    );

    const tremoloOut = this.tremolo.process(
      parameters.tremoloSpeed[0],
      parameters.tremoloDepth[0],
      parameters.tremoloArticulation[0],
    );

    const trillOut = this.trill.process(
      parameters.trillSpeed[0],
      parameters.trillInterval[0],
      parameters.trillArticulation[0],
    );

    // Mix contributions
    let pitchMod = 1.0;
    let ampMod = 1.0;
    let additionalNoise = 0.0;
    let noiseMixAdjust = 0.0;
    let brightnessAdjust = 0.0;

    // Apply vibrato
    if (this.vibratoMix > 0.001) {
      const vibratoStrength = this.vibratoMix * parameters.vibratoDepth[0];
      pitchMod *= 1.0 + (vibratoOut.pitch - 1.0) * vibratoStrength;
      ampMod *= 1.0 + (vibratoOut.amplitude - 1.0) * vibratoStrength;
    }

    // Apply tremolo
    if (this.tremoloMix > 0.001) {
      const tremoloStrength = this.tremoloMix * parameters.tremoloDepth[0];
      ampMod *= 1.0 + (tremoloOut.amplitude - 1.0) * tremoloStrength;
      additionalNoise += tremoloOut.scratchiness * this.tremoloMix;
      noiseMixAdjust += tremoloOut.noiseMixAdjust * this.tremoloMix;
      brightnessAdjust += tremoloOut.brightnessAdjust * this.tremoloMix;
    }

    // Apply trill
    if (this.trillMix > 0.001) {
      pitchMod *= 1.0 + (trillOut.pitch - 1.0) * this.trillMix;
      ampMod *= 1.0 + (trillOut.amplitude - 1.0) * this.trillMix;
      brightnessAdjust += trillOut.brightnessBoost * this.trillMix;
    }

    return {
      pitch: pitchMod,
      amplitude: ampMod,
      additionalNoise: additionalNoise,
      noiseMixAdjust: noiseMixAdjust,
      brightnessAdjust: brightnessAdjust,
    };
  }
}

// Individual expression processors
class VibratoProcessor {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.phase = 0.0;
  }

  process(rate, depth) {
    // Always update phase continuously
    const increment = rate / this.sampleRate;
    this.phase += increment;
    if (this.phase >= 1.0) this.phase -= 1.0;

    const vibratoValue = Math.sin(2 * Math.PI * this.phase);

    // Return modulation values (caller will apply depth)
    return {
      pitch: 1.0 + vibratoValue * 0.06, // ±6% pitch
      amplitude: 1.0 + vibratoValue * 0.2, // ±20% amplitude
    };
  }
}

class TremoloProcessor {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.phase = 0.0;
    this.strokeCount = 0;
    this.lastState = 0;
  }

  process(speed, depth, articulation) {
    // Always update phase
    const timingVariation = 1.0 + (Math.random() - 0.5) * 0.15;
    const increment = (speed * timingVariation) / this.sampleRate;

    this.phase += increment;
    if (this.phase >= 1.0) {
      this.phase -= 1.0;
      this.strokeCount++;
    }

    // Determine bow direction
    const currentState = this.phase < 0.5 ? 0 : 1;
    const stateChanged = currentState !== this.lastState;
    this.lastState = currentState;

    // Natural grouping
    const groupSize = 3 + Math.floor(Math.random() * 2);
    const isAccented = this.strokeCount % groupSize === 0;

    // Calculate phase within stroke
    let phaseInStroke;
    if (currentState === 0) {
      if (this.phase < articulation * 0.5) {
        phaseInStroke = this.phase / (articulation * 0.5);
      } else {
        phaseInStroke = 1.0;
      }
    } else {
      const adjustedPhase = this.phase - 0.5;
      if (adjustedPhase < articulation * 0.5) {
        phaseInStroke = adjustedPhase / (articulation * 0.5);
      } else {
        phaseInStroke = 1.0;
      }
    }

    // Calculate bow speed
    let bowSpeedFactor = 0.0;
    if (phaseInStroke < 1.0) {
      bowSpeedFactor = Math.pow(Math.sin(phaseInStroke * Math.PI), 2.5);
    }

    // Calculate scratchiness
    let scratchiness = 0.0;
    if (bowSpeedFactor < 0.5) {
      scratchiness = Math.pow((0.5 - bowSpeedFactor) * 2.0, 1.5);
    }

    // Calculate amplitude
    let tremoloAmp = 0.5 + bowSpeedFactor * 0.7;
    if (bowSpeedFactor < 0.15) {
      tremoloAmp = 0.05 + bowSpeedFactor * 0.5;
    } else if (phaseInStroke >= 1.0) {
      tremoloAmp = 0.02;
    }

    if (isAccented && bowSpeedFactor > 0.5) {
      tremoloAmp += 0.2;
    }

    const tremoloPressureBoost = 1.3;

    return {
      pitch: 1.0, // Tremolo doesn't affect pitch
      amplitude: tremoloAmp * tremoloPressureBoost,
      scratchiness: scratchiness,
      noiseMixAdjust: -0.3 - scratchiness * 0.7,
      brightnessAdjust: (bowSpeedFactor - 0.5) * 0.4 - 0.2,
    };
  }
}

class TrillProcessor {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.phase = 0.0;
    this.lastState = 0;
    this.currentSpeed = 3.0;
  }

  process(targetSpeed, interval, articulation) {
    // Smooth speed changes
    this.currentSpeed += (targetSpeed - this.currentSpeed) * 0.01;

    // Update phase with timing variations
    const timingVariation = 1.0 + (Math.random() - 0.5) * 0.1;
    const increment = (this.currentSpeed * timingVariation) / this.sampleRate;

    this.phase += increment;
    if (this.phase >= 1.0) {
      this.phase -= 1.0;
    }

    // Determine note state
    let isActivePhase = false;
    let currentState;

    if (this.phase < 0.5) {
      currentState = 0;
      isActivePhase = this.phase < 0.5 * articulation;
    } else {
      currentState = 1;
      const adjustedPhase = this.phase - 0.5;
      isActivePhase = adjustedPhase < 0.5 * articulation;
    }

    const stateChanged = currentState !== this.lastState;
    this.lastState = currentState;

    // Calculate pitch modulation
    let pitchMod;
    if (currentState === 1 && isActivePhase) {
      pitchMod = Math.pow(2, interval / 12.0);
    } else if (currentState === 0 && isActivePhase) {
      pitchMod = 1.0;
    } else {
      // Maintain previous pitch in gaps
      pitchMod = currentState === 1 ? Math.pow(2, interval / 12.0) : 1.0;
    }

    // Calculate amplitude
    let ampMod;
    if (!isActivePhase) {
      ampMod = 0.1;
    } else if (currentState === 1) {
      ampMod = 1.5;
    } else {
      ampMod = 0.85;
    }

    // Brightness boost on hammer-ons
    let brightnessBoost = 0.0;
    if (currentState === 1 && this.phase < 0.1) {
      brightnessBoost = 0.2;
    }

    return {
      pitch: pitchMod,
      amplitude: ampMod,
      brightnessBoost: brightnessBoost,
    };
  }
}

registerProcessor(
  "continuous-excitation-processor",
  ContinuousExcitationProcessor,
);
