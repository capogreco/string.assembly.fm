/**
 * system.config.js - Unified configuration for String Assembly FM
 * Single source of truth for all configuration values
 */

export const SystemConfig = {
  // Network configuration
  network: {
    websocket: {
      url: (() => {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        return `${protocol}//${window.location.host}/ws`;
      })(),
      reconnectDelay: 2000, // milliseconds
      heartbeatInterval: 5000, // milliseconds
      pingInterval: 5000, // milliseconds
      maxReconnectAttempts: 5,
      reconnectBackoff: 1.5, // exponential backoff multiplier
      messageQueueSize: 100,
      maxQueueSize: 100, // alias for consistency
    },
    webrtc: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
      connectionTimeout: 10000, // milliseconds
      offerOptions: {
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      },
    },
  },

  // Audio configuration
  audio: {
    context: {
      sampleRate: 44100,
      latencyHint: "interactive",
    },
    worklets: {
      basePath: "/src/worklets/",
      modules: [
        "bowed_string_worklet.js",
        "reverb_worklet.js",
        "pink_noise.js",
        "white_noise.js",
        "lfo_worklet.js",
      ],
    },
    defaults: {
      masterVolume: 0.7,
      calibrationLevel: 0.7,
      bufferSize: 256,
      maxPolyphony: 16,
    },
    ranges: {
      frequency: { min: 20, max: 20000 },
      note: { min: 21, max: 108 }, // A0 to C8
    },
  },

  // Parameter definitions (consolidated from standard_parameters.js)
  parameters: {
    // Fundamental sound properties
    fundamentalFrequency: {
      name: "fundamentalFrequency",
      displayName: "Frequency",
      min: 80,
      max: 1200,
      default: 220,
      unit: "Hz",
      type: "float",
      category: "basic",
    },

    // Bow control parameters
    bowForce: {
      name: "bowForce",
      displayName: "Bow Force",
      min: 0,
      max: 1,
      default: 0.3,
      unit: "",
      type: "float",
      category: "bow",
    },
    bowPosition: {
      name: "bowPosition",
      displayName: "Bow Position",
      min: 0,
      max: 1,
      default: 0.1,
      unit: "",
      type: "float",
      category: "bow",
    },
    bowSpeed: {
      name: "bowSpeed",
      displayName: "Bow Speed",
      min: 0,
      max: 2,
      default: 0.5,
      unit: "",
      type: "float",
      category: "bow",
    },

    // String properties
    stringDamping: {
      name: "stringDamping",
      displayName: "String Damping",
      min: 0,
      max: 1,
      default: 0.1,
      unit: "",
      type: "float",
      category: "string",
    },
    stringMaterial: {
      name: "stringMaterial",
      displayName: "String Material",
      min: 0,
      max: 1,
      default: 0.5,
      unit: "",
      type: "float",
      category: "string",
    },

    // Expression controls
    vibratoRate: {
      name: "vibratoRate",
      displayName: "Vibrato Rate",
      min: 0,
      max: 10,
      default: 4,
      unit: "Hz",
      type: "float",
      category: "expression",
    },
    vibratoDepth: {
      name: "vibratoDepth",
      displayName: "Vibrato Depth",
      min: 0,
      max: 0.1,
      default: 0.01,
      unit: "",
      type: "float",
      category: "expression",
    },
    vibratoEnabled: {
      name: "vibratoEnabled",
      displayName: "Vibrato On",
      default: 0, // Using 0/1 for consistency with worklets
      type: "int",
      category: "expression",
    },

    trillInterval: {
      name: "trillInterval",
      displayName: "Trill Interval",
      min: 1,
      max: 12,
      default: 2,
      unit: "semitones",
      type: "int",
      category: "expression",
    },
    trillSpeed: {
      name: "trillSpeed",
      displayName: "Trill Speed",
      min: 1,
      max: 20,
      default: 8,
      unit: "Hz",
      type: "float",
      category: "expression",
    },
    trillArticulation: {
      name: "trillArticulation",
      displayName: "Trill Articulation",
      min: 0,
      max: 1,
      default: 0.5,
      unit: "",
      type: "float",
      category: "expression",
    },
    trillEnabled: {
      name: "trillEnabled",
      displayName: "Trill On",
      default: 0,
      type: "int",
      category: "expression",
    },

    tremoloSpeed: {
      name: "tremoloSpeed",
      displayName: "Tremolo Speed",
      min: 1,
      max: 30,
      default: 10,
      unit: "Hz",
      type: "float",
      category: "expression",
    },
    tremoloDepth: {
      name: "tremoloDepth",
      displayName: "Tremolo Depth",
      min: 0,
      max: 1,
      default: 0.3,
      unit: "",
      type: "float",
      category: "expression",
    },
    tremoloArticulation: {
      name: "tremoloArticulation",
      displayName: "Tremolo Articulation",
      min: 0,
      max: 1,
      default: 0.8,
      unit: "",
      type: "float",
      category: "expression",
    },
    tremoloEnabled: {
      name: "tremoloEnabled",
      displayName: "Tremolo On",
      default: 0,
      type: "int",
      category: "expression",
    },

    // Tonal characteristics
    brightness: {
      name: "brightness",
      displayName: "Brightness",
      min: 0,
      max: 1,
      default: 0.5,
      unit: "",
      type: "float",
      category: "tone",
    },
    bodyType: {
      name: "bodyType",
      displayName: "Body Type",
      min: 0,
      max: 1,
      default: 0.5,
      unit: "",
      type: "float",
      category: "tone",
    },
    bodyResonance: {
      name: "bodyResonance",
      displayName: "Body Resonance",
      min: 0,
      max: 1,
      default: 0.7,
      unit: "",
      type: "float",
      category: "tone",
    },
    detune: {
      name: "detune",
      displayName: "Detune",
      min: 0,
      max: 1,
      default: 0,
      unit: "",
      type: "float",
      category: "tone",
    },

    // Output control
    masterGain: {
      name: "masterGain",
      displayName: "Master Gain",
      min: 0,
      max: 1,
      default: 0.8,
      unit: "",
      type: "float",
      category: "output",
    },
    power: {
      name: "power",
      displayName: "Power",
      default: 1,
      type: "int",
      category: "output",
    },

    // Reverb control (Arc parameter)
    reverb: {
      name: "reverb",
      displayName: "Reverb",
      min: 0,
      max: 1,
      default: 0,
      unit: "",
      type: "float",
      category: "effects",
    },
  },

  // Parameter categories
  parameterCategories: {
    basic: { name: "Basic", order: 1 },
    bow: { name: "Bow Control", order: 2 },
    string: { name: "String Properties", order: 3 },
    expression: { name: "Expression", order: 4 },
    tone: { name: "Tone Shaping", order: 5 },
    effects: { name: "Effects", order: 6 },
    output: { name: "Output", order: 7 },
  },

  // UI configuration
  ui: {
    piano: {
      totalKeys: 88,
      startNote: 21, // A0
      whiteKeyWidth: 40,
      blackKeyWidth: 30,
      keyHeight: 150,
      blackKeyHeight: 100,
    },
    expressions: {
      colors: {
        vibrato: "#e74c3c", // red
        trill: "#3498db", // blue
        tremolo: "#f39c12", // orange
        none: "#95a5a6", // gray
      },
      thresholds: {
        vibrato: 20, // pixels
        tremolo: 40, // pixels
        trill: 60, // pixels
      },
    },
    transitions: {
      durationRange: { min: 0, max: 40, default: 1 }, // seconds
      staggerRange: { min: 0, max: 100, default: 0 }, // percentage
      durationSpreadRange: { min: 0, max: 100, default: 0 }, // percentage
    },
    banking: {
      totalBanks: 16,
      saveDuration: 500, // milliseconds for visual feedback
    },
    harmonicSelectors: {
      "vibrato-numerator": [1],
      "vibrato-denominator": [1],
      "trill-numerator": [1],
      "trill-denominator": [1],
      "tremolo-numerator": [1],
      "tremolo-denominator": [1],
    },
    statusUpdateInterval: 1000, // milliseconds
    animationDuration: 300, // milliseconds for UI animations
  },

  // System defaults
  system: {
    ensemble: {
      defaultCount: 6,
      minCount: 1,
      maxCount: 12,
    },
    storage: {
      prefix: "string-assembly-",
      bankKey: "banks",
      debugKey: "debug-config",
      preferencesKey: "user-preferences",
    },
    logging: {
      enabled: true,
      categories: {
        lifecycle: true,
        connections: true,
        messages: true,
        errors: true,
        parameters: false,
        performance: false,
      },
    },
  },

  // Expression type definitions
  expressions: {
    types: ["none", "vibrato", "trill", "tremolo"],
    defaultType: "none",
  },
};

