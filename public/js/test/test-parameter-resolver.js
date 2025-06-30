// Test for ParameterResolver
import { ParameterResolver } from '../modules/audio/ParameterResolver.js';

// Mock AppState
const mockAppState = {
  getNested: (path) => {
    const data = {
      'performance.currentProgram.harmonicSelections': {
        'vibrato-numerator': new Set([1, 2, 3]),
        'vibrato-denominator': new Set([1, 2]),
        'tremolo-numerator': new Set([1, 3, 5]),
        'tremolo-denominator': new Set([2, 4]),
        'trill-numerator': new Set([1]),
        'trill-denominator': new Set([1])
      }
    };
    return data[path];
  }
};

console.log('Testing ParameterResolver...');

const resolver = new ParameterResolver(mockAppState);

// Test 1: Basic assignment resolution
console.log('\nTest 1: Basic assignment resolution');
const baseProgram = {
  vibratoRate: 5,
  vibratoDepth: 0.02,
  tremoloSpeed: 10,
  tremoloDepth: 0.3,
  trillSpeed: 8,
  powerOn: true
};

const assignment = {
  frequency: 440,
  expression: { type: 'vibrato', depth: 0.05 }
};

const result1 = resolver.resolveForSynth('synth-1', assignment, baseProgram, {});
console.log('Resolved program:', result1);
console.assert(result1.fundamentalFrequency === 440, 'Frequency should be 440');
console.assert(result1.vibratoEnabled === 1, 'Vibrato should be enabled');
console.assert(result1.vibratoDepth === 0.05, 'Vibrato depth should be from expression');
console.assert(result1.vibratoRate !== 5, 'Vibrato rate should be modified by harmonic ratio');

// Test 2: No expression
console.log('\nTest 2: No expression');
const assignment2 = {
  frequency: 220,
  expression: { type: 'none' }
};

const result2 = resolver.resolveForSynth('synth-2', assignment2, baseProgram, {});
console.assert(result2.fundamentalFrequency === 220, 'Frequency should be 220');
console.assert(result2.vibratoEnabled === 0, 'Vibrato should be disabled');
console.assert(result2.tremoloEnabled === 0, 'Tremolo should be disabled');
console.assert(result2.trillEnabled === 0, 'Trill should be disabled');

// Test 3: Transition config
console.log('\nTest 3: Transition config');
const transitionConfig = {
  duration: 5,
  stagger: 0.5,
  durationSpread: 0.3,
  glissando: false
};

const result3 = resolver.resolveForSynth('synth-3', assignment, baseProgram, transitionConfig);
console.assert(result3.transition.duration === 5, 'Transition duration should be 5');
console.assert(result3.transition.glissando === false, 'Glissando should be false');

// Test 4: Build program message
console.log('\nTest 4: Build program message');
const context = {
  chord: { frequencies: [220, 440, 660], expressions: {} },
  parts: { 'synth-1': assignment },
  power: true
};

const message = resolver.buildProgramMessage(result1, context);
console.assert(message.chord.frequencies.length === 3, 'Should have 3 frequencies');
console.assert(message.power === true, 'Power should be true');
console.assert(message.timestamp > 0, 'Should have timestamp');

console.log('\nAll tests completed!');