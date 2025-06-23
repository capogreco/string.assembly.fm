// Mark that modular system is loading to prevent legacy system from running
window.__modularSystemActive = true;
console.log("[MODULAR] Setting modular system active flag");

/**
 * String Assembly FM Controller - Modular Version
 * Main application entry point
 */

// Import core modules
import { Logger } from "./modules/core/Logger.js";
import { Config, fetchIceServers } from "./modules/core/Config.js";
import { eventBus } from "./modules/core/EventBus.js";
import { appState } from "./modules/state/AppState.js";
import { programManager } from "./modules/state/ProgramManager.js";
import { networkCoordinator } from "./modules/network/NetworkCoordinator.js";
import { uiManager } from "./modules/ui/UIManager.js";
import { parameterControls } from "./modules/ui/ParameterControls.js";
import { pianoKeyboard } from "./modules/ui/PianoKeyboard.js";
import { expressionManager } from "./modules/audio/ExpressionManager.js";
import { chordManager } from "./modules/audio/ChordManager.js";
import { AudioUtilities } from "./modules/utils/AudioUtilities.js";

// ========== WebSocket Debugging ==========
// Monitor WebSocket creation and messages to debug connection issues
(() => {
  console.log("[WEBSOCKET-DEBUG] Installing WebSocket monitor...");
  // Wrap WebSocket constructor
  let wsCount = 0;
  let activeWebSockets = 0;
  const allWebSockets = new Map();
  const OriginalWebSocket = window.WebSocket;
  window.WebSocket = function (...args) {
    wsCount++;
    activeWebSockets++;
    const wsId = wsCount;
    console.log(`[WEBSOCKET-DEBUG] Creating WebSocket #${wsCount}:`, args[0]);
    console.log(
      `[WEBSOCKET-DEBUG] Active WebSocket count: ${activeWebSockets}`,
    );
    const ws = new OriginalWebSocket(...args);

    // Store WebSocket info
    allWebSockets.set(wsId, {
      url: args[0],
      messageCount: 0,
      handlers: [],
    });

    // Track all message handlers
    const messageHandlers = [];

    // Monitor message events
    const originalAddEventListener = ws.addEventListener;
    ws.addEventListener = function (type, listener, options) {
      if (type === "message") {
        console.log(
          `[WEBSOCKET-DEBUG] Message listener added to WebSocket #${wsCount}`,
        );
        messageHandlers.push({
          type: "addEventListener",
          listener: listener.toString().substring(0, 100) + "...",
          stack: new Error().stack,
        });
        console.log(
          `[WEBSOCKET-DEBUG] Total message handlers: ${messageHandlers.length}`,
        );
      }
      return originalAddEventListener.call(this, type, listener, options);
    };

    // Monitor actual messages
    ws.addEventListener("message", function (event) {
      const wsInfo = allWebSockets.get(wsId);
      if (wsInfo) wsInfo.messageCount++;

      const preview = event.data.substring(0, 200);
      console.log(`[WEBSOCKET-DEBUG] WebSocket #${wsId} received:`, preview);
      console.log(
        `[WEBSOCKET-DEBUG] Total messages on WS #${wsId}: ${wsInfo?.messageCount}`,
      );

      // Try to parse and log message type
      try {
        const msg = JSON.parse(event.data);
        console.log(
          `[WEBSOCKET-DEBUG] WS #${wsId} - Message type: ${msg.type}, source: ${msg.source || "N/A"}`,
        );

        // Special tracking for offer messages
        if (msg.type === "offer") {
          console.log(
            `[WEBSOCKET-DEBUG] *** OFFER MESSAGE DETECTED ON WS #${wsId} ***`,
          );
          console.log(`[WEBSOCKET-DEBUG] Offer from: ${msg.source}`);
          console.log(`[WEBSOCKET-DEBUG] Offer to: ${msg.target}`);
          console.log(
            `[WEBSOCKET-DEBUG] Message handlers registered: ${messageHandlers.length}`,
          );
          console.log(`[WEBSOCKET-DEBUG] All active WebSockets:`);
          allWebSockets.forEach((info, id) => {
            console.log(
              `[WEBSOCKET-DEBUG]   WS #${id}: ${info.url}, messages: ${info.messageCount}, handlers: ${info.handlers.length}`,
            );
          });
          messageHandlers.forEach((handler, index) => {
            console.log(
              `[WEBSOCKET-DEBUG] Handler #${index + 1}: ${handler.type}`,
            );
          });
        }
      } catch (e) {
        // Not JSON
      }
    });

    // Intercept onmessage property
    let _onmessage = null;
    Object.defineProperty(ws, "onmessage", {
      get() {
        return _onmessage;
      },
      set(handler) {
        console.log(
          `[WEBSOCKET-DEBUG] WebSocket #${wsCount} onmessage handler set`,
        );
        _onmessage = function (event) {
          console.log(
            `[WEBSOCKET-DEBUG] WebSocket #${wsCount} onmessage triggered:`,
            event.data.substring(0, 100),
          );
          return handler.call(this, event);
        };
      },
    });

    // Monitor open events
    ws.addEventListener("open", function (event) {
      console.log(
        `[WEBSOCKET-DEBUG] WebSocket #${wsId} OPENED - readyState: ${ws.readyState}`,
      );
    });

    // Monitor close events
    ws.addEventListener("close", function (event) {
      activeWebSockets--;
      console.log(
        `[WEBSOCKET-DEBUG] WebSocket #${wsId} closed. Code: ${event.code}, Reason: ${event.reason}`,
      );
      console.log(
        `[WEBSOCKET-DEBUG] Active WebSocket count: ${activeWebSockets}`,
      );
      allWebSockets.delete(wsId);
    });

    // Monitor error events
    ws.addEventListener("error", function (event) {
      console.log(
        `[WEBSOCKET-DEBUG] WebSocket #${wsCount} ERROR:`,
        event.error || "Unknown error",
      );
    });

    // Monitor readyState changes
    const checkReadyState = () => {
      console.log(
        `[WEBSOCKET-DEBUG] WebSocket #${wsCount} readyState: ${ws.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`,
      );
    };

    // Check initial state
    checkReadyState();

    // Also log when properties are accessed
    // Monitor send
    const originalSend = ws.send;
    ws.send = function (data) {
      console.log(
        `[WEBSOCKET-DEBUG] WebSocket #${wsId} sending data, readyState: ${this.readyState}`,
      );
      try {
        const msg = JSON.parse(data);
        if (msg.type === "offer" || msg.type === "answer") {
          console.log(
            `[WEBSOCKET-DEBUG] WS #${wsId} sending ${msg.type} to ${msg.target}`,
          );
        }
      } catch (e) {
        // Not JSON
      }
      return originalSend.call(this, data);
    };

    return ws;
  };

  console.log("[WEBSOCKET-DEBUG] WebSocket monitor installed");

  // Add global function to check WebSocket count
  window.getActiveWebSocketCount = () => activeWebSockets;
})();
// ========== End WebSocket Debugging ==========/

