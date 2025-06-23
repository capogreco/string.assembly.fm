// standard_parameters.js
// Standardized parameter definitions for distributed bowed string synthesis
// Eliminates mapping complexity by using consistent camelCase naming throughout

// Core synthesis parameters with standardized names, ranges, and defaults
const SYNTH_PARAMETERS = {
    // Fundamental sound properties
    fundamentalFrequency: {
        name: 'fundamentalFrequency',
        displayName: 'Frequency',
        min: 80,
        max: 1200,
        default: 220,
        unit: 'Hz',
        type: 'float',
        category: 'basic'
    },
    
    // Bow control parameters
    bowForce: {
        name: 'bowForce',
        displayName: 'Bow Force',
        min: 0,
        max: 1,
        default: 0.3,
        unit: '',
        type: 'float',
        category: 'bow'
    },
    
    bowPosition: {
        name: 'bowPosition',
        displayName: 'Bow Position',
        min: 0,
        max: 1,
        default: 0.1,
        unit: '',
        type: 'float',
        category: 'bow'
    },
    
    bowSpeed: {
        name: 'bowSpeed',
        displayName: 'Bow Speed',
        min: 0,
        max: 2,
        default: 0.5,
        unit: '',
        type: 'float',
        category: 'bow'
    },
    
    // String properties
    stringDamping: {
        name: 'stringDamping',
        displayName: 'String Damping',
        min: 0,
        max: 1,
        default: 0.1,
        unit: '',
        type: 'float',
        category: 'string'
    },
    
    stringMaterial: {
        name: 'stringMaterial',
        displayName: 'String Material',
        min: 0,
        max: 1,
        default: 0.5,
        unit: '',
        type: 'float',
        category: 'string'
    },
    
    // Expression controls
    vibratoRate: {
        name: 'vibratoRate',
        displayName: 'Vibrato Rate',
        min: 0,
        max: 10,
        default: 4,
        unit: 'Hz',
        type: 'float',
        category: 'expression'
    },
    
    vibratoDepth: {
        name: 'vibratoDepth',
        displayName: 'Vibrato Depth',
        min: 0,
        max: 0.1,
        default: 0.01,
        unit: '',
        type: 'float',
        category: 'expression'
    },
    
    vibratoEnabled: {
        name: 'vibratoEnabled',
        displayName: 'Vibrato On',
        default: false,
        type: 'boolean',
        category: 'expression'
    },
    
    trillInterval: {
        name: 'trillInterval',
        displayName: 'Trill Interval',
        min: 1,
        max: 12,
        default: 2,
        unit: 'semitones',
        type: 'int',
        category: 'expression'
    },
    
    trillSpeed: {
        name: 'trillSpeed',
        displayName: 'Trill Speed',
        min: 1,
        max: 20,
        default: 8,
        unit: 'Hz',
        type: 'float',
        category: 'expression'
    },
    
    trillArticulation: {
        name: 'trillArticulation',
        displayName: 'Trill Articulation',
        min: 0,
        max: 1,
        default: 0.5,
        unit: '',
        type: 'float',
        category: 'expression'
    },
    
    trillEnabled: {
        name: 'trillEnabled',
        displayName: 'Trill On',
        default: false,
        type: 'boolean',
        category: 'expression'
    },
    
    tremoloSpeed: {
        name: 'tremoloSpeed',
        displayName: 'Tremolo Speed',
        min: 1,
        max: 30,
        default: 10,
        unit: 'Hz',
        type: 'float',
        category: 'expression'
    },
    
    tremoloDepth: {
        name: 'tremoloDepth',
        displayName: 'Tremolo Depth',
        min: 0,
        max: 1,
        default: 0.3,
        unit: '',
        type: 'float',
        category: 'expression'
    },
    
    tremoloArticulation: {
        name: 'tremoloArticulation',
        displayName: 'Tremolo Articulation',
        min: 0,
        max: 1,
        default: 0.8,
        unit: '',
        type: 'float',
        category: 'expression'
    },
    
    tremoloEnabled: {
        name: 'tremoloEnabled',
        displayName: 'Tremolo On',
        default: false,
        type: 'boolean',
        category: 'expression'
    },
    
    // Tonal characteristics
    brightness: {
        name: 'brightness',
        displayName: 'Brightness',
        min: 0,
        max: 1,
        default: 0.5,
        unit: '',
        type: 'float',
        category: 'tone'
    },
    
    bodyType: {
        name: 'bodyType',
        displayName: 'Body Type',
        min: 0,
        max: 1,
        default: 0.5,
        unit: '',
        type: 'float',
        category: 'tone'
    },
    
    bodyResonance: {
        name: 'bodyResonance',
        displayName: 'Body Resonance',
        min: 0,
        max: 1,
        default: 0.7,
        unit: '',
        type: 'float',
        category: 'tone'
    },
    
    // Output control
    masterGain: {
        name: 'masterGain',
        displayName: 'Master Gain',
        min: 0,
        max: 1,
        default: 0.8,
        unit: '',
        type: 'float',
        category: 'output'
    },
    
    volume: {
        name: 'volume',
        displayName: 'Volume',
        min: 0,
        max: 1,
        default: 0.7,
        unit: '',
        type: 'float',
        category: 'output'
    }
}

