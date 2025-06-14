// stochastic_chords.js
// Stochastic chord distribution system with per-note expression support

class StochasticChordDistributor {
    constructor() {
        // Distribution strategies
        this.strategies = {
            'round-robin': this.distributeRoundRobin.bind(this),
            'balanced': this.distributeBalanced.bind(this),
            'weighted': this.distributeWeighted.bind(this),
            'ensemble': this.distributeEnsemble.bind(this)
        }
        
        // Default stochastic parameters
        this.defaultStochasticParams = {
            microDetuning: {
                enabled: true,
                type: 'normal',
                mean: 0,
                std: 3  // cents
            },
            octaveDoubling: {
                enabled: true,
                probability: 0.3,
                preferUp: true  // Prefer octave up over down
            },
            harmonicEnrichment: {
                enabled: false,
                probability: 0.1,
                intervals: [7, 12]  // Fifth and octave
            },
            dynamicVariation: {
                enabled: true,
                range: 0.2  // ±20% volume variation
            }
        }
    }
    
    // Main distribution function
    distributeChord(chord, synthIds, options = {}) {
        const {
            strategy = 'balanced',
            stochasticParams = this.defaultStochasticParams,
            expressions = {},  // Note -> expression mapping
            seed = null
        } = options
        
        // Use seeded random if provided
        const random = seed ? this.createSeededRandom(seed) : Math.random
        
        // Get base distribution using selected strategy
        const baseAssignments = this.strategies[strategy](
            chord.notes,
            synthIds,
            { random, ...options }
        )
        
        // Apply stochastic variations and expressions
        const finalAssignments = this.applyStochasticVariations(
            baseAssignments,
            stochasticParams,
            expressions,
            random
        )
        
        return finalAssignments
    }
    
    // Round-robin distribution - simple cycling through notes
    distributeRoundRobin(notes, synthIds, options) {
        const assignments = []
        
        for (let i = 0; i < synthIds.length; i++) {
            const noteIndex = i % notes.length
            assignments.push({
                synthId: synthIds[i],
                baseNote: notes[noteIndex],
                noteIndex: noteIndex
            })
        }
        
        return assignments
    }
    
    // Balanced distribution - tries to give each note equal representation
    distributeBalanced(notes, synthIds, options) {
        const assignments = []
        const synthsPerNote = Math.floor(synthIds.length / notes.length)
        const remainder = synthIds.length % notes.length
        
        let synthIndex = 0
        
        for (let noteIndex = 0; noteIndex < notes.length; noteIndex++) {
            // Base allocation
            const synthCount = synthsPerNote + (noteIndex < remainder ? 1 : 0)
            
            for (let i = 0; i < synthCount; i++) {
                assignments.push({
                    synthId: synthIds[synthIndex],
                    baseNote: notes[noteIndex],
                    noteIndex: noteIndex
                })
                synthIndex++
            }
        }
        
        return assignments
    }
    
    // Weighted distribution - root and fifth get more synths
    distributeWeighted(notes, synthIds, options) {
        const random = options.random || Math.random
        
        // Calculate weights based on chord position
        const weights = notes.map((note, index) => {
            if (index === 0) return 2.0  // Root gets double weight
            if (index === 2 && notes.length >= 3) return 1.5  // Fifth gets 1.5x weight
            return 1.0
        })
        
        // Normalize weights
        const totalWeight = weights.reduce((sum, w) => sum + w, 0)
        const normalizedWeights = weights.map(w => w / totalWeight)
        
        // Distribute synths based on weights
        const assignments = []
        
        for (const synthId of synthIds) {
            const noteIndex = this.weightedChoice(normalizedWeights, random)
            assignments.push({
                synthId: synthId,
                baseNote: notes[noteIndex],
                noteIndex: noteIndex
            })
        }
        
        return assignments
    }
    
    // Ensemble distribution - creates "sections" that play similar notes
    distributeEnsemble(notes, synthIds, options) {
        const random = options.random || Math.random
        const sectionSize = options.sectionSize || 3
        
        const assignments = []
        const sections = Math.ceil(synthIds.length / sectionSize)
        
        for (let section = 0; section < sections; section++) {
            // Each section focuses on a subset of notes
            const sectionStart = section * sectionSize
            const sectionEnd = Math.min(sectionStart + sectionSize, synthIds.length)
            
            // Pick primary note for this section
            const primaryNoteIndex = Math.floor(random() * notes.length)
            
            for (let i = sectionStart; i < sectionEnd; i++) {
                // Most synths in section play primary note
                const usePrimary = random() < 0.7
                const noteIndex = usePrimary ? 
                    primaryNoteIndex : 
                    Math.floor(random() * notes.length)
                
                assignments.push({
                    synthId: synthIds[i],
                    baseNote: notes[noteIndex],
                    noteIndex: noteIndex,
                    section: section
                })
            }
        }
        
        return assignments
    }
    