/**
 * Initialize the modular application
 */
async function initializeApp() {
  try {
    Logger.log(
      "Initializing String Assembly FM Controller (Modular)",
      "lifecycle",
    );

    // Initialize core systems
    try {
      await initializeCore();
    } catch (error) {
      Logger.log(`Failed to initialize core systems: ${error}`, "error");
      console.error("Core initialization error:", error);
      throw error;
    }

    // Initialize state management
    try {
      initializeState();
    } catch (error) {
      Logger.log(`Failed to initialize state management: ${error}`, "error");
      console.error("State initialization error:", error);
      throw error;
    }

    // Initialize program management
    try {
      initializeProgramManager();
    } catch (error) {
      Logger.log(`Failed to initialize program management: ${error}`, "error");
      console.error("Program manager initialization error:", error);
      throw error;
    }

    // Initialize network layer
    try {
      await initializeNetwork();
    } catch (error) {
      Logger.log(`Failed to initialize network layer: ${error}`, "error");
      console.error("Network initialization error:", error);
      throw error;
    }

    // Initialize UI components
    try {
      await initializeUI();
    } catch (error) {
      Logger.log(`Failed to initialize UI: ${error}`, "error");
      console.error("UI initialization error:", error);
      throw error;
    }

    // Initialize audio system
    try {
      await initializeAudio();
    } catch (error) {
      Logger.log(`Failed to initialize audio system: ${error}`, "error");
      console.error("Audio initialization error:", error);
      throw error;
    }

    // Set up event listeners
    try {
      setupGlobalEventListeners();
    } catch (error) {
      Logger.log(`Failed to set up event listeners: ${error}`, "error");
      console.error("Event listener setup error:", error);
      throw error;
    }

    Logger.log("Application initialized successfully", "lifecycle");
    Logger.log("Application ready (modular-v1.0)", "lifecycle");

    // Mark as ready
    appState.set("connectionStatus", "ready");

    // Set global flag to indicate modular system is fully loaded
    window.__modularSystemLoaded = true;
    console.log("[MODULAR] Modular system fully loaded and initialized");
  } catch (error) {
    Logger.log(`Failed to initialize application: ${error}`, "error");
    throw error;
  }
}

