/**
 * ParameterResolver - Single source of truth for parameter resolution
 * Converts UI state into complete, ready-to-send synth programs
 */
import { Logger } from '../core/Logger.js';
import { SystemConfig, ConfigUtils } from '../../config/system.config.js';

export class ParameterResolver {
  constructor(appState) {
    this.appState = appState;
  }

  /**
   * Resolve a complete program for a specific synth
   * This is THE ONLY place where parameters are assembled for synths
   * 
   * @param {string} synthId - Target synth
   * @param {Object} assignment - Part assignment {frequency, expression}
   * @param {Object} baseProgram - Base program parameters from UI
   * @param {Object} transitionConfig - Transition configuration
   * @returns {Object} Complete program ready for synth
   */
  resolveForSynth(synthId, assignment, baseProgram, transitionConfig) {
    // Start with base parameters
    let program = { ...baseProgram };
    
    // 2. Apply assignment (frequency)
    if (assignment) {
      program = this.applyAssignment(program, assignment);
    }
    
    // 3. Apply expression modifications with harmonic ratios
    if (assignment?.expression) {
      Logger.log(`Applying expression ${assignment.expression.type} to ${synthId}`, 'parameters');
      program = this.applyExpression(program, assignment.expression);
    } else {
      Logger.log(`No expression for ${synthId}`, 'parameters');
    }
    
    // 4. Apply transition configuration
    if (transitionConfig) {
      program = this.applyTransitions(program, transitionConfig);
    }
    
    // 5. Add synth metadata
    program.synthId = synthId;
    program.timestamp = Date.now();
    
    Logger.log(`Resolved program for ${synthId}: freq=${program.fundamentalFrequency}Hz, expr=${assignment?.expression?.type || 'none'}`, 'parameters');
    
    return program;
  }

  /**
   * Apply part assignment (frequency)
   */
  applyAssignment(params, assignment) {
    if (!assignment || !assignment.frequency) {
      return params;
    }
    
    return {
      ...params,
      fundamentalFrequency: assignment.frequency
    };
  }

  /**
   * Apply expression modifications with harmonic ratio resolution
   */
  applyExpression(params, expression) {
    // Reset all expression flags
    const result = {
      ...params,
      vibratoEnabled: 0,
      tremoloEnabled: 0,
      trillEnabled: 0
    };
    
    if (!expression || expression.type === 'none') {
      return result;
    }
    
    switch (expression.type) {
      case 'vibrato':
        result.vibratoEnabled = 1;
        result.vibratoDepth = expression.depth || params.vibratoDepth || 0.01;
        
        // Apply harmonic ratio to vibrato rate
        const vibratoRatio = this.getRandomHarmonicRatio('vibrato');
        const baseVibratoRate = params.vibratoRate || 5;
        result.vibratoRate = baseVibratoRate * vibratoRatio;
        
        Logger.log(`Vibrato: base rate=${baseVibratoRate}, ratio=${vibratoRatio}, final=${result.vibratoRate}`, 'parameters');
        break;
        
      case 'tremolo':
        result.tremoloEnabled = 1;
        result.tremoloDepth = expression.depth || params.tremoloDepth || 0.3;
        result.tremoloArticulation = expression.articulation || params.tremoloArticulation || 0.8;
        
        // Apply harmonic ratio to tremolo speed
        const tremoloRatio = this.getRandomHarmonicRatio('tremolo');
        const baseTremoloSpeed = params.tremoloSpeed || 10;
        result.tremoloSpeed = baseTremoloSpeed * tremoloRatio;
        
        Logger.log(`Tremolo: base speed=${baseTremoloSpeed}, ratio=${tremoloRatio}, final=${result.tremoloSpeed}`, 'parameters');
        break;
        
      case 'trill':
        result.trillEnabled = 1;
        result.trillInterval = expression.interval || params.trillInterval || 2;
        result.trillArticulation = expression.articulation || params.trillArticulation || 0.7;
        
        // Apply harmonic ratio to trill speed
        const trillRatio = this.getRandomHarmonicRatio('trill');
        const baseTrillSpeed = params.trillSpeed || 8;
        result.trillSpeed = baseTrillSpeed * trillRatio;
        
        Logger.log(`Trill: base speed=${baseTrillSpeed}, ratio=${trillRatio}, final=${result.trillSpeed}`, 'parameters');
        break;
    }
    
    return result;
  }