// Utility functions
export const ConfigUtils = {
  /**
   * Get all parameter names
   */
  getParameterNames() {
    return Object.keys(SystemConfig.parameters);
  },

  /**
   * Get program parameters (excludes UI-only parameters)
   */
  getProgramParameters() {
    // Return parameters that should be saved in programs
    return Object.keys(SystemConfig.parameters).filter((name) => {
      // Exclude transition parameters (these are not defined in SystemConfig.parameters)
      if (
        [
          "transitionDuration",
          "transitionStagger",
          "transitionDurationSpread",
        ].includes(name)
      ) {
        return false;
      }
      const category = SystemConfig.parameters[name].category;
      // Exclude output category (masterGain, power) from saved parameters
      return category !== "output";
    });
  },

  /**
   * Get parameters by category
   */
  getParametersByCategory(category) {
    return Object.entries(SystemConfig.parameters)
      .filter(([name, def]) => def.category === category)
      .reduce((acc, [name, def]) => {
        acc[name] = def;
        return acc;
      }, {});
  },

  /**
   * Get default program with all parameters at default values
   */
  getDefaultProgram() {
    const program = {};
    for (const [paramName, paramDef] of Object.entries(
      SystemConfig.parameters,
    )) {
      program[paramName] = paramDef.default;
    }
    return program;
  },

  /**
   * Validate parameter value against its definition
   */
  validateParameter(paramName, value) {
    const paramDef = SystemConfig.parameters[paramName];
    if (!paramDef) {
      return { valid: false, error: `Unknown parameter: ${paramName}` };
    }

    if (paramDef.type === "int") {
      if (
        !Number.isInteger(value) ||
        value < (paramDef.min || 0) ||
        value > (paramDef.max || 1)
      ) {
        return {
          valid: false,
          error: `${paramName} must be integer between ${paramDef.min || 0} and ${paramDef.max || 1}`,
        };
      }
    } else if (paramDef.type === "float") {
      if (
        typeof value !== "number" ||
        value < paramDef.min ||
        value > paramDef.max
      ) {
        return {
          valid: false,
          error: `${paramName} must be number between ${paramDef.min} and ${paramDef.max}`,
        };
      }
    }

    return { valid: true };
  },

  /**
   * Clamp parameter value to valid range
   */
  clampParameter(paramName, value) {
    const paramDef = SystemConfig.parameters[paramName];
    if (!paramDef) return value;

    if (paramDef.type === "int") {
      return Math.round(
        Math.max(paramDef.min || 0, Math.min(paramDef.max || 1, value)),
      );
    } else if (paramDef.type === "float") {
      return Math.max(paramDef.min, Math.min(paramDef.max, value));
    }

    return value;
  },

  /**
   * Get storage key with prefix
   */
  getStorageKey(key) {
    return SystemConfig.system.storage.prefix + key;
  },
};