/**
 * Initialize core systems
 */
async function initializeCore() {
  Logger.log("Initializing core systems...", "lifecycle");

  // Fetch ICE servers
  await fetchIceServers();

  // Set up debug configuration persistence
  Logger.loadConfig();

  Logger.log("Core systems initialized", "lifecycle");
}

/**
 * Initialize state management
 */
function initializeState() {
  Logger.log("Initializing state management...", "lifecycle");

  // Set initial connection status
  appState.set("connectionStatus", "initializing");

  // Subscribe to state changes for debugging
  if (Logger.categories.lifecycle) {
    appState.subscribeAll((key, newValue, oldValue) => {
      Logger.log(
        `State change: ${key} = ${JSON.stringify(newValue)}`,
        "lifecycle",
      );
    });
  }

  Logger.log("State management initialized", "lifecycle");
}

/**
 * Initialize program management
 */
function initializeProgramManager() {
  Logger.log("Initializing program management...", "lifecycle");

  // Load saved banks from storage
  programManager.loadBanksFromStorage();

  // Subscribe to program events
  eventBus.on("program:saved", (data) => {
    Logger.log(`Program saved to Bank ${data.bankId}`, "lifecycle");
  });

  eventBus.on("program:loaded", (data) => {
    Logger.log(`Program loaded from Bank ${data.bankId}`, "lifecycle");
  });

  eventBus.on("program:cleared", (data) => {
    Logger.log(`Bank ${data.bankId} cleared`, "lifecycle");
  });

  Logger.log("Program management initialized", "lifecycle");
}

/**
 * Initialize network layer
 */
async function initializeNetwork() {
  Logger.log("Initializing network layer...", "lifecycle");

  // Initialize network coordinator
  await networkCoordinator.initialize();

  // Set up network event handlers
  setupNetworkEventHandlers();

  // Connect to WebSocket server
  try {
    await networkCoordinator.connect();
    Logger.log("Network connection established", "lifecycle");
  } catch (error) {
    Logger.log(`Failed to connect to network: ${error}`, "error");
  }

  Logger.log("Network layer initialized", "lifecycle");
}

/**
 * Initialize UI layer
 */
async function initializeUI() {
  Logger.log("Initializing UI layer...", "lifecycle");

  // Initialize UI manager
  uiManager.initialize();

  // Initialize parameter controls
  parameterControls.initialize();

  // Initialize piano keyboard
  pianoKeyboard.initialize();

  // Set up UI event handlers
  setupUIEventHandlers();

  Logger.log("UI layer initialized", "lifecycle");
}

/**
 * Initialize audio system
 */
async function initializeAudio() {
  Logger.log("Initializing audio system...", "lifecycle");

  // Initialize expression manager
  expressionManager.initialize();

  // Initialize chord manager
  chordManager.initialize();

  // Set up audio event handlers
  setupAudioEventHandlers();

  Logger.log("Audio system initialized", "lifecycle");
}

/**
 * Set up audio event handlers
 */
