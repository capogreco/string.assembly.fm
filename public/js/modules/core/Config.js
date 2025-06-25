/**
 * Configuration Module for String Assembly FM
 * Centralized configuration management
 */

export const Config = {
  // WebSocket Configuration
  WS_URL: (() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}`;
  })(),

  // WebRTC Configuration
  RTC_CONFIG: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  },

  // Parameter Configuration
  PARAM_IDS: [
    "stringMaterial",
    "stringDamping",
    "bowPosition",
    "bowSpeed",
    "bowForce",
    "brightness",
    "vibratoRate",
    "trillSpeed",
    "trillArticulation",
    "tremoloSpeed",
    "tremoloArticulation",
    "masterGain",
    "transitionDuration",
    "transitionStagger",
    "transitionDurationSpread",
  ],

  // Expression Types
  EXPRESSION_TYPES: ["none", "vibrato", "trill", "tremolo"],

  // Harmonic Ratio Selectors
  HARMONIC_SELECTORS: {
    "vibrato-numerator": [1],
    "vibrato-denominator": [1],
    "trill-numerator": [1],
    "trill-denominator": [1],
    "tremolo-numerator": [1],
    "tremolo-denominator": [1],
  },

  // Default Program Values
  DEFAULT_PROGRAM: {
    stringMaterial: 0.5,
    stringDamping: 0.3,
    bowPosition: 0.5,
    bowSpeed: 0.4,
    bowForce: 0.6,
    brightness: 0.5,
    vibratoRate: 5.0,
    trillSpeed: 10.0,
    trillArticulation: 0.5,
    tremoloSpeed: 15.0,
    tremoloArticulation: 0.7,
    masterGain: 0.8,
    transitionDuration: 1.0,
    transitionStagger: 0.0,
    transitionDurationSpread: 0.0,
  },

  // UI Configuration
  UI: {
    PIANO_KEYS: 88,
    PIANO_START_NOTE: 21, // A0
    BANK_COUNT: 16,
    MAX_CHORD_SIZE: 12,
    STATUS_UPDATE_INTERVAL: 1000, // ms
    HEARTBEAT_INTERVAL: 5000, // ms
    RECONNECT_DELAY: 3000, // ms
  },

  // Audio Configuration
  AUDIO: {
    SAMPLE_RATE: 44100,
    BUFFER_SIZE: 256,
    MAX_POLYPHONY: 16,
    FREQUENCY_RANGE: {
      MIN: 20,
      MAX: 20000,
    },
    NOTE_RANGE: {
      MIN: 21, // A0
      MAX: 108, // C8
    },
  },

  // Storage Keys
  STORAGE_KEYS: {
    BANKS: "string-assembly-banks",
    DEBUG_CONFIG: "debug-config",
    USER_PREFERENCES: "user-preferences",
  },

  // Network Configuration
  NETWORK: {
    MAX_RECONNECT_ATTEMPTS: 5,
    RECONNECT_BACKOFF: 1.5, // Exponential backoff multiplier
    PING_INTERVAL: 5000, // ms
    CONNECTION_TIMEOUT: 10000, // ms
    MESSAGE_QUEUE_SIZE: 100,
  },

  // Debug Configuration
  DEBUG: {
    ENABLED: false,
    VERBOSE_LOGGING: false,
    PERFORMANCE_MONITORING: false,
  },
};

/**
 * Update ICE servers from server endpoint
 * @returns {Promise<void>}
 */
export async function fetchIceServers() {
  // REMOVED: console.log('[CONFIG-DEBUG] Raw ICE servers received:', rawServerData); // This caused a ReferenceError
  try {
    const response = await fetch("/ice-servers");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log("[CONFIG-DEBUG] Data received from /ice-servers:", data); // Log the actual fetched data

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

      Config.RTC_CONFIG.iceServers = standardizedIceServers; // Updates with standardized array
      if (window.Logger) {
        window.Logger.log(
          `ICE servers updated: ${JSON.stringify(data.ice_servers)}`,
          "connections",
        );
      }
      console.log(
        // Correctly reference Config.RTC_CONFIG
        "[CONFIG-DEBUG] Successfully updated Config.RTC_CONFIG.iceServers:",
        JSON.stringify(Config.RTC_CONFIG.iceServers, null, 2),
      );
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
    ); // Log the actual error
    if (window.Logger) {
      window.Logger.log(
        `Failed to fetch ICE servers: ${error.message}`,
        "error",
      );
    }
    // Keep default servers (Config.RTC_CONFIG.iceServers remains unchanged from its initial state)
  }
  // This log will now show the state after attempt to fetch,
  // which might be the defaults if fetch failed, or the new ones if successful.
  console.log(
    "[CONFIG-DEBUG] Final Config.RTC_CONFIG.iceServers after fetchIceServers call:",
    JSON.stringify(Config.RTC_CONFIG.iceServers, null, 2),
  );
}

/**
 * Force refresh ICE servers and clear any cached values
 * Useful for debugging connection issues
 * @returns {Promise<void>}
 */
export async function refreshIceServers() {
  console.log("[CONFIG-DEBUG] Force refreshing ICE servers...");

  // Clear existing servers first
  Config.RTC_CONFIG.iceServers = [];

  // Fetch fresh servers
  await fetchIceServers();

  console.log("[CONFIG-DEBUG] ICE servers refreshed");
  return Config.RTC_CONFIG.iceServers;
}
/**
 * Get configuration value by dot notation path
 * @param {string} path - Dot notation path (e.g., 'UI.PIANO_KEYS')
 * @returns {*} Configuration value
 */
export function getConfig(path) {
  return path.split(".").reduce((obj, key) => obj?.[key], Config);
}

/**
 * Set configuration value by dot notation path
 * @param {string} path - Dot notation path
 * @param {*} value - Value to set
 */
export function setConfig(path, value) {
  const keys = path.split(".");
  const lastKey = keys.pop();
  const target = keys.reduce((obj, key) => {
    if (!obj[key]) obj[key] = {};
    return obj[key];
  }, Config);
  target[lastKey] = value;
}

// Make Config available globally for backward compatibility
if (typeof window !== "undefined") {
  window.Config = Config;
}