/**
 * Update ICE servers from server endpoint
 * @returns {Promise<void>}
 */
export async function fetchIceServers() {
  try {
    const response = await fetch("/ice-servers");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    if (data.ice_servers && Array.isArray(data.ice_servers)) {
      // Standardize ICE server objects to only use 'urls'
      const standardizedIceServers = data.ice_servers.map((server) => {
        const newServer = { ...server };
        if (newServer.url && !newServer.urls) {
          // If only 'url' exists, move it to 'urls'
          newServer.urls = newServer.url;
        }
        delete newServer.url; // Remove the non-standard 'url' property
        return newServer;
      });

      SystemConfig.network.webrtc.iceServers = standardizedIceServers;
      if (window.Logger) {
        window.Logger.log(
          `ICE servers updated: ${JSON.stringify(data.ice_servers)}`,
          "connections",
        );
      }
    } else {
      console.warn(
        "[CONFIG-DEBUG] Fetched data.ice_servers is missing or not an array:",
        data,
      );
      if (window.Logger) {
        window.Logger.log(
          "Fetched ICE server data is invalid, keeping defaults.",
          "error",
        );
      }
    }
  } catch (error) {
    console.error(
      "[CONFIG-DEBUG] Failed to fetch or process ICE servers:",
      error,
    );
    if (window.Logger) {
      window.Logger.log(
        `Failed to fetch ICE servers: ${error.message}`,
        "error",
      );
    }
    // Keep default servers
  }
}

// Make available globally for backward compatibility during migration
if (typeof window !== "undefined") {
  window.SystemConfig = SystemConfig;
  window.ConfigUtils = ConfigUtils;
  window.fetchIceServers = fetchIceServers;
}
