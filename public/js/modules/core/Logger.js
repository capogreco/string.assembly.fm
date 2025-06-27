/**
 * Enhanced Logger Module for String Assembly FM
 * Provides categorized logging with runtime toggles
 */

export class Logger {
  static categories = {
    connections: false, // WebSocket, WebRTC connections
    messages: false, // Message passing between peers
    parameters: false, // Parameter changes
    expressions: false, // Chord and expression changes
    performance: false, // Latency, pings
    lifecycle: false, // Important state changes (now off by default)
    errors: true, // Always on
    debug: false, // Debug messages
  };

  /**
   * Log a message with optional category
   * @param {string} message - The message to log
   * @param {string} category - The log category (default: 'lifecycle')
   */
  static log(message, category = "lifecycle") {
    // Always show errors
    if (category === "error") {
      console.error(`[${new Date().toLocaleTimeString()}] [ERROR] ${message}`);
      return;
    }

    // Check if category is enabled
    if (!Logger.categories[category]) {
      return;
    }

    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}] [${category.toUpperCase()}]`;
    console.log(`${prefix} ${message}`);
  }

  /**
   * Enable logging for a specific category
   * @param {string} category - The category to enable
   */
  static enable(category) {
    if (category in Logger.categories) {
      Logger.categories[category] = true;
      Logger.log(`Debug logging enabled for: ${category}`, "lifecycle");
    } else {
      Logger.log(`Unknown log category: ${category}`, "error");
    }
  }

  /**
   * Disable logging for a specific category
   * @param {string} category - The category to disable
   */
  static disable(category) {
    if (category in Logger.categories && category !== "errors") {
      Logger.categories[category] = false;
      Logger.log(`Debug logging disabled for: ${category}`, "lifecycle");
    } else if (category === "errors") {
      Logger.log("Cannot disable error logging", "error");
    } else {
      Logger.log(`Unknown log category: ${category}`, "error");
    }
  }

  /**
   * Get current logging configuration
   * @returns {Object} Current category settings
   */
  static getConfig() {
    return { ...Logger.categories };
  }

  /**
   * Set logging configuration
   * @param {Object} config - New category settings
   */
  static setConfig(config) {
    for (const [category, enabled] of Object.entries(config)) {
      if (category in Logger.categories) {
        Logger.categories[category] = enabled;
      }
    }
  }

  /**
   * Load configuration from localStorage
   * @param {string} storageKey - Key to use for localStorage (default: 'debug-config')
   */
  static loadConfig(storageKey = "debug-config") {
    try {
      const savedConfig = localStorage.getItem(storageKey);
      if (savedConfig) {
        const config = JSON.parse(savedConfig);
        Logger.setConfig(config);
        Logger.log("Loaded debug configuration from storage", "lifecycle");
      }
    } catch (e) {
      Logger.log(`Failed to load debug config: ${e}`, "error");
    }
  }

  /**
   * Save configuration to localStorage
   * @param {string} storageKey - Key to use for localStorage (default: 'debug-config')
   */
  static saveConfig(storageKey = "debug-config") {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Logger.categories));
      Logger.log("Saved debug configuration to storage", "lifecycle");
    } catch (e) {
      Logger.log(`Failed to save debug config: ${e}`, "error");
    }
  }

  /**
   * Initialize logger with DOM controls (if available)
   */
  static initializeControls() {
    // Load saved configuration
    Logger.loadConfig();

    // Set up DOM controls if available
    if (typeof document !== "undefined") {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          Logger.setupDOMControls();
        });
      } else {
        Logger.setupDOMControls();
      }
    }
  }

  /**
   * Set up DOM controls for debug checkboxes
   * @private
   */
  static setupDOMControls() {
    const checkboxes = document.querySelectorAll("[data-debug]");

    checkboxes.forEach((checkbox) => {
      const category = checkbox.dataset.debug;
      if (category in Logger.categories) {
        checkbox.checked = Logger.categories[category];
        checkbox.addEventListener("change", (e) => {
          Logger.categories[category] = e.target.checked;
          Logger.saveConfig();
          Logger.log(
            `Debug logging ${e.target.checked ? "enabled" : "disabled"} for: ${category}`,
            "lifecycle",
          );
        });
      }
    });
  }
}

// Initialize logger when module loads
Logger.initializeControls();

// Make Logger available globally for backward compatibility
if (typeof window !== "undefined") {
  window.Logger = Logger;

  // Create global log function for backward compatibility
  window.log = Logger.log.bind(Logger);

  // Expose DEBUG_CONFIG for backward compatibility
  window.DEBUG_CONFIG = Logger.categories;
  
  // Simple helpers for console
  window.enableLogs = () => {
    Logger.categories.lifecycle = true;
    Logger.categories.messages = true;
    Logger.categories.connections = true;
    console.log("Logging enabled");
  };
  
  window.disableLogs = () => {
    Logger.categories.lifecycle = false;
    Logger.categories.messages = false;
    Logger.categories.connections = false;
    console.log("Logging disabled (errors still shown)");
  };
  
  window.debugMode = (enable = true) => {
    if (enable) {
      Object.keys(Logger.categories).forEach(cat => {
        if (cat !== 'errors') Logger.categories[cat] = true;
      });
      console.log("Debug mode ON - all logging enabled");
    } else {
      Object.keys(Logger.categories).forEach(cat => {
        if (cat !== 'errors') Logger.categories[cat] = false;
      });
      console.log("Debug mode OFF - only errors shown");
    }
  };
}