    // Apply stochastic variations to base assignments
    applyStochasticVariations(assignments, params, expressions, random) {
        return assignments.map(assignment => {
            const result = { ...assignment }
            
            // Get base frequency from note
            const baseFreq = this.noteToFrequency(assignment.baseNote)
            result.baseFrequency = baseFreq
            
            // Apply micro-detuning
            if (params.microDetuning?.enabled) {
                const detuneCents = this.sampleDistribution(
                    params.microDetuning.type,
                    params.microDetuning,
                    random
                )
                result.detuning = detuneCents
                result.frequency = baseFreq * Math.pow(2, detuneCents / 1200)
            } else {
                result.frequency = baseFreq
                result.detuning = 0
            }
            
            // Apply octave doubling
            if (params.octaveDoubling?.enabled && random() < params.octaveDoubling.probability) {
                const octaveShift = params.octaveDoubling.preferUp ? 1 : -1
                result.octaveShift = octaveShift
                result.frequency *= Math.pow(2, octaveShift)
            } else {
                result.octaveShift = 0
            }
            
            // Apply harmonic enrichment
            if (params.harmonicEnrichment?.enabled && random() < params.harmonicEnrichment.probability) {
                const interval = params.harmonicEnrichment.intervals[
                    Math.floor(random() * params.harmonicEnrichment.intervals.length)
                ]
                result.harmonicInterval = interval
                result.frequency *= Math.pow(2, interval / 12)
            }
            
            // Apply dynamic variation
            if (params.dynamicVariation?.enabled) {
                const variation = (random() - 0.5) * 2 * params.dynamicVariation.range
                result.volumeMultiplier = 1 + variation
            } else {
                result.volumeMultiplier = 1
            }
            
            // Apply expression if provided
            const expression = expressions[assignment.baseNote] || { type: 'none' }
            result.expression = this.processExpression(expression, assignment.baseNote, random)
            
            return result
        })
    }
    
    // Process expression with stochastic variations
    processExpression(expression, baseNote, random) {
        const processed = { ...expression }
        
        switch (expression.type) {
            case 'trill':
                // Add slight variation to trill speed
                if (expression.speed) {
                    processed.speed = expression.speed * (0.9 + random() * 0.2)
                }
                // Occasionally vary the articulation
                if (expression.articulation) {
                    processed.articulation = expression.articulation * (0.8 + random() * 0.4)
                }
                break
                
            case 'vibrato':
                // Natural variation in vibrato rate
                if (expression.rate) {
                    processed.rate = expression.rate * (0.95 + random() * 0.1)
                }
                // Slight phase offset for ensemble effect
                processed.phaseOffset = random() * Math.PI * 2
                break
                
            case 'tremolo':
                // Vary tremolo speed slightly
                if (expression.speed) {
                    processed.speed = expression.speed * (0.9 + random() * 0.2)
                }
                // Random phase for natural ensemble
                processed.phaseOffset = random() * Math.PI * 2
                break
        }
        
        return processed
    }
    
    // Convert note name to frequency
    noteToFrequency(note) {
        // Note frequencies for octave 4
        const noteFreqs = {
            'C': 261.63,
            'C#': 277.18, 'Db': 277.18,
            'D': 293.66,
            'D#': 311.13, 'Eb': 311.13,
            'E': 329.63,
            'F': 349.23,
            'F#': 369.99, 'Gb': 369.99,
            'G': 392.00,
            'G#': 415.30, 'Ab': 415.30,
            'A': 440.00,
            'A#': 466.16, 'Bb': 466.16,
            'B': 493.88
        }
        
        // Parse note name and octave
        const match = note.match(/^([A-G]#?b?)(\d)$/)
        if (!match) return 440  // Default to A4
        
        const noteName = match[1]
        const octave = parseInt(match[2])
        
        const baseFreq = noteFreqs[noteName] || 440
        const octaveShift = octave - 4
        
        return baseFreq * Math.pow(2, octaveShift)
    }
    
    // Sample from various distributions
    sampleDistribution(type, params, random) {
        switch (type) {
            case 'normal':
                // Box-Muller transform
                const u1 = random()
                const u2 = random()
                const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
                return params.mean + z0 * params.std
                
            case 'uniform':
                return params.min + random() * (params.max - params.min)
                
            default:
                return 0
        }
    }
    
    // Weighted random choice
    weightedChoice(weights, random) {
        const r = random()
        let cumulative = 0
        
        for (let i = 0; i < weights.length; i++) {
            cumulative += weights[i]
            if (r <= cumulative) {
                return i
            }
        }
        
        return weights.length - 1
    }
    
    // Create seeded random number generator
    createSeededRandom(seed) {
        let value = seed
        return () => {
            value = (value * 9301 + 49297) % 233280
            return value / 233280
        }
    }
    
    // Generate program for each synth
    generatePrograms(assignments, baseProgram, expressions) {
        return assignments.map(assignment => {
            const program = { ...baseProgram }
            
            // Set frequency
            program.fundamentalFrequency = assignment.frequency
            
            // Apply volume multiplier
            if (assignment.volumeMultiplier && program.volume !== undefined) {
                program.volume *= assignment.volumeMultiplier
            }
            
            // Apply expression parameters
            const expr = assignment.expression
            switch (expr.type) {
                case 'trill':
                    program.trillEnabled = true
                    program.trillInterval = expr.interval || expr.targetInterval || 2
                    program.trillSpeed = expr.speed || 8
                    program.trillArticulation = expr.articulation || 0.5
                    break
                    
                case 'vibrato':
                    program.vibratoEnabled = true
                    program.vibratoRate = expr.rate || 4
                    program.vibratoDepth = expr.depth || 0.01
                    // Note: phase offset would be handled by the synth
                    break
                    
                case 'tremolo':
                    program.tremoloEnabled = true
                    program.tremoloSpeed = expr.speed || 10
                    program.tremoloDepth = expr.depth || 0.3
                    program.tremoloArticulation = expr.articulation || 0.8
                    break
                    
                default:
                    // Disable all expression effects
                    program.trillEnabled = false
                    program.vibratoEnabled = false
                    program.tremoloEnabled = false
            }
            
            return {
                synthId: assignment.synthId,
                program: program,
                metadata: {
                    baseNote: assignment.baseNote,
                    detuning: assignment.detuning,
                    octaveShift: assignment.octaveShift,
                    expression: expr.type,
                    section: assignment.section
                }
            }
        })
    }
}

// Export for use in controller
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StochasticChordDistributor }
} else {
    window.StochasticChordDistributor = StochasticChordDistributor
}