function setupAudioEventHandlers() {
  // Handle expression assignments
  expressionManager.on("updated", (data) => {
    Logger.log(
      `Expressions updated: ${data.expressions.length} expressions, mode: ${data.expressionMode}`,
      "expressions",
    );
  });

  // Handle chord distribution
  chordManager.on("distributed", (data) => {
    Logger.log(
      `Chord distributed: ${data.noteNames.join(", ")} to ${Object.keys(data.distribution.assignments).length} synths`,
      "expressions",
    );
  });

  // Handle chord algorithm changes
  chordManager.on("algorithmChanged", (data) => {
    Logger.log(
      `Chord distribution algorithm changed: ${data.algorithm}`,
      "expressions",
    );
  });
}

/**
 * Set up UI event handlers
 */
function setupUIEventHandlers() {
  // Handle parameter changes
  parameterControls.on("changed", (data) => {
    Logger.log(
      `Parameter changed: ${data.paramId} = ${data.value}`,
      "parameters",
    );

    // Send parameter updates to connected synths
    if (window.networkCoordinator) {
      const currentProgram = parameterControls.getAllParameterValues();
      window.networkCoordinator.broadcastProgram(currentProgram);
    }
  });

  // Handle chord changes from piano
  pianoKeyboard.on("chordChanged", (data) => {
    Logger.log(`Chord changed: ${data.noteNames.join(", ")}`, "expressions");

    // Update chord state for distribution
    appState.set("currentChord", data.chord);

    // Trigger chord distribution
    chordManager.setChord(data.chord);
  });

  // Handle program save/load UI feedback
  programManager.on &&
    programManager.on("saved", (data) => {
      uiManager.showNotification(
        `Program saved to Bank ${data.bankId}`,
        "success",
        2000,
      );
    });

  programManager.on &&
    programManager.on("loaded", (data) => {
      uiManager.showNotification(
        `Program loaded from Bank ${data.bankId}`,
        "info",
        2000,
      );
    });
}

/**
 * Set up network event handlers
 */
function setupNetworkEventHandlers() {
  // Handle synth connections
  networkCoordinator.on("synthConnected", (data) => {
    Logger.log(`Synth connected: ${data.synthId}`, "connections");

    // Auto-send current program to newly connected synth
    const currentProgram =
      appState.get("currentProgram") || programManager.createExampleProgram();
    networkCoordinator.sendProgramToSynth(data.synthId, currentProgram);
  });

  // Handle program requests from synths
  networkCoordinator.on("programRequested", (data) => {
    Logger.log(`Program requested by: ${data.synthId}`, "messages");

    // Send current program or default program
    const currentProgram =
      appState.get("currentProgram") || programManager.createExampleProgram();
    networkCoordinator.sendProgramToSynth(data.synthId, currentProgram);
  });

  // Handle controller kick events
  networkCoordinator.on("kicked", (data) => {
    Logger.log(
      "This controller was kicked by another controller",
      "connections",
    );
    appState.set("connectionStatus", "kicked");
  });

  // Handle controller list updates
  networkCoordinator.on("controllerListUpdated", (data) => {
    Logger.log(
      `Controller list updated: ${data.controllers?.length || 0} controllers`,
      "connections",
    );
  });
}

/**
 * Set up global event listeners
 */
function setupGlobalEventListeners() {
  Logger.log("Setting up global event listeners...", "lifecycle");

  // Listen for app events
  eventBus.on("app:initialized", (data) => {
    Logger.log(`Application ready (${data.version})`, "lifecycle");
    appState.set("connectionStatus", "ready");
  });

  // Listen for state reset requests
  eventBus.on("app:reset", () => {
    Logger.log("Resetting application state...", "lifecycle");
    appState.reset();
  });

  // Handle page unload
  window.addEventListener("beforeunload", () => {
    Logger.log("Application shutting down...", "lifecycle");
    Logger.saveConfig();
    eventBus.emit("app:shutdown");
  });

  // Handle page visibility changes
  document.addEventListener("visibilitychange", () => {
    const visible = !document.hidden;
    eventBus.emit("app:visibilityChanged", { visible });
    Logger.log(`Application ${visible ? "visible" : "hidden"}`, "lifecycle");
  });

  Logger.log("Global event listeners set up", "lifecycle");
}

