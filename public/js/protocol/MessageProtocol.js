/**
 * String Assembly FM Message Protocol Definition
 * All messages between controller and synth must conform to these schemas
 */

export const MessageTypes = {
  // Controller → Synth
  PROGRAM: 'program',
  COMMAND: 'command',
  
  // Synth → Controller  
  PONG: 'pong',
  
  // WebRTC Signaling (handled by server)
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE: 'ice',
  
  // Banking commands (subset of COMMAND)
  SAVE_TO_BANK: 'save_to_bank',
  LOAD_FROM_BANK: 'load_from_bank'
};

export const CommandNames = {
  POWER: 'power',
  SAVE: 'save',
  LOAD: 'load',
  REQUEST_STATE: 'request-state' // Deprecated but kept for compatibility
};

export const MessageSchemas = {
  // Complete program update with all state
  [MessageTypes.PROGRAM]: {
    required: ['type', 'program', 'timestamp'],
    properties: {
      type: { const: MessageTypes.PROGRAM },
      program: {
        type: 'object',
        required: ['parameters'],
        properties: {
          parameters: {
            type: 'object',
            properties: {
              fundamentalFrequency: { type: 'number', min: 20, max: 20000 },
              bowPressure: { type: 'number', min: 0, max: 1 },
              bowSpeed: { type: 'number', min: 0, max: 1 },
              bowPosition: { type: 'number', min: 0, max: 1 },
              stringDamping: { type: 'number', min: 0, max: 1 },
              stringTension: { type: 'number', min: 0, max: 1 },
              gain: { type: 'number', min: 0, max: 1 },
              reverbMix: { type: 'number', min: 0, max: 1 },
              filterCutoff: { type: 'number', min: 20, max: 20000 },
              filterResonance: { type: 'number', min: 0, max: 1 },
              vibratoRate: { type: 'number', min: 0, max: 20 },
              vibratoDepth: { type: 'number', min: 0, max: 1 },
              tremoloRate: { type: 'number', min: 0, max: 20 },
              tremoloDepth: { type: 'number', min: 0, max: 1 },
              detuneAmount: { type: 'number', min: -100, max: 100 },
              masterGain: { type: 'number', min: 0, max: 1 }
            }
          },
          chord: {
            type: 'object',
            properties: {
              frequencies: { type: 'array', items: { type: 'number' } },
              noteNames: { type: 'array', items: { type: 'string' } },
              expressions: { type: 'object' }
            }
          },
          parts: {
            type: 'object',
            properties: {
              assignments: { type: 'Map' } // Map<synthId, {frequency, expression}>
            }
          },
          harmonicSelections: { type: 'object' },
          power: { type: 'boolean' } // Power state can be in program
        }
      },
      power: { type: 'boolean' }, // Or at top level
      transition: {
        type: 'object',
        properties: {
          duration: { type: 'number', min: 0 },
          stagger: { type: 'number', min: 0 },
          durationSpread: { type: 'number', min: 0 },
          glissando: { type: 'boolean' }
        }
      },
      timestamp: { type: 'number' }
    }
  },
  
  // Command messages (power, save, load, etc)
  [MessageTypes.COMMAND]: {
    required: ['type', 'name'],
    properties: {
      type: { const: MessageTypes.COMMAND },
      name: { enum: Object.values(CommandNames) },
      value: { type: 'any' }, // Depends on command
      bank: { type: 'number' }, // For save/load commands
      data: { type: 'object' }, // Additional command data
      timestamp: { type: 'number' }
    }
  },
  
  // Banking-specific commands (legacy support)
  [MessageTypes.SAVE_TO_BANK]: {
    required: ['type', 'bankNumber'],
    properties: {
      type: { const: MessageTypes.SAVE_TO_BANK },
      bankNumber: { type: 'number', min: 1, max: 16 },
      timestamp: { type: 'number' }
    }
  },
  
  [MessageTypes.LOAD_FROM_BANK]: {
    required: ['type', 'bankNumber'],
    properties: {
      type: { const: MessageTypes.LOAD_FROM_BANK },
      bankNumber: { type: 'number', min: 1, max: 16 },
      timestamp: { type: 'number' }
    }
  },
  
  // Synth response to ping
  [MessageTypes.PONG]: {
    required: ['type', 'timestamp'],
    properties: {
      type: { const: MessageTypes.PONG },
      timestamp: { type: 'number' },
      state: {
        type: 'object',
        properties: {
          synthId: { type: 'string' },
          isCalibrating: { type: 'boolean' },
          isPowered: { type: 'boolean' },
          hasProgram: { type: 'boolean' },
          audioContextState: { type: 'string' }
        }
      }
    }
  }
};

