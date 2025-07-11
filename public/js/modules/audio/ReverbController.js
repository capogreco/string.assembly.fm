/**
 * ReverbController - Manages reverb parameter mapping for Arc control
 */
export class ReverbController {
  /**
   * Maps a single Arc value (0-1) to multiple reverb parameters
   * Creates a coherent journey from dry to massive cathedral
   * Includes gain compensation to maintain consistent perceived volume
   *
   * @param {number} arcValue - Arc encoder value (0.0 to 1.0)
   * @returns {Object} Object with all reverb parameters including gainCompensation
   */
  static mapArcToReverbSpace(arcValue) {
    // Non-linear scaling for better control distribution
    const position = Math.pow(arcValue, 1.2); // Slightly exponential

    let params = {};

    if (position < 0.05) {
      // Nearly dry - just a hint of space
      params = {
        mix: position * 4, // 0.0 → 0.2
        roomSize: 0.1, // Tiny
        decay: 0.1, // Very short
        damping: 0.9, // Very damped
        preDelay: 0, // No pre-delay
        diffusion: 0.3, // Low diffusion
        modulation: 0.05, // Minimal movement
        earlyLevel: 0.9, // Mostly early reflections
      };
    } else if (position < 0.25) {
      // Small room - intimate space
      const local = (position - 0.05) / 0.2;
      params = {
        mix: 0.2 + local * 0.15, // 0.2 → 0.35
        roomSize: 0.1 + local * 0.2, // 0.1 → 0.3
        decay: 0.1 + local * 0.3, // 0.1 → 0.4
        damping: 0.9 - local * 0.3, // 0.9 → 0.6
        preDelay: local * 10, // 0 → 10ms
        diffusion: 0.3 + local * 0.3, // 0.3 → 0.6
        modulation: 0.05 + local * 0.1, // 0.05 → 0.15
        earlyLevel: 0.9 - local * 0.3, // 0.9 → 0.6
      };
    } else if (position < 0.5) {
      // Medium room - chamber/studio
      const local = (position - 0.25) / 0.25;
      params = {
        mix: 0.35 + local * 0.1, // 0.35 → 0.45
        roomSize: 0.3 + local * 0.25, // 0.3 → 0.55
        decay: 0.4 + local * 0.2, // 0.4 → 0.6
        damping: 0.6 - local * 0.15, // 0.6 → 0.45
        preDelay: 10 + local * 15, // 10 → 25ms
        diffusion: 0.6 + local * 0.15, // 0.6 → 0.75
        modulation: 0.15 + local * 0.05, // 0.15 → 0.2
        earlyLevel: 0.6 - local * 0.15, // 0.6 → 0.45
      };
    } else if (position < 0.75) {
      // Large hall
      const local = (position - 0.5) / 0.25;
      params = {
        mix: 0.45 + local * 0.1, // 0.45 → 0.55
        roomSize: 0.55 + local * 0.2, // 0.55 → 0.75
        decay: 0.6 + local * 0.1, // 0.6 → 0.7
        damping: 0.45 - local * 0.1, // 0.45 → 0.35
        preDelay: 25 + local * 10, // 25 → 35ms
        diffusion: 0.75 + local * 0.1, // 0.75 → 0.85
        modulation: 0.2 + local * 0.05, // 0.2 → 0.25
        earlyLevel: 0.45 - local * 0.1, // 0.45 → 0.35
      };
    } else if (position < 0.9) {
      // Cathedral space
      const local = (position - 0.75) / 0.15;
      params = {
        mix: 0.55 + local * 0.15, // 0.55 → 0.7
        roomSize: 0.75 + local * 0.1, // 0.75 → 0.85
        decay: 0.7 + local * 0.1, // 0.7 → 0.8
        damping: 0.35 - local * 0.05, // 0.35 → 0.3
        preDelay: 35 + local * 10, // 35 → 45ms
        diffusion: 0.85 + local * 0.05, // 0.85 → 0.9
        modulation: 0.25 + local * 0.1, // 0.25 → 0.35
        earlyLevel: 0.35 - local * 0.1, // 0.35 → 0.25
      };
    } else {
      // Extreme wash - infinite space
      const local = (position - 0.9) / 0.1;
      params = {
        mix: 0.7 + local * 0.15, // 0.7 → 0.85 (very wet)
        roomSize: 0.85 + local * 0.05, // 0.85 → 0.9
        decay: 0.8 + local * 0.05, // 0.8 → 0.85 (capped to prevent feedback)
        damping: 0.3 - local * 0.15, // 0.3 → 0.15 (very bright)
        preDelay: 45 + local * 25, // 45 → 70ms (disconnected)
        diffusion: 0.9, // Maximum diffusion
        modulation: 0.35 + local * 0.15, // 0.35 → 0.5 (ethereal movement)
        earlyLevel: 0.25 - local * 0.15, // 0.25 → 0.1 (mostly late reverb)
      };
    }

    // Apply equal-power crossfade compensation
    // Standard linear crossfade causes perceived volume dip around 50% mix
    // Equal-power crossfade maintains consistent perceived loudness
    const linearMix = params.mix;

    // Convert to equal-power curve using sine/cosine
    // This maintains constant perceived power as mix changes
    const angle = linearMix * Math.PI * 0.5; // 0 to PI/2
    const dryGain = Math.cos(angle);
    const wetGain = Math.sin(angle);

    // Calculate the compensated mix value that achieves equal power
    // when used in linear crossfade: dry*(1-mix) + wet*mix
    // We need: dry*(1-mix) = dry*cos(angle) and wet*mix = wet*sin(angle)
    // For wet signal boost at high mix values
    if (linearMix > 0.7) {
      // Additional boost for extreme settings to maintain presence
      const extremeBoost = 1.0 + (linearMix - 0.7) * 0.3; // up to 1.09x at max
      params.mix = Math.min(0.95, wetGain * extremeBoost);
    } else {
      params.mix = wetGain;
    }

    // Also boost brightness at extreme settings for more presence
    if (position > 0.85) {
      const brightBoost = (position - 0.85) / 0.15; // 0 to 1
      params.damping *= 1.0 - brightBoost * 0.3; // Reduce damping up to 30%
    }

    return params;
  }

  /**
   * Get human-readable description for current reverb setting
   * @param {number} arcValue - Arc encoder value (0.0 to 1.0)
   * @returns {string} Description of the space
   */
  static getSpaceDescription(arcValue) {
    const position = Math.pow(arcValue, 1.2);

    if (position < 0.05) return "Dry Studio";
    if (position < 0.25) return "Small Room";
    if (position < 0.5) return "Chamber";
    if (position < 0.75) return "Concert Hall";
    if (position < 0.9) return "Cathedral";
    return "Infinite Space";
  }
}