/**
 * Compatibility layer for legacy code
 */
function setupCompatibilityLayer() {
  Logger.log("Setting up compatibility layer...", "lifecycle");

  // Expose modular components globally for gradual migration
  window.modular = {
    Logger,
    Config,
    eventBus,
    appState,
    programManager,
    networkCoordinator,
    uiManager,
    parameterControls,
    pianoKeyboard,
    expressionManager,
    chordManager,
    AudioUtilities,
    initialized: true,
  };

  // Create legacy-compatible interfaces
  window.log = Logger.log.bind(Logger);
  window.DEBUG_CONFIG = Logger.categories;

  // Legacy AppState interface
  window.AppState = {
    current_program: null,
    current_chord_state: null,
    program_banks: new Map(),
    harmonicSelections: appState.get("harmonicSelections"),
  };

  // Sync legacy state with modular state
  appState.subscribe("currentProgram", (newValue) => {
    window.AppState.current_program = newValue;
    window.current_program = newValue;
  });

  appState.subscribe("currentChordState", (newValue) => {
    window.AppState.current_chord_state = newValue;
    window.current_chord_state = newValue;
  });

  appState.subscribe("currentChord", (newValue) => {
    window.currentChord = newValue;
  });

  Logger.log("Compatibility layer ready", "lifecycle");
}

/**
 * Error handling
 */
window.addEventListener("error", (event) => {
  Logger.log(`Unhandled error: ${event.error}`, "error");
});

window.addEventListener("unhandledrejection", (event) => {
  Logger.log(`Unhandled promise rejection: ${event.reason}`, "error");
});

/**
 * Development utilities
 */
if (Config.DEBUG.ENABLED) {
  window.dev = {
    Logger,
    Config,
    eventBus,
    appState,
    programManager,
    networkCoordinator,
    uiManager,
    parameterControls,
    pianoKeyboard,
    expressionManager,
    chordManager,
    AudioUtilities,
    resetApp: () => eventBus.emit("app:reset"),
    getState: () => appState.getState(),
    getHistory: () => appState.getHistory(),
    getBanks: () => programManager.getSavedBanks(),
    getNetworkStatus: () => networkCoordinator.getNetworkStatus(),
    getChordInfo: () => pianoKeyboard.getChordInfo(),
    getAllParams: () => parameterControls.getAllParameterValues(),
    testSave: () => programManager.saveToBank(1, Config.DEFAULT_PROGRAM),
    testLoad: () => programManager.loadFromBank(1),
    testConnect: () => networkCoordinator.connect(),
    testDisconnect: () => networkCoordinator.disconnect(),
    testChord: () => pianoKeyboard.setChord([261.63, 329.63, 392.0]), // C major
    testParam: () => parameterControls.setParameterValue("masterGain", 0.8),
    testExpression: () => {
      pianoKeyboard.setChord([261.63, 329.63, 392.0]);
      appState.set("selectedExpression", "vibrato");
      return expressionManager.assignNoteToSynth("test-synth");
    },
    testChordDistribution: () =>
      chordManager.setDistributionAlgorithm("random"),
    enableAllLogs: () => {
      Object.keys(Logger.categories).forEach((cat) => {
        if (cat !== "errors") Logger.enable(cat);
      });
    },
    disableAllLogs: () => {
      Object.keys(Logger.categories).forEach((cat) => {
        if (cat !== "errors" && cat !== "lifecycle") Logger.disable(cat);
      });
    },
  };

  Logger.log("Development utilities available at window.dev", "lifecycle");
}

