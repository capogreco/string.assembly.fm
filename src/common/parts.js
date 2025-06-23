// parts.js - Part creation and distribution logic

export class Part {
    constructor(noteData) {
        this.id = `part-${Part.nextId++}`
        this.pitch = noteData.frequency
        this.note = noteData.note
        this.expression = noteData.expression || { type: 'none' }
    }
    
    static nextId = 0
    
    static resetIds() {
        Part.nextId = 0
    }
}

export class PartDistributor {
    constructor() {
        this.currentParts = []
    }
    
    // Create parts from piano roll data
    createParts(pianoData) {
        Part.resetIds()
        this.currentParts = []
        
        // pianoData is expected to be an object where:
        // - keys are note names that are actual parts (not trill targets)
        // - values are expression data
        Object.entries(pianoData).forEach(([note, data]) => {
            // Only create parts for notes that aren't just trill targets
            if (data.isPartSource) {
                this.currentParts.push(new Part({
                    note: note,
                    frequency: data.frequency,
                    expression: data.expression
                }))
            }
        })
        
        return this.currentParts
    }
    
    // Get program object with parts and global parameters
    createProgram(globalParams) {
        return {
            parts: this.currentParts,
            global: globalParams,
            timestamp: Date.now()
        }
    }
    
    // Get a human-readable summary of current parts
    getPartsSummary() {
        if (this.currentParts.length === 0) {
            return 'No parts'
        }
        
        return this.currentParts.map(part => {
            let summary = part.note
            if (part.expression.type === 'trill' && part.expression.targetNote) {
                summary += ` (→${part.expression.targetNote})`
            } else if (part.expression.type !== 'none') {
                summary += ` [${part.expression.type}]`
            }
            return summary
        }).join(', ')
    }
    
    // Distribute parts across available synths
    // Returns an array of assignments: [{synthId, partIndex}, ...]
    distributePartsToSynths(synthIds) {
        if (this.currentParts.length === 0 || synthIds.length === 0) {
            return []
        }
        
        const assignments = []
        
        // Equal distribution with shuffling for variety
        // First, create a base allocation ensuring equal representation
        const syntsPerPart = Math.floor(synthIds.length / this.currentParts.length)
        const remainder = synthIds.length % this.currentParts.length
        
        // Create array of part indices to assign
        const partIndices = []
        for (let i = 0; i < this.currentParts.length; i++) {
            const count = syntsPerPart + (i < remainder ? 1 : 0)
            for (let j = 0; j < count; j++) {
                partIndices.push(i)
            }
        }
        
        // Shuffle the synth IDs for variety
        const shuffledSynthIds = [...synthIds]
        this.shuffleArray(shuffledSynthIds)
        
        // Create assignments
        shuffledSynthIds.forEach((synthId, index) => {
            assignments.push({
                synthId: synthId,
                partIndex: partIndices[index]
            })
        })
        
        return assignments
    }
    
    // Fisher-Yates shuffle
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[array[i], array[j]] = [array[j], array[i]]
        }
        return array
    }
}

// Utility functions for note/frequency conversion
export const NoteUtils = {
    noteToFrequency(note) {
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
        
        const match = note.match(/^([A-G]#?b?)(\d)$/)
        if (!match) return 440
        
        const noteName = match[1]
        const octave = parseInt(match[2])
        
        const baseFreq = noteFreqs[noteName] || 440
        const octaveShift = octave - 4
        
        return baseFreq * Math.pow(2, octaveShift)
    },
    
    frequencyToNote(freq) {
        const A4 = 440
        const C0 = A4 * Math.pow(2, -4.75)
        
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        
        if (freq <= 0) return { note: 'A4', octave: 4, cents: 0 }
        
        const semitonesFromC0 = 12 * Math.log2(freq / C0)
        const octave = Math.floor(semitonesFromC0 / 12)
        const noteIndex = Math.round(semitonesFromC0 % 12)
        const noteName = noteNames[noteIndex % 12]
        
        const exactNote = C0 * Math.pow(2, (octave * 12 + noteIndex) / 12)
        const cents = Math.round(1200 * Math.log2(freq / exactNote))
        
        return {
            note: `${noteName}${octave}`,
            octave: octave,
            cents: cents
        }
    }
}