// Parameter categories for UI organization
const PARAMETER_CATEGORIES = {
    basic: {
        name: 'Basic',
        description: 'Fundamental sound properties',
        order: 1
    },
    bow: {
        name: 'Bow Control',
        description: 'Bow technique parameters',
        order: 2
    },
    string: {
        name: 'String Properties',
        description: 'Physical string characteristics',
        order: 3
    },
    expression: {
        name: 'Expression',
        description: 'Vibrato, trill, and tremolo controls',
        order: 4
    },
    tone: {
        name: 'Tone Shaping',
        description: 'Brightness and body characteristics',
        order: 5
    },
    output: {
        name: 'Output',
        description: 'Volume and gain controls',
        order: 6
    }
}

// Utility functions for parameter handling
class ParameterUtils {
    // Get default program with all parameters at default values
    static getDefaultProgram() {
        const program = {}
        for (const [paramName, paramDef] of Object.entries(SYNTH_PARAMETERS)) {
            program[paramName] = paramDef.default
        }
        return program
    }
    
    // Validate parameter value against its definition
    static validateParameter(paramName, value) {
        const paramDef = SYNTH_PARAMETERS[paramName]
        if (!paramDef) {
            return { valid: false, error: `Unknown parameter: ${paramName}` }
        }
        
        if (paramDef.type === 'boolean') {
            if (typeof value !== 'boolean') {
                return { valid: false, error: `${paramName} must be boolean` }
            }
        } else if (paramDef.type === 'int') {
            if (!Number.isInteger(value) || value < paramDef.min || value > paramDef.max) {
                return { valid: false, error: `${paramName} must be integer between ${paramDef.min} and ${paramDef.max}` }
            }
        } else if (paramDef.type === 'float') {
            if (typeof value !== 'number' || value < paramDef.min || value > paramDef.max) {
                return { valid: false, error: `${paramName} must be number between ${paramDef.min} and ${paramDef.max}` }
            }
        }
        
        return { valid: true }
    }
    
    // Validate entire program
    static validateProgram(program) {
        const errors = []
        
        for (const [paramName, value] of Object.entries(program)) {
            const validation = this.validateParameter(paramName, value)
            if (!validation.valid) {
                errors.push(validation.error)
            }
        }
        
        return {
            valid: errors.length === 0,
            errors: errors
        }
    }
    
    // Clamp parameter value to valid range
    static clampParameter(paramName, value) {
        const paramDef = SYNTH_PARAMETERS[paramName]
        if (!paramDef) return value
        
        if (paramDef.type === 'boolean') {
            return !!value
        } else if (paramDef.type === 'int') {
            return Math.round(Math.max(paramDef.min, Math.min(paramDef.max, value)))
        } else if (paramDef.type === 'float') {
            return Math.max(paramDef.min, Math.min(paramDef.max, value))
        }
        
        return value
    }
    
    // Get parameters by category
    static getParametersByCategory(category) {
        return Object.entries(SYNTH_PARAMETERS)
            .filter(([name, def]) => def.category === category)
            .reduce((acc, [name, def]) => {
                acc[name] = def
                return acc
            }, {})
    }
    
    // Get all parameter names
    static getParameterNames() {
        return Object.keys(SYNTH_PARAMETERS)
    }
    
    // Check if parameter exists
    static hasParameter(paramName) {
        return paramName in SYNTH_PARAMETERS
    }
    
    // Get parameter definition
    static getParameterDefinition(paramName) {
        return SYNTH_PARAMETERS[paramName] || null
    }
    
    // Create program from partial parameters (fills in defaults for missing)
    static createCompleteProgram(partialProgram = {}) {
        const program = this.getDefaultProgram()
        
        // Override with provided values, clamping to valid ranges
        for (const [paramName, value] of Object.entries(partialProgram)) {
            if (this.hasParameter(paramName)) {
                program[paramName] = this.clampParameter(paramName, value)
            }
        }
        
        return program
    }
    
    // Convert program to worklet format (no mapping needed - names are identical)
    static programToWorkletParams(program) {
        // Since we use standardized names, no mapping is required
        // Just ensure all values are valid
        const workletParams = {}
        
        for (const [paramName, value] of Object.entries(program)) {
            if (this.hasParameter(paramName)) {
                workletParams[paramName] = this.clampParameter(paramName, value)
            }
        }
        
        return workletParams
    }
}

// Stochastic parameter definitions for future use
const STOCHASTIC_TYPES = {
    uniform: {
        name: 'uniform',
        description: 'Uniform random distribution',
        requiredFields: ['min', 'max']
    },
    normal: {
        name: 'normal',
        description: 'Normal (Gaussian) distribution',
        requiredFields: ['mean', 'std']
    },
    choice: {
        name: 'choice',
        description: 'Random choice from list',
        requiredFields: ['options']
    },
    sequence: {
        name: 'sequence',
        description: 'Sequential values from list',
        requiredFields: ['values', 'index']
    }
}

// Export for use in both controller and synth
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        SYNTH_PARAMETERS, 
        PARAMETER_CATEGORIES, 
        STOCHASTIC_TYPES,
        ParameterUtils 
    }
} else {
    window.SYNTH_PARAMETERS = SYNTH_PARAMETERS
    window.PARAMETER_CATEGORIES = PARAMETER_CATEGORIES
    window.STOCHASTIC_TYPES = STOCHASTIC_TYPES
    window.ParameterUtils = ParameterUtils
}