  /**
   * Get random harmonic ratio for expression type
   * @param {string} expression - Expression type (vibrato, tremolo, trill)
   * @returns {number} Harmonic ratio
   */
  getRandomHarmonicRatio(expression) {
    const harmonicSelections = this.appState.getNested('performance.currentProgram.harmonicSelections') || {};
    
    const numeratorKey = `${expression}-numerator`;
    const denominatorKey = `${expression}-denominator`;
    
    const numerators = Array.from(harmonicSelections[numeratorKey] || new Set([1]));
    const denominators = Array.from(harmonicSelections[denominatorKey] || new Set([1]));
    
    if (numerators.length === 0 || denominators.length === 0) {
      return 1.0;
    }
    
    const randomNumerator = numerators[Math.floor(Math.random() * numerators.length)];
    const randomDenominator = denominators[Math.floor(Math.random() * denominators.length)];
    
    const ratio = randomNumerator / randomDenominator;
    return ratio;
  }

  /**
   * Apply transition configuration
   */
  applyTransitions(params, transitionConfig) {
    return {
      ...params,
      transition: {
        duration: transitionConfig.duration || 10,
        stagger: transitionConfig.stagger || 0,
        durationSpread: transitionConfig.durationSpread || 0,
        glissando: transitionConfig.glissando !== undefined ? transitionConfig.glissando : true
      }
    };
  }

  /**
   * Calculate transition timing for a specific synth
   * @param {Object} config - Base transition configuration
   * @param {number} synthIndex - Index of synth in distribution order
   * @returns {Object} Timing object with delay and duration
   */
  calculateTransitionTiming(config, synthIndex = 0) {
    const baseDuration = config.duration || 10;
    const stagger = config.stagger || 0; // 0 to 1 (0% to 100%)
    const durationSpread = config.durationSpread || 0; // 0 to 1 (0% to 100%)
    
    // Calculate stagger delay using exponential algorithm
    let delay = 0;
    if (stagger > 0) {
      const staggerExponent = (Math.random() * 2 - 1) * stagger * Math.log(2);
      const staggerMultiplier = Math.exp(staggerExponent);
      delay = baseDuration * staggerMultiplier;
    }
    
    // Calculate duration variation using exponential algorithm
    let finalDuration = baseDuration;
    if (durationSpread > 0) {
      const durationExponent = (Math.random() * 2 - 1) * durationSpread * Math.log(2);
      const durationMultiplier = Math.exp(durationExponent);
      finalDuration = baseDuration * durationMultiplier;
    }
    
    return {
      delay: Math.max(0, delay),
      duration: finalDuration,
      stagger: stagger,
      durationSpread: durationSpread
    };
  }

  /**
   * Build complete program message for sending
   * @param {Object} program - Resolved program
   * @param {Object} context - Additional context (chord, parts, power)
   * @returns {Object} Complete message ready for network
   */
  buildProgramMessage(program, context) {
    const message = {
      ...program,
      chord: context.chord || { frequencies: [], expressions: {} },
      parts: context.parts || {},
      power: context.power !== undefined ? context.power : true,
      timestamp: Date.now()
    };
    
    // Debug log expression parameters being sent
    if (program.vibratoEnabled || program.tremoloEnabled || program.trillEnabled) {
      Logger.log(`Sending expression params: vibrato=${program.vibratoEnabled}, tremolo=${program.tremoloEnabled}, trill=${program.trillEnabled}`, 'parameters');
    }
    
    return message;
  }
}