// Debug helper to check what's loaded
function debugModuleLoading() {
  console.log("=== Module Loading Debug ===");
  console.log("Logger:", typeof Logger !== "undefined" ? "✓" : "✗");
  console.log("Config:", typeof Config !== "undefined" ? "✓" : "✗");
  console.log("eventBus:", typeof eventBus !== "undefined" ? "✓" : "✗");
  console.log("appState:", typeof appState !== "undefined" ? "✓" : "✗");
  console.log(
    "programManager:",
    typeof programManager !== "undefined" ? "✓" : "✗",
  );
  console.log(
    "networkCoordinator:",
    typeof networkCoordinator !== "undefined" ? "✓" : "✗",
  );
  console.log("uiManager:", typeof uiManager !== "undefined" ? "✓" : "✗");
  console.log(
    "parameterControls:",
    typeof parameterControls !== "undefined" ? "✓" : "✗",
  );
  console.log(
    "pianoKeyboard:",
    typeof pianoKeyboard !== "undefined" ? "✓" : "✗",
  );
  console.log(
    "expressionManager:",
    typeof expressionManager !== "undefined" ? "✓" : "✗",
  );
  console.log("chordManager:", typeof chordManager !== "undefined" ? "✓" : "✗");
  console.log(
    "AudioUtilities:",
    typeof AudioUtilities !== "undefined" ? "✓" : "✗",
  );
  console.log("=== End Debug ===");
}

// Enhanced error handling
window.addEventListener("error", (event) => {
  console.error("Global error:", event.error);
  console.error("Stack:", event.error?.stack);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
});

// Start the application with better error handling
async function startApp() {
  try {
    console.log("Starting modular app...");
    debugModuleLoading();

    setupCompatibilityLayer();
    await initializeApp();

    console.log("Modular app started successfully!");
  } catch (error) {
    console.error("Failed to start modular application:", error);
    console.error("Stack trace:", error.stack);

    // Don't fall back to legacy system - we need to fix the modular system
    console.error("CRITICAL: Modular system failed to start");
    console.error(
      "Not falling back to legacy system - please fix the error above",
    );
  }
}

document.addEventListener("DOMContentLoaded", startApp);

// Also start immediately if DOM is already loaded
if (document.readyState !== "loading") {
  startApp();
}

// Add debugging commands to window for console access
window.debugWebRTC = {
  // Test different ICE configurations
  testICE: async (peerId, mode = "all") => {
    if (!window.webRTCManager) {
      console.error("WebRTCManager not initialized");
      return;
    }
    return await window.webRTCManager.testICEConfiguration(peerId, mode);
  },

  // Force refresh ICE servers
  refreshICE: async () => {
    const { refreshIceServers } = await import("./modules/core/Config.js");
    return await refreshIceServers();
  },

  // Get detailed peer info
  getPeerInfo: (peerId) => {
    if (!window.webRTCManager) {
      console.error("WebRTCManager not initialized");
      return;
    }
    return window.webRTCManager.getPeerInfo(peerId);
  },

  // Get all peers
  getAllPeers: () => {
    if (!window.webRTCManager) {
      console.error("WebRTCManager not initialized");
      return;
    }
    return window.webRTCManager.getAllPeers();
  },

  // Get ICE candidate stats for a peer
  getICEStats: async (peerId) => {
    if (!window.webRTCManager) {
      console.error("WebRTCManager not initialized");
      return;
    }
    const peerData = window.webRTCManager.peers.get(peerId);
    if (!peerData) {
      console.error(`No peer found with ID: ${peerId}`);
      return;
    }
    return await window.webRTCManager.getICECandidatePairStats(
      peerData.connection,
      peerId,
    );
  },

  // Force disconnect a peer
  disconnect: (peerId) => {
    if (!window.webRTCManager) {
      console.error("WebRTCManager not initialized");
      return;
    }
    window.webRTCManager.handlePeerDisconnection(peerId);
  },

  // Get current RTC config
  getConfig: () => {
    return Config.RTC_CONFIG;
  },
};

console.log("WebRTC debugging commands available:");
console.log(
  "- debugWebRTC.testICE(peerId, mode) - Test ICE with 'stun-only', 'turn-only', or 'all'",
);
console.log("- debugWebRTC.refreshICE() - Force refresh ICE servers");
console.log("- debugWebRTC.getPeerInfo(peerId) - Get detailed info for a peer");
console.log("- debugWebRTC.getAllPeers() - List all connected peers");
console.log(
  "- debugWebRTC.getICEStats(peerId) - Get ICE candidate pair statistics",
);
console.log("- debugWebRTC.disconnect(peerId) - Force disconnect a peer");
console.log("- debugWebRTC.getConfig() - View current RTC configuration");