/**
 * Validate a message against its schema
 * @param {Object} message - Message to validate
 * @returns {boolean} True if valid
 * @throws {Error} If validation fails
 */
export function validateMessage(message) {
  if (!message || typeof message !== 'object') {
    throw new Error('Message must be an object');
  }
  
  if (!message.type) {
    throw new Error('Message must have a type property');
  }
  
  const schema = MessageSchemas[message.type];
  if (!schema) {
    throw new Error(`Unknown message type: ${message.type}`);
  }
  
  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in message)) {
        throw new Error(`Message type '${message.type}' requires field '${field}'`);
      }
    }
  }
  
  // Basic type validation (simplified - could use a proper schema validator)
  if (schema.properties) {
    for (const [key, spec] of Object.entries(schema.properties)) {
      if (key in message) {
        const value = message[key];
        
        // Check const values
        if (spec.const !== undefined && value !== spec.const) {
          throw new Error(`Field '${key}' must be '${spec.const}', got '${value}'`);
        }
        
        // Check enum values
        if (spec.enum && !spec.enum.includes(value)) {
          throw new Error(`Field '${key}' must be one of [${spec.enum.join(', ')}], got '${value}'`);
        }
        
        // Check basic types
        if (spec.type && spec.type !== 'any') {
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          if (actualType !== spec.type && spec.type !== 'Map') {
            throw new Error(`Field '${key}' must be type '${spec.type}', got '${actualType}'`);
          }
        }
        
        // Check numeric ranges
        if (spec.type === 'number' && typeof value === 'number') {
          if (spec.min !== undefined && value < spec.min) {
            throw new Error(`Field '${key}' must be >= ${spec.min}, got ${value}`);
          }
          if (spec.max !== undefined && value > spec.max) {
            throw new Error(`Field '${key}' must be <= ${spec.max}, got ${value}`);
          }
        }
      }
    }
  }
  
  return true;
}

/**
 * Message builder functions for type-safe message creation
 */
export const MessageBuilders = {
  /**
   * Build a program message
   * @param {Object} program - Program data
   * @param {boolean} power - Power state
   * @param {Object} transition - Optional transition config
   */
  program: (program, power = true, transition = null) => {
    const message = {
      type: MessageTypes.PROGRAM,
      program,
      power,
      timestamp: Date.now()
    };
    
    if (transition) {
      message.transition = transition;
    }
    
    return message;
  },
  
  /**
   * Build a command message
   * @param {string} name - Command name
   * @param {*} value - Command value
   * @param {Object} data - Additional data
   */
  command: (name, value = null, data = null) => {
    const message = {
      type: MessageTypes.COMMAND,
      name,
      timestamp: Date.now()
    };
    
    if (value !== null) {
      message.value = value;
    }
    
    if (data !== null) {
      message.data = data;
    }
    
    return message;
  },
  
  /**
   * Build a power command
   * @param {boolean} on - Power state
   */
  power: (on) => {
    return MessageBuilders.command(CommandNames.POWER, on);
  },
  
  /**
   * Build a save to bank command
   * @param {number} bankNumber - Bank number (1-16)
   */
  saveToBank: (bankNumber) => {
    return {
      type: MessageTypes.SAVE_TO_BANK,
      bankNumber,
      timestamp: Date.now()
    };
  },
  
  /**
   * Build a load from bank command
   * @param {number} bankNumber - Bank number (1-16)
   */
  loadFromBank: (bankNumber) => {
    return {
      type: MessageTypes.LOAD_FROM_BANK,
      bankNumber,
      timestamp: Date.now()
    };
  },
  
  /**
   * Build a pong response
   * @param {number} pingTimestamp - Original ping timestamp
   * @param {Object} state - Synth state
   */
  pong: (pingTimestamp, state) => {
    return {
      type: MessageTypes.PONG,
      timestamp: pingTimestamp, // Echo back the ping timestamp
      state
    };
  }
};

/**
 * Helper to extract message type safely
 * @param {Object} message - Message object
 * @returns {string|null} Message type or null
 */
export function getMessageType(message) {
  return message?.type || null;
}

/**
 * Helper to check if message is a specific type
 * @param {Object} message - Message object
 * @param {string} type - Type to check
 * @returns {boolean} True if message is of given type
 */
export function isMessageType(message, type) {
  return getMessageType(message) === type;
}