// reverb-processor.js - FDN (Feedback Delay Network) Reverb for AudioWorklet

class FDNReverbProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "mix",
        defaultValue: 0.3,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: "k-rate",
      },
      {
        name: "roomSize",
        defaultValue: 0.5,
        minValue: 0.1,
        maxValue: 0.95,
        automationRate: "k-rate",
      },
      {
        name: "decay",
        defaultValue: 0.5,
        minValue: 0.0,
        maxValue: 0.9,
        automationRate: "k-rate",
      }, // Max decay capped
      {
        name: "damping",
        defaultValue: 0.5,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: "k-rate",
      },
      {
        name: "preDelay",
        defaultValue: 10,
        minValue: 0,
        maxValue: 100,
        automationRate: "k-rate",
      }, // ms
      {
        name: "diffusion",
        defaultValue: 0.7,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: "k-rate",
      },
      {
        name: "modulation",
        defaultValue: 0.2,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: "k-rate",
      },
      {
        name: "earlyLevel",
        defaultValue: 0.5,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: "k-rate",
      },
    ];
  }

  constructor() {
    super();
    this.sampleRate = sampleRate; // Global in AudioWorkletGlobalScope

    // Enhanced 12-delay FDN with prime number lengths (in samples)
    // More delays = smoother, denser reverb
    this.baseDelayLengths = [
      1237,
      1381,
      1607,
      1949, // Original 4
      2237,
      2671,
      2903,
      3271, // Additional 4 for density
      3469,
      3697,
      3929,
      4177, // Additional 4 for ultra-smooth decay
    ];

    // Initialize delay lines
    this.delayLines = this.baseDelayLengths.map((length) => ({
      buffer: new Float32Array(Math.ceil(length * 3)), // Extra space for room size scaling and modulation
      writeIndex: 0,
      length: length,
      currentLength: length, // For smooth size changes
      targetLength: length, // For smooth size changes
      fadeBuffer: new Float32Array(Math.ceil(length * 3)), // Secondary buffer for crossfading
      fadeWriteIndex: 0,
      isFading: false,
      fadeProgress: 0.0,
      fadeRate: 0.001, // Very slow fade to prevent artifacts
    }));

    // 12x12 Hadamard-inspired orthogonal matrix for 12 delays
    // Using a combination of Hadamard patterns for good diffusion
    // Slightly increased normalization factor for better energy preservation
    const s = 0.35; // Increased from 1/sqrt(12) ≈ 0.289 for more energy
    this.mixMatrix = [
      [s, s, s, s, s, s, s, s, s, s, s, s],
      [s, -s, s, -s, s, -s, s, -s, s, -s, s, -s],
      [s, s, -s, -s, s, s, -s, -s, s, s, -s, -s],
      [s, -s, -s, s, s, -s, -s, s, s, -s, -s, s],
      [s, s, s, s, -s, -s, -s, -s, s, s, s, s],
      [s, -s, s, -s, -s, s, -s, s, s, -s, s, -s],
      [s, s, -s, -s, -s, -s, s, s, s, s, -s, -s],
      [s, -s, -s, s, -s, s, s, -s, s, -s, -s, s],
      [s, s, s, s, s, s, s, s, -s, -s, -s, -s],
      [s, -s, s, -s, s, -s, s, -s, -s, s, -s, s],
      [s, s, -s, -s, s, s, -s, -s, -s, -s, s, s],
      [s, -s, -s, s, s, -s, -s, s, -s, s, s, -s],
    ];

    // Simple one-pole lowpass filters for damping (one per delay line)
    this.dampingFilters = this.delayLines.map(() => ({
      state: 0,
    }));

    // Input diffusion allpass filters
    this.inputAllpass = [
      { buffer: new Float32Array(142), index: 0, gain: 0.7 },
      { buffer: new Float32Array(107), index: 0, gain: 0.7 },
      { buffer: new Float32Array(379), index: 0, gain: 0.7 },
      { buffer: new Float32Array(277), index: 0, gain: 0.7 },
    ];

    // Modulation LFOs (one per delay line)
    this.modLFOs = this.delayLines.map((_, i) => ({
      phase: Math.random(), // Random start phase
      rate: 0.5 + i * 0.13, // Slightly different rates
    }));

    // Early reflections tap delays (in ms, converted to samples)
    this.earlyReflections = [
      { delay: 7, gain: 0.9, pan: -0.5 }, // Left wall
      { delay: 11, gain: 0.85, pan: 0.5 }, // Right wall
      { delay: 19, gain: 0.8, pan: -0.3 }, // Left-center
      { delay: 23, gain: 0.75, pan: 0.3 }, // Right-center
      { delay: 31, gain: 0.7, pan: -0.7 }, // Far left
      { delay: 37, gain: 0.65, pan: 0.7 }, // Far right
      { delay: 43, gain: 0.6, pan: 0.0 }, // Back wall
      { delay: 53, gain: 0.55, pan: -0.2 }, // Left rear
      { delay: 61, gain: 0.5, pan: 0.2 }, // Right rear
      { delay: 71, gain: 0.45, pan: 0.0 }, // Ceiling
    ];

    // Convert delays to samples and create buffers
    this.earlyReflections = this.earlyReflections.map((tap) => ({
      buffer: new Float32Array(Math.ceil((tap.delay * this.sampleRate) / 1000)),
      writeIndex: 0,
      gain: tap.gain,
      pan: tap.pan,
    }));

    // Pre-delay line
    this.preDelaySize = Math.ceil(0.1 * this.sampleRate); // Max 100ms
    this.preDelayBuffer = new Float32Array(this.preDelaySize);
    this.preDelayWriteIndex = 0;

    // Cached parameter values
    this._cachedRoomSize = 0.5;
    this._cachedDecay = 0.5; // Will be capped by descriptor
    this._cachedDamping = 0.5;
    this._cachedPreDelay = 10;
    this._cachedDiffusion = 0.7;
    this._cachedModulation = 0.2;
    this._cachedEarlyLevel = 0.5;

    // DC Blocking HPF states
    this.dcBlockInput = { x1: 0, y1: 0 };
    this.dcBlockFeedback = this.delayLines.map(() => ({ x1: 0, y1: 0 }));

    // Update delay lengths based on initial room size
    this._updateDelayLengths();
  }

  _updateDelayLengths() {
    const sizeMultiplier = 0.5 + this._cachedRoomSize * 1.5; // 0.5x to 2x

    for (let i = 0; i < this.delayLines.length; i++) {
      const newLength = Math.floor(this.baseDelayLengths[i] * sizeMultiplier);
      // Ensure we don't exceed buffer size minus modulation headroom
      const maxSafeLength = this.delayLines[i].buffer.length - 10;

      const targetLength = Math.min(newLength, maxSafeLength);

      // Only start a fade if the change is significant
      if (Math.abs(targetLength - this.delayLines[i].currentLength) > 5) {
        const delay = this.delayLines[i];

        // Copy current buffer to fade buffer
        delay.fadeBuffer.set(delay.buffer);
        delay.fadeWriteIndex = delay.writeIndex;

        // Start crossfade
        delay.targetLength = targetLength;
        delay.isFading = true;
        delay.fadeProgress = 0.0;

        // Adjust fade rate based on size of change
        const changeMagnitude =
          Math.abs(targetLength - delay.currentLength) / delay.currentLength;
        delay.fadeRate = Math.min(0.002, 0.0005 + changeMagnitude * 0.001);
      }
    }
  }

  _processDampingFilter(input, filterIndex) {
    // Simple one-pole lowpass: y[n] = x[n] * (1-d) + y[n-1] * d
    const damping = this._cachedDamping;
    const filter = this.dampingFilters[filterIndex];

    filter.state = input * (1 - damping) + filter.state * damping;
    return filter.state;
  }

  _processDCBlock(input, hpf) {
    // Simple 1st order HPF: y[n] = x[n] - x[n-1] + R * y[n-1]
    // R is typically close to 1, e.g., 0.995
    const R = 0.995;
    const output = input - hpf.x1 + R * hpf.y1;
    hpf.x1 = input;
    hpf.y1 = output;
    return output;
  }

  _processAllpass(input, allpass) {
    // Allpass filter for diffusion
    const delayed = allpass.buffer[allpass.index];
    const output = -input + delayed;
    allpass.buffer[allpass.index] = input + delayed * allpass.gain;
    allpass.index = (allpass.index + 1) % allpass.buffer.length;
    return output;
  }

  _processInputDiffusion(input) {
    // Process through cascade of allpass filters
    let signal = input;
    const diffusionAmount = this._cachedDiffusion;

    for (let i = 0; i < this.inputAllpass.length; i++) {
      const wet = this._processAllpass(signal, this.inputAllpass[i]);
      signal = signal * (1 - diffusionAmount) + wet * diffusionAmount;
    }

    return signal;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    // Handle mono or stereo input
    const inputChannelCount = input.length;
    const outputChannelCount = output.length;

    if (inputChannelCount === 0 || outputChannelCount === 0) {
      return true;
    }

    // Get parameters
    const mix = parameters.mix[0];
    const roomSize = parameters.roomSize[0];
    const decay = parameters.decay[0];
    const damping = parameters.damping[0];
    const preDelayMs = parameters.preDelay[0];
    const diffusion = parameters.diffusion[0];
    const modulation = parameters.modulation[0];
    const earlyLevel = parameters.earlyLevel[0];

    // Update cached values if changed with safety limits
    if (Math.abs(roomSize - this._cachedRoomSize) > 0.001) {
      this._cachedRoomSize = Math.max(0.1, Math.min(0.95, roomSize)); // Limit room size for stability
      this._updateDelayLengths(); // This sets targetLength for delay lines
      // No separate sizeChangeSmoothing needed here, interpolation is in process()
    }
    // The 'decay' parameter is capped by its descriptor's maxValue: 0.90
    this._cachedDecay = decay;
    this._cachedDamping = damping;
    this._cachedDiffusion = diffusion;
    this._cachedModulation = Math.min(0.8, modulation); // Limit modulation depth
    this._cachedEarlyLevel = earlyLevel;

    // Convert pre-delay from ms to samples
    const preDelaySamples = Math.floor((preDelayMs / 1000) * this.sampleRate);
    this._cachedPreDelay = Math.min(preDelaySamples, this.preDelaySize - 1);

    const blockSize = output[0].length;

    for (let sample = 0; sample < blockSize; sample++) {
      // Sum input channels to mono
      let inputSample = 0;
      for (let ch = 0; ch < inputChannelCount; ch++) {
        inputSample += input[ch][sample] / inputChannelCount;
      }

      // Pre-delay
      const preDelayReadIndex =
        (this.preDelayWriteIndex - this._cachedPreDelay + this.preDelaySize) %
        this.preDelaySize;
      const delayedInput = this.preDelayBuffer[preDelayReadIndex];
      this.preDelayBuffer[this.preDelayWriteIndex] = inputSample;
      this.preDelayWriteIndex =
        (this.preDelayWriteIndex + 1) % this.preDelaySize;

      // Apply DC blocking to the input of the reverb network
      const dcBlockedInput = this._processDCBlock(
        delayedInput,
        this.dcBlockInput,
      );

      // Process early reflections
      let earlySum = 0;
      for (let i = 0; i < this.earlyReflections.length; i++) {
        const tap = this.earlyReflections[i];
        const readIndex =
          (tap.writeIndex - tap.buffer.length + 1 + tap.buffer.length) %
          tap.buffer.length;
        earlySum += tap.buffer[readIndex] * tap.gain;
        tap.buffer[tap.writeIndex] = delayedInput;
        tap.writeIndex = (tap.writeIndex + 1) % tap.buffer.length;
      }
      // Boost early reflections slightly for better presence
      earlySum *= 1.2;

      // Apply input diffusion to the DC-blocked signal
      const diffusedInput = this._processInputDiffusion(dcBlockedInput);

      // Read from delay lines with modulation
      const delayOutputs = [];
      for (let i = 0; i < this.delayLines.length; i++) {
        const delay = this.delayLines[i];
        const lfo = this.modLFOs[i];

        // Handle crossfading between old and new delay lengths
        if (delay.isFading) {
          delay.fadeProgress += delay.fadeRate;

          if (delay.fadeProgress >= 1.0) {
            // Fade complete
            delay.fadeProgress = 1.0;
            delay.isFading = false;
            delay.currentLength = delay.targetLength;
            delay.length = delay.currentLength;
          } else {
            // Smoothly interpolate during fade
            delay.currentLength =
              delay.currentLength +
              (delay.targetLength - delay.currentLength) * delay.fadeProgress;
            delay.length = delay.currentLength;
          }
        }

        // Update LFO
        lfo.phase += lfo.rate / this.sampleRate;
        if (lfo.phase >= 1.0) lfo.phase -= 1.0;

        // Calculate modulated delay length
        const modDepth = modulation * 3; // Reduced max modulation to prevent buffer overrun
        const modOffset = Math.sin(2 * Math.PI * lfo.phase) * modDepth;
        const modulatedLength = Math.max(1, delay.length + modOffset); // Ensure positive length

        // Read from primary buffer
        const readPos = delay.writeIndex - modulatedLength;
        const safeReadPos =
          readPos < 0 ? readPos + delay.buffer.length : readPos;
        const readIndex = Math.floor(safeReadPos) % delay.buffer.length;
        const readIndexNext = (readIndex + 1) % delay.buffer.length;
        const frac = safeReadPos - Math.floor(safeReadPos);

        let primaryOutput = 0;
        if (
          readIndex >= 0 &&
          readIndex < delay.buffer.length &&
          readIndexNext >= 0 &&
          readIndexNext < delay.buffer.length
        ) {
          primaryOutput =
            delay.buffer[readIndex] * (1 - frac) +
            delay.buffer[readIndexNext] * frac;
        }

        // If fading, also read from fade buffer and crossfade
        if (delay.isFading) {
          const fadeReadPos = delay.fadeWriteIndex - modulatedLength;
          const safeFadeReadPos =
            fadeReadPos < 0
              ? fadeReadPos + delay.fadeBuffer.length
              : fadeReadPos;
          const fadeReadIndex =
            Math.floor(safeFadeReadPos) % delay.fadeBuffer.length;
          const fadeReadIndexNext =
            (fadeReadIndex + 1) % delay.fadeBuffer.length;
          const fadeFrac = safeFadeReadPos - Math.floor(safeFadeReadPos);

          let fadeOutput = 0;
          if (
            fadeReadIndex >= 0 &&
            fadeReadIndex < delay.fadeBuffer.length &&
            fadeReadIndexNext >= 0 &&
            fadeReadIndexNext < delay.fadeBuffer.length
          ) {
            fadeOutput =
              delay.fadeBuffer[fadeReadIndex] * (1 - fadeFrac) +
              delay.fadeBuffer[fadeReadIndexNext] * fadeFrac;
          }

          // Crossfade between old and new using equal-power curve
          const fadeAngle = delay.fadeProgress * Math.PI * 0.5;
          delayOutputs[i] =
            fadeOutput * Math.cos(fadeAngle) +
            primaryOutput * Math.sin(fadeAngle);
        } else {
          delayOutputs[i] = primaryOutput;
        }
      }

      // Apply mixing matrix
      const mixedOutputs = [];
      for (let i = 0; i < this.delayLines.length; i++) {
        let sum = 0;
        for (let j = 0; j < this.delayLines.length; j++) {
          sum += delayOutputs[j] * this.mixMatrix[i][j];
        }
        mixedOutputs[i] = sum;
      }

      // Write back to delay lines with feedback, damping, and new input
      for (let i = 0; i < this.delayLines.length; i++) {
        const delay = this.delayLines[i];

        // Apply damping and decay
        let processed = this._processDampingFilter(mixedOutputs[i] * decay, i);

        // Add diffused input to all delay lines with better energy distribution
        // Use sqrt of line count for better energy preservation
        processed += diffusedInput * (1.0 / Math.sqrt(this.delayLines.length));


        // Apply DC blocking within the feedback loop
        processed = this._processDCBlock(processed, this.dcBlockFeedback[i]);

        // Write to delay line
        delay.buffer[delay.writeIndex] = processed;
        delay.writeIndex = (delay.writeIndex + 1) % delay.buffer.length;

        // Also update fade buffer if fading
        if (delay.isFading) {
          delay.fadeBuffer[delay.fadeWriteIndex] = processed;
          delay.fadeWriteIndex =
            (delay.fadeWriteIndex + 1) % delay.fadeBuffer.length;
        }
      }

      // Sum all delay outputs for late reverb signal
      // Use sqrt scaling for better energy preservation
      let lateReverbSample = 0;
      const delayMixScale = 1.0 / Math.sqrt(this.delayLines.length);
      for (let i = 0; i < delayOutputs.length; i++) {
        lateReverbSample += delayOutputs[i] * delayMixScale;
      }

      // Mix early and late reverb
      const earlyMix = earlySum * this._cachedEarlyLevel;
      const lateMix = lateReverbSample * (1 - this._cachedEarlyLevel * 0.5); // Keep some late reverb even with high early
      const reverbSample = earlyMix + lateMix;

      // Dynamic gain compensation based on mix level and decay
      // As mix increases, we need more gain to compensate for energy loss
      // The compensation curve is designed to maintain consistent perceived volume
      let gainCompensation = 1.0;
      
      if (mix > 0.1) {
        // Base compensation that increases with mix
        // Using a steeper curve for more aggressive compensation
        const baseCompensation = 1.0 + (Math.pow(mix, 1.5) * 4.0);
        
        // Additional exponential boost for very high mix values
        // This specifically addresses the volume drop at 90-100% mix
        let highMixBoost = 1.0;
        if (mix > 0.8) {
          // Exponential boost from 80% to 100%
          const highMixAmount = (mix - 0.8) / 0.2; // Normalize to 0-1
          highMixBoost = 1.0 + (Math.pow(highMixAmount, 2) * 4.0); // Up to 5x at 100%
        }
        
        // Energy preservation factor based on decay
        // Higher decay means more energy is preserved in the system
        const energyFactor = 2.0 - (decay * 0.8); // 1.2 to 2.0
        
        // Combine all compensation factors
        gainCompensation = baseCompensation * highMixBoost * energyFactor;
        
        // Increase the maximum limit to allow for more compensation at high mix
        gainCompensation = Math.min(gainCompensation, 16.0);
      }

      // Apply gain to reverb before mixing
      const boostedReverbSample = reverbSample * gainCompensation;


      // Apply mix between dry and wet signals
      const outputSample = inputSample * (1 - mix) + boostedReverbSample * mix;

      // Apply soft limiting to prevent clipping
      // Use a softer knee for smoother limiting with high gain compensation
      const limitThreshold = 0.9;
      let limitedOutput;
      
      if (Math.abs(outputSample) <= limitThreshold) {
        limitedOutput = outputSample;
      } else {
        // Soft knee compression above threshold
        const sign = outputSample > 0 ? 1 : -1;
        const excess = Math.abs(outputSample) - limitThreshold;
        const compressedExcess = Math.tanh(excess * 0.5) * 0.1;
        limitedOutput = sign * (limitThreshold + compressedExcess);
      }

      // Write to all output channels
      for (let ch = 0; ch < outputChannelCount; ch++) {
        output[ch][sample] = limitedOutput;
      }
    }

    return true;
  }
}

registerProcessor("fdn-reverb-processor", FDNReverbProcessor);
