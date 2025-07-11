/**
 * ReverbController - Manages reverb parameter mapping for Arc control
 */
export class ReverbController {
  /**
   * Maps a single Arc value (0-1) to multiple reverb parameters
   * Creates a smooth journey from dry to washed-out reverb
   *
   * Fixed parameters to prevent artifacts:
   * - roomSize: 0.65 (medium-large space)
   * - decay: 0.7 (healthy reverb tail)
   * - preDelay: 20ms (natural pre-delay)
   *
   * Variable parameters for character control:
   * - mix: wet/dry balance
   * - damping: tonal brightness
   * - diffusion: clarity vs diffuse
   * - modulation: movement/wobble
   * - earlyLevel: direct vs spacious
   *
   * @param {number} arcValue - Arc encoder value (0.0 to 1.0)
   * @returns {Object} Object with all reverb parameters
   */
  static mapArcToReverbSpace(arcValue) {
    // Non-linear scaling for better control distribution
    const position = Math.pow(arcValue, 1.2); // Slightly exponential

    // Fixed parameters throughout the range
    const params = {
      roomSize: 0.65, // Fixed medium-large room size
      decay: 0.85, // Increased decay for better sustain (was 0.7)
      preDelay: 20, // Fixed 20ms pre-delay
    };

    // Variable parameters based on position
    // Mix: 0 → 1.0 (100% wet at maximum)
    params.mix = position;

    // Damping: 0.8 → 0.05 (darker to extremely bright)
    params.damping = 0.8 - position * 0.75;

    // Diffusion: 0.5 → 0.95 (clear to maximum diffusion)
    params.diffusion = 0.5 + position * 0.45;

    // Modulation: 0.05 → 0.8 (subtle to extreme wobble)
    params.modulation = 0.05 + position * 0.75;

    // Early Level: 0.7 → 0.05 (direct to almost pure late reverb)
    params.earlyLevel = 0.7 - position * 0.65;

    // No compensation needed - we want linear mix that reaches 100% wet
    // The reverb processor should handle gain internally to maintain volume

    return params;
  }

  /**
   * Get human-readable description for current reverb setting
   * @param {number} arcValue - Arc encoder value (0.0 to 1.0)
   * @returns {string} Description of the space
   */
  static getSpaceDescription(arcValue) {
    const position = Math.pow(arcValue, 1.2);

    if (position < 0.1) return "Dry";
    if (position < 0.3) return "Subtle";
    if (position < 0.5) return "Present";
    if (position < 0.7) return "Spacious";
    if (position < 0.85) return "Immersive";
    return "Extreme Wash";
  }
}
