/**
 * AudioUtilities Module for String Assembly FM
 * Provides audio-related utility functions for frequency conversion,
 * note calculations, and transition timing
 */

import { Config } from '../core/Config.js';

export class AudioUtilities {
  /**
   * Convert MIDI note number to frequency
   * @param {number} midiNote - MIDI note number (0-127)
   * @returns {number} Frequency in Hz
   */
  static midiToFrequency(midiNote) {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }

  /**
   * Convert frequency to MIDI note number
   * @param {number} frequency - Frequency in Hz
   * @returns {number} MIDI note number
   */
  static frequencyToMidi(frequency) {
    return Math.round(69 + 12 * Math.log2(frequency / 440));
  }

  /**
   * Convert frequency to note name with octave
   * @param {number} frequency - Frequency in Hz
   * @returns {string} Note name with octave (e.g., "A4", "C#3")
   */
  static frequencyToNoteName(frequency) {
    const A4 = 440;
    const C0 = A4 * Math.pow(2, -4.75);

    if (frequency <= 0) return "N/A";

    const h = Math.round(12 * Math.log2(frequency / C0));
    const octave = Math.floor(h / 12);
    const noteIndex = h % 12;

    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    return `${noteNames[noteIndex]}${octave}`;
  }

  /**
   * Convert note name to frequency
   * @param {string} noteName - Note name (e.g., "A4", "C#3")
   * @returns {number} Frequency in Hz
   */
  static noteNameToFrequency(noteName) {
    const noteRegex = /^([A-G]#?)(\d+)$/;
    const match = noteName.match(noteRegex);

    if (!match) {
      throw new Error(`Invalid note name: ${noteName}`);
    }

    const [, note, octaveStr] = match;
    const octave = parseInt(octaveStr);

    const noteMap = {
      'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
      'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
    };

    const midiNote = (octave + 1) * 12 + noteMap[note];
    return AudioUtilities.midiToFrequency(midiNote);
  }

  /**
   * Calculate cents difference between two frequencies
   * @param {number} freq1 - First frequency
   * @param {number} freq2 - Second frequency
   * @returns {number} Cents difference
   */
  static centsDifference(freq1, freq2) {
    return 1200 * Math.log2(freq2 / freq1);
  }

  /**
   * Apply cents offset to frequency
   * @param {number} frequency - Base frequency
   * @param {number} cents - Cents offset (+/-)
   * @returns {number} Modified frequency
   */
  static applyCentsOffset(frequency, cents) {
    return frequency * Math.pow(2, cents / 1200);
  }

  /**
   * Calculate harmonic frequency
   * @param {number} fundamental - Fundamental frequency
   * @param {number} harmonicNumber - Harmonic number (1 = fundamental)
   * @returns {number} Harmonic frequency
   */
  static calculateHarmonic(fundamental, harmonicNumber) {
    return fundamental * harmonicNumber;
  }

  /**
   * Calculate subharmonic frequency
   * @param {number} fundamental - Fundamental frequency
   * @param {number} subharmonicNumber - Subharmonic divisor
   * @returns {number} Subharmonic frequency
   */
  static calculateSubharmonic(fundamental, subharmonicNumber) {
    return fundamental / subharmonicNumber;
  }

  /**
   * Calculate frequency ratio between two frequencies
   * @param {number} freq1 - First frequency
   * @param {number} freq2 - Second frequency
   * @returns {number} Frequency ratio (freq2/freq1)
   */
  static frequencyRatio(freq1, freq2) {
    return freq2 / freq1;
  }

  /**
   * Apply frequency ratio to base frequency
   * @param {number} baseFrequency - Base frequency
   * @param {number} ratio - Frequency ratio
   * @returns {number} Modified frequency
   */
  static applyFrequencyRatio(baseFrequency, ratio) {
    return baseFrequency * ratio;
  }

  /**
   * Calculate transition timing with variance
   * @param {Object} program - Program containing timing parameters
   * @param {number} baseDelay - Base delay in seconds
   * @returns {Object} Transition timing parameters
   */
  static calculateTransitionTiming(program, baseDelay = 0) {
    const baseTransitionTime = program?.transitionTiming || 1.0;
    const variance = program?.transitionVariance || 0.1;
    const shape = program?.transitionShape || 0.5;

    // Apply random variance
    const randomVariance = (Math.random() - 0.5) * 2 * variance;
    const actualTransitionTime = Math.max(0.1, baseTransitionTime + randomVariance);

    return {
      duration: actualTransitionTime,
      shape: Math.max(0, Math.min(1, shape)),
      delay: Math.max(0, baseDelay),
      startTime: Date.now() + (baseDelay * 1000)
    };
  }

  /**
   * Generate random harmonic ratio from sets
   * @param {Set|Array} numerators - Set or array of numerator values
   * @param {Set|Array} denominators - Set or array of denominator values
   * @returns {number} Random harmonic ratio
   */
  static getRandomHarmonicRatio(numerators, denominators) {
    const numArray = Array.isArray(numerators) ? numerators : Array.from(numerators || [1]);
    const denArray = Array.isArray(denominators) ? denominators : Array.from(denominators || [1]);

    const randomNum = numArray[Math.floor(Math.random() * numArray.length)];
    const randomDen = denArray[Math.floor(Math.random() * denArray.length)];

    return randomNum / randomDen;
  }

  /**
   * Calculate equal temperament frequency
   * @param {number} baseFrequency - Base frequency (usually A4 = 440Hz)
   * @param {number} semitones - Semitones from base
   * @returns {number} Equal temperament frequency
   */
  static equalTemperamentFrequency(baseFrequency, semitones) {
    return baseFrequency * Math.pow(2, semitones / 12);
  }

  /**
   * Calculate just intonation frequency
   * @param {number} baseFrequency - Base frequency
   * @param {number} numerator - Ratio numerator
   * @param {number} denominator - Ratio denominator
   * @returns {number} Just intonation frequency
   */
  static justIntonationFrequency(baseFrequency, numerator, denominator) {
    return baseFrequency * (numerator / denominator);
  }

  /**
   * Clamp frequency to audible range
   * @param {number} frequency - Input frequency
   * @param {number} minFreq - Minimum frequency (default: 20Hz)
   * @param {number} maxFreq - Maximum frequency (default: 20000Hz)
   * @returns {number} Clamped frequency
   */
  static clampFrequency(frequency, minFreq = 20, maxFreq = 20000) {
    return Math.max(minFreq, Math.min(maxFreq, frequency));
  }

  /**
   * Validate frequency is in audible range
   * @param {number} frequency - Frequency to validate
   * @returns {boolean} True if frequency is audible
   */
  static isAudibleFrequency(frequency) {
    return frequency >= Config.AUDIO.FREQUENCY_RANGE.MIN &&
           frequency <= Config.AUDIO.FREQUENCY_RANGE.MAX;
  }

  /**
   * Calculate frequency for vibrato modulation
   * @param {number} baseFrequency - Base frequency
   * @param {number} vibratoRate - Vibrato rate in Hz
   * @param {number} vibratoDepth - Vibrato depth (0-1)
   * @param {number} phase - Current phase (0-2π)
   * @returns {number} Modulated frequency
   */
  static calculateVibratoFrequency(baseFrequency, vibratoRate, vibratoDepth, phase) {
    const modulation = Math.sin(phase) * vibratoDepth;
    const centsOffset = modulation * 100; // ±100 cents at full depth
    return AudioUtilities.applyCentsOffset(baseFrequency, centsOffset);
  }

  /**
   * Calculate trill target frequency
   * @param {number} baseFrequency - Base note frequency
   * @param {number} intervalSemitones - Trill interval in semitones
   * @returns {number} Trill target frequency
   */
  static calculateTrillTarget(baseFrequency, intervalSemitones = 1) {
    return AudioUtilities.equalTemperamentFrequency(baseFrequency, intervalSemitones);
  }

  /**
   * Calculate tremolo amplitude modulation
   * @param {number} baseAmplitude - Base amplitude
   * @param {number} tremoloRate - Tremolo rate in Hz
   * @param {number} tremoloDepth - Tremolo depth (0-1)
   * @param {number} phase - Current phase (0-2π)
   * @returns {number} Modulated amplitude
   */
  static calculateTremoloAmplitude(baseAmplitude, tremoloRate, tremoloDepth, phase) {
    const modulation = Math.sin(phase) * tremoloDepth;
    return baseAmplitude * (1 + modulation * 0.5); // ±50% at full depth
  }

  /**
   * Generate chord frequencies from root note and intervals
   * @param {number} rootFrequency - Root note frequency
   * @param {Array} intervals - Array of intervals in semitones
   * @returns {Array} Array of chord frequencies
   */
  static generateChordFromIntervals(rootFrequency, intervals) {
    return intervals.map(interval =>
      AudioUtilities.equalTemperamentFrequency(rootFrequency, interval)
    );
  }

  /**
   * Common chord intervals (in semitones from root)
   */
  static CHORD_INTERVALS = {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    diminished: [0, 3, 6],
    augmented: [0, 4, 8],
    major7: [0, 4, 7, 11],
    minor7: [0, 3, 7, 10],
    dominant7: [0, 4, 7, 10],
    sus2: [0, 2, 7],
    sus4: [0, 5, 7]
  };

  /**
   * Generate chord from chord type
   * @param {number} rootFrequency - Root note frequency
   * @param {string} chordType - Chord type from CHORD_INTERVALS
   * @returns {Array} Array of chord frequencies
   */
  static generateChord(rootFrequency, chordType) {
    const intervals = AudioUtilities.CHORD_INTERVALS[chordType];
    if (!intervals) {
      throw new Error(`Unknown chord type: ${chordType}`);
    }
    return AudioUtilities.generateChordFromIntervals(rootFrequency, intervals);
  }

  /**
   * Calculate beat frequency between two frequencies
   * @param {number} freq1 - First frequency
   * @param {number} freq2 - Second frequency
   * @returns {number} Beat frequency
   */
  static calculateBeatFrequency(freq1, freq2) {
    return Math.abs(freq1 - freq2);
  }

  /**
   * Check if two frequencies create audible beats
   * @param {number} freq1 - First frequency
   * @param {number} freq2 - Second frequency
   * @param {number} threshold - Beat threshold in Hz (default: 30Hz)
   * @returns {boolean} True if beats are audible
   */
  static hasAudibleBeats(freq1, freq2, threshold = 30) {
    const beatFreq = AudioUtilities.calculateBeatFrequency(freq1, freq2);
    return beatFreq > 0.5 && beatFreq < threshold;
  }

  /**
   * Linear interpolation between two frequencies
   * @param {number} freq1 - Start frequency
   * @param {number} freq2 - End frequency
   * @param {number} t - Interpolation factor (0-1)
   * @returns {number} Interpolated frequency
   */
  static lerpFrequency(freq1, freq2, t) {
    return freq1 + (freq2 - freq1) * Math.max(0, Math.min(1, t));
  }

  /**
   * Exponential interpolation between two frequencies
   * @param {number} freq1 - Start frequency
   * @param {number} freq2 - End frequency
   * @param {number} t - Interpolation factor (0-1)
   * @returns {number} Interpolated frequency
   */
  static expLerpFrequency(freq1, freq2, t) {
    const clampedT = Math.max(0, Math.min(1, t));
    return freq1 * Math.pow(freq2 / freq1, clampedT);
  }

  /**
   * Round frequency to nearest cent
   * @param {number} frequency - Input frequency
   * @returns {number} Frequency rounded to nearest cent
   */
  static roundToCent(frequency) {
    const midiNote = AudioUtilities.frequencyToMidi(frequency);
    const roundedMidi = Math.round(midiNote * 100) / 100;
    return AudioUtilities.midiToFrequency(roundedMidi);
  }

  /**
   * Get frequency range for given octave
   * @param {number} octave - Octave number
   * @returns {Object} Object with min and max frequencies
   */
  static getOctaveRange(octave) {
    const cFreq = AudioUtilities.noteNameToFrequency(`C${octave}`);
    const bFreq = AudioUtilities.noteNameToFrequency(`B${octave}`);
    return { min: cFreq, max: bFreq };
  }
}

// Make available globally for backward compatibility
if (typeof window !== 'undefined') {
  window.AudioUtilities = AudioUtilities;
}
