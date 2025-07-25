// controller-app.js - Controller application entry point
window.__modularSystemActive = true;

/**
 * String Assembly FM Controller - Modular Version
 * Main application entry point
 */

// Import core modules
import { Logger } from "../modules/core/Logger.js";
import {
  SystemConfig,
  ConfigUtils,
  fetchIceServers,
  startIceServerRefresh,
} from "../config/system.config.js";
import { eventBus } from "../modules/core/EventBus.js";
import { appState } from "../modules/state/AppState.js";
import { programManager } from "../modules/state/ProgramManager.js";
import { programState } from "../modules/state/ProgramState.js";
import { networkCoordinator } from "../modules/network/NetworkCoordinator.js";
import { uiManager } from "../modules/ui/UIManager.js";
import { parameterControls } from "../modules/ui/ParameterControls.js";
import { pianoKeyboard } from "../modules/ui/PianoKeyboard.js";
import { partManager } from "../modules/audio/PartManager.js";
import {
  MessageBuilders,
  MessageTypes,
  CommandNames,
} from "../protocol/MessageProtocol.js";

// Import UI components
import "../modules/ui/HarmonicRatioSelector.js";
import { AudioUtilities } from "../modules/utils/AudioUtilities.js";

// Import hardware modules
import { arcManager } from "../modules/hardware/ArcManager.js";

/**
 * Initialize the modular application
 */
async function initializeApp() {
  try {
    // Initializing String Assembly FM Controller

    // Initialize core systems
    await initializeCore();

    // Initialize state management
    initializeState();

    // Initialize program management
    initializeProgramManager();
    programState.initialize();
    // Program state system initialized

    // Initialize UI components BEFORE network so status updates are visible
    await initializeUI();

    // Initialize network layer and wait for connection
    await initializeNetwork();

    // Initialize audio system
    await initializeAudio();

    // Initialize hardware (Arc)
    await initializeHardware();

    // Set up event listeners
    setupGlobalEventListeners();

    // Application initialized successfully

    // Mark as ready only after all systems are up
    // Mark as ready - compatibility layer handles this

    console.log("String Assembly FM Controller ready");

    // Set global flag to indicate modular system is fully loaded
    window.__modularSystemLoaded = true;
  } catch (error) {
    Logger.log(`Failed to initialize application: ${error}`, "error");
    throw error;
  }
}

/**
 * Initialize core systems
 */
async function initializeCore() {
  // Initializing core systems...

  // Fetch ICE servers early and verify they loaded
  try {
    await fetchIceServers();
    const iceServers = SystemConfig.network.webrtc.iceServers;
    const hasTURN = iceServers.some((server) => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      return urls.some((url) => url.startsWith("turn:"));
    });

    if (!hasTURN) {
      Logger.log(
        "WARNING: No TURN servers configured - remote connections may fail",
        "error",
      );
    } else {
      Logger.log(
        `ICE servers loaded: ${iceServers.length} servers (includes TURN)`,
        "connections",
      );
    }

    // Start periodic ICE server refresh (every 4 hours)
    startIceServerRefresh(4);
    Logger.log("Started periodic ICE server refresh", "connections");
  } catch (error) {
    Logger.log(`Failed to fetch ICE servers: ${error.message}`, "error");
  }

  // Set up debug configuration persistence
  Logger.loadConfig();

  // Core systems initialized
}

/**
 * Initialize state management
 */
function initializeState() {
  // Initializing state management...

  // Set initial connection status
  // Set initializing state (compatibility layer will handle the mapping)

  // Subscribe to state changes for debugging
  if (Logger.categories.lifecycle) {
    appState.subscribeAll((key, newValue, oldValue) => {
      // Filter out verbose/repetitive state changes
      const skipKeys = [
        "connections.synths",
        "connections.metrics.averageLatency",
        "connections.metrics.connectedCount",
        "connections.websocket.connected",
        "connections.websocket.reconnecting",
        "connections.controllerId",
        "ui.parameters.changed",
        "performance.currentProgram.chord.frequencies",
        "performance.currentProgram.parts.assignments",
        "performance.currentProgram.harmonicSelections",
        "harmonicSelections",
        "performance.currentProgram.partsAssignments",
        "banking.metadata.lastModified",
        "banking.banks",
        "bodyType",
        "pianoKeyboard",
        "partManager",
        "parameterControls",
        "networkCoordinator",
      ];

      // Skip if it's a key we want to filter or if it contains synth-specific data
      if (
        !skipKeys.includes(key) &&
        !key.includes(".synths.") &&
        !key.includes("latency")
      ) {
        let formattedValue;
        if (newValue instanceof Map) {
          formattedValue = `Map(${newValue.size})`;
        } else if (typeof newValue === "object" && newValue !== null) {
          // For objects, just show keys instead of full content
          formattedValue = `{${Object.keys(newValue).join(", ")}}`;
        } else {
          formattedValue = JSON.stringify(newValue);
        }
        Logger.log(`State change: ${key} = ${formattedValue}`, "lifecycle");
      }
    });
  }

  // State management initialized
}

/**
 * Initialize program management
 */
function initializeProgramManager() {
  // Initializing program management...

  // Load saved banks from storage
  programManager.loadBanksFromStorage();

  // Basic program event handlers that don't need network
  eventBus.on("program:cleared", (data) => {
    Logger.log(`Bank ${data.bankId} cleared`, "lifecycle");
  });

  // Listen for banks loaded from storage to update UI
  eventBus.on("programState:banksLoaded", (data) => {
    Logger.log(`Banks loaded from storage: ${data.bankCount} banks`, "lifecycle");
    // Update bank display if the function exists (it will exist after initializeUI)
    if (typeof updateBankDisplay === 'function') {
      updateBankDisplay();
    }
  });

  // Program management initialized
}

/**
 * Set up program network event handlers (called after network init)
 */
/**
 * Update RELAY status display
 */
function updateRelayStatus() {
  // Get WebRTC manager if available
  if (!window.webRTCManager) return;

  let relayStatusEl = document.getElementById("relay-status-indicator");
  if (!relayStatusEl) {
    // Create status element in connection status area
    const connectionStatus = document.getElementById("connection_status");
    if (connectionStatus) {
      relayStatusEl = document.createElement("div");
      relayStatusEl.id = "relay-status-indicator";
      relayStatusEl.style.cssText = `
        display: inline-block;
        margin-left: 15px;
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: bold;
      `;
      connectionStatus.appendChild(relayStatusEl);
    }
  }

  if (!relayStatusEl) return;

  // Check RELAY status for all peers
  const peers = window.webRTCManager.peers;
  let totalPeers = 0;
  let peersWithRelay = 0;

  peers.forEach((peerData, peerId) => {
    totalPeers++;
    if (
      peerData.iceCandidateStats &&
      peerData.iceCandidateStats.hasLocalRelay
    ) {
      peersWithRelay++;
    }
  });

  if (totalPeers === 0) {
    relayStatusEl.style.display = "none";
  } else {
    relayStatusEl.style.display = "inline-block";
    const hasAllRelay = totalPeers === peersWithRelay;
    const hasAnyRelay = peersWithRelay > 0;

    if (hasAllRelay) {
      relayStatusEl.innerHTML = "✅ RELAY ACTIVE";
      relayStatusEl.style.background = "#d4edda";
      relayStatusEl.style.color = "#155724";
      relayStatusEl.style.border = "1px solid #c3e6cb";
    } else if (hasAnyRelay) {
      relayStatusEl.innerHTML = `⚠️ RELAY: ${peersWithRelay}/${totalPeers}`;
      relayStatusEl.style.background = "#fff3cd";
      relayStatusEl.style.color = "#856404";
      relayStatusEl.style.border = "1px solid #ffeeba";
    } else {
      relayStatusEl.innerHTML = "❌ NO RELAY";
      relayStatusEl.style.background = "#f8d7da";
      relayStatusEl.style.color = "#721c24";
      relayStatusEl.style.border = "1px solid #f5c6cb";
    }

    // Add tooltip with details
    relayStatusEl.title = `${peersWithRelay} of ${totalPeers} connections have RELAY candidates`;
  }
}

function setupProgramNetworkHandlers() {
  // Subscribe to program events that need network
  eventBus.on("program:saved", (data) => {
    Logger.log(`Program saved to Bank ${data.bankId}`, "lifecycle");

    // Send save command to all connected synths
    const saveCommand = MessageBuilders.command(CommandNames.SAVE, data.bankId);
    saveCommand.bank = data.bankId; // Add bank for compatibility
    networkCoordinator.broadcastCommand(saveCommand);
  });

  eventBus.on("program:loaded", async (data) => {
    Logger.log(`Program loaded from Bank ${data.bankId}`, "lifecycle");

    // Get current transition parameters
    const transitionParams = parameterControls.getAllParameterValues();
    const transitionConfig = {
      duration: parseFloat(transitionParams.transitionDuration) || 1.0,
      stagger: parseFloat(transitionParams.transitionStagger) || 0.0,
      durationSpread:
        parseFloat(transitionParams.transitionDurationSpread) || 0.0,
    };

    Logger.log(
      `Transition config: duration=${transitionConfig.duration.toFixed(2)}s, stagger=${transitionConfig.stagger.toFixed(2)}, spread=${transitionConfig.durationSpread.toFixed(2)}`,
      "messages",
    );

    // Send the loaded program to synths
    try {
      const result = await partManager.sendCurrentPart({
        transition: transitionConfig,
      });
      Logger.log(
        `Program sent to ${result.successCount}/${result.totalSynths} synths`,
        "messages",
      );

      // Set the loaded program as the active program
      if (result.successCount > 0 && data.program) {
        appState.setActiveProgram(data.program);

        // Mark all parameters as sent
        if (parameterControls.markAllParametersSent) {
          parameterControls.markAllParametersSent();
        }

        // Update sync status
        updateSyncStatus();
      }
    } catch (error) {
      Logger.log(`Failed to send loaded program: ${error.message}`, "error");
    }
  });

  Logger.log("Program network handlers initialized", "lifecycle");
}

/**
 * Initialize network layer
 */
async function initializeNetwork() {
  // Initializing network layer...

  // Initialize network coordinator
  await networkCoordinator.initialize();

  // Set up network event handlers
  setupNetworkEventHandlers();

  // Set up program network handlers now that network is ready
  setupProgramNetworkHandlers();

  // Set up WebRTC event handlers for RELAY status
  setupWebRTCEventHandlers();

  // Connect to WebSocket server
  try {
    await networkCoordinator.connect();
    Logger.log("Network connection established", "lifecycle");
  } catch (error) {
    Logger.log(`Failed to connect to network: ${error}`, "error");
  }

  // Network layer initialized
}

/**
 * Initialize UI layer
 */
async function initializeUI() {
  // Initializing UI layer...

  // Initialize UI manager
  uiManager.initialize();
  
  // Store in app state for global access
  appState.set("uiManager", uiManager);

  // Initialize parameter controls
  parameterControls.initialize();

  // Initialize piano keyboard
  pianoKeyboard.initialize();

  // Store reference in appState for ProgramManager
  appState.set("pianoKeyboard", pianoKeyboard);

  // Set up UI event handlers
  setupUIEventHandlers();

  // Initialize sync status
  updateSyncStatus();

  // Update bank display to show any saved banks
  updateBankDisplay();
  updateActiveProgramDisplay();

  // Update expression group visibility on startup (with a small delay to ensure DOM is ready)
  setTimeout(() => {
    updateExpressionGroupVisibility();
  }, 100);

  // UI layer initialized
}

/**
 * Initialize audio system
 */
async function initializeAudio() {
  // Initializing audio system...

  // Initialize part manager (replaces expression and chord managers)
  await partManager.initialize();

  // Store in app state for global access
  appState.set("partManager", partManager);
  appState.set("parameterControls", parameterControls);
  appState.set("networkCoordinator", networkCoordinator);

  // Set up audio event handlers
  setupAudioEventHandlers();

  // Audio system initialized
}

/**
 * Initialize hardware systems (Arc)
 */
async function initializeHardware() {
  // Initializing hardware systems...

  // Initialize Arc manager
  await arcManager.initialize();

  // Set up Arc event handlers
  setupArcEventHandlers();

  // Check if Arc is already connected and update UI
  if (arcManager.connected) {
    const connectBtn = document.getElementById("connectArc");
    if (connectBtn) {
      connectBtn.textContent = "Arc Connected";
      connectBtn.style.background = "#22c55e";
      connectBtn.disabled = true;
      connectBtn.style.cursor = "default";
      connectBtn.style.opacity = "1";
    }
  }

  // Hardware systems initialized
}

// Arc parameter throttling setup
const arcParamLastSent = {}; // Track last send time for each parameter
const arcParamPending = {}; // Track pending values during throttle period
const arcParamTimers = {}; // Track scheduled sends
const ARC_PARAM_THROTTLE = 100; // Default 100ms throttle

// Parameter-specific throttle times (in ms)
const paramThrottleTimes = {
  volume: 100, // Volume can update frequently
  brightness: 100, // Test with same throttle as volume
  detune: 100, // Detune can update frequently
  reverb: 200, // Reverb might need slower updates
};

/**
 * Set up Arc event handlers
 */
function setupArcEventHandlers() {
  // Handle Arc parameter changes
  eventBus.on("arc:parameterChanged", (data) => {
    // Arc parameter changed

    // Update UI to reflect Arc changes
    const parameterMap = {
      volume: "masterGain",
      brightness: "brightness",
      detune: "detune",
      reverb: "reverb",
    };

    const paramId = parameterMap[data.parameter];
    if (paramId) {
      // Update the UI control immediately for responsive feel
      const control = document.getElementById(paramId);
      if (control) {
        control.value = data.value;
        // Update value display
        const valueDisplay = document.getElementById(`${paramId}Value`);
        if (valueDisplay) {
          valueDisplay.textContent = data.value.toFixed(2);
        }
      }

      // Throttle network sends with parameter-specific timing
      const now = Date.now();
      const lastSent = arcParamLastSent[data.parameter] || 0;
      const timeSinceLastSend = now - lastSent;
      const throttleTime =
        paramThrottleTimes[data.parameter] || ARC_PARAM_THROTTLE;

      if (timeSinceLastSend >= throttleTime) {
        // Enough time has passed, send immediately
        networkCoordinator.broadcastCommand({
          type: "command",
          name: data.parameter,
          value: data.value,
          timestamp: now,
        });
        arcParamLastSent[data.parameter] = now;
        // Sent parameter command

        // Clear any pending value since we just sent
        delete arcParamPending[data.parameter];
      } else {
        // Too soon, store as pending and schedule send
        arcParamPending[data.parameter] = data.value;

        // Schedule send for when throttle period expires
        if (!arcParamTimers[data.parameter]) {
          const remainingTime = throttleTime - timeSinceLastSend;
          arcParamTimers[data.parameter] = setTimeout(() => {
            // Send the most recent pending value
            if (arcParamPending[data.parameter] !== undefined) {
              networkCoordinator.broadcastCommand({
                type: "command",
                name: data.parameter,
                value: arcParamPending[data.parameter],
                timestamp: Date.now(),
              });
              arcParamLastSent[data.parameter] = Date.now();
              // Sent pending parameter command
              delete arcParamPending[data.parameter];
            }
            delete arcParamTimers[data.parameter];
          }, remainingTime);
        }
      }
    }
  });

  // Handle Arc connection events
  eventBus.on("arc:connected", (data) => {
    // Arc connected
    uiManager.showNotification("Monome Arc connected", "success", 2000);

    // Update connect button
    const connectBtn = document.getElementById("connectArc");
    if (connectBtn) {
      connectBtn.textContent = "Arc Connected";
      connectBtn.style.background = "#22c55e";
      connectBtn.disabled = true;

      // Force style update
      connectBtn.style.cursor = "default";
      connectBtn.style.opacity = "1";
    }

    // Sync Arc's internal state with current UI values
    const params = ["masterGain", "brightness", "detune", "reverb"];
    const names = ["volume", "brightness", "detune", "reverb"];
    params.forEach((paramId, index) => {
      const control = document.getElementById(paramId);
      if (control) {
        arcManager.setParameterValue(names[index], parseFloat(control.value));
      }
    });
  });

  eventBus.on("arc:disconnected", () => {
    // Arc disconnected
    uiManager.showNotification("Monome Arc disconnected", "warning", 2000);

    // Update connect button
    const connectBtn = document.getElementById("connectArc");
    if (connectBtn) {
      connectBtn.textContent = "Connect Arc";
      connectBtn.style.background = "#667eea";
      connectBtn.disabled = false;
    }
  });

  // Sync UI parameter changes to Arc's internal state
  const arcParameters = ["masterGain", "brightness", "detune", "reverb"];
  const arcParamNames = ["volume", "brightness", "detune", "reverb"];

  arcParameters.forEach((paramId, index) => {
    const control = document.getElementById(paramId);
    if (control) {
      control.addEventListener("input", (e) => {
        const value = parseFloat(e.target.value);
        // Update Arc's internal state when UI changes
        arcManager.setParameterValue(arcParamNames[index], value);
      });
    }
  });
}

/**
 * Set up audio event handlers
 */
function setupAudioEventHandlers() {
  // PartManager handles all chord and expression events internally
  // No additional event handlers needed
  // Audio event handlers set up
}

/**
 * Set up UI event handlers
 */
function setupUIEventHandlers() {
  // Handle parameter changes (don't auto-send)
  parameterControls.on("changed", (data) => {
    Logger.log(
      `Parameter changed: ${data.paramId} = ${data.value}`,
      "parameters",
    );
    // Removed auto-send to synths
  });

  // NOTE: In the new parts paradigm, chord changes happen through
  // part:added and part:removed events. The old chordChanged event
  // is no longer used.

  // Handle part added from piano
  eventBus.on("part:added", (data) => {
    Logger.log(
      `Part added: ${data.note} (${data.part.frequency}Hz) with ${data.part.expression.type}`,
      "expressions",
    );

    // Add the complete part using new parts paradigm
    partManager.addPartNew(data.part);

    // Update expression group visibility immediately
    updateExpressionGroupVisibility();
    // Do NOT update active program display - that only shows what was sent/loaded
  });

  // Handle part removed from piano
  eventBus.on("part:removed", (data) => {
    Logger.log(`Part removed: ${data.partId}`, "expressions");

    // Remove the part using new parts paradigm
    partManager.removePart(data.partId);

    // Update expression group visibility immediately
    updateExpressionGroupVisibility();
    // Do NOT update active program display - that only shows what was sent/loaded
  });

  // Handle part updated (expression changed)
  eventBus.on("part:updated", (data) => {
    Logger.log(
      `Part updated: ${data.partId}, new expression: ${data.updates.expression?.type || 'none'}`,
      "expressions"
    );

    // Update the part using new parts paradigm
    partManager.updatePart(data.partId, data.updates);

    // Update expression group visibility immediately
    updateExpressionGroupVisibility();
    // Do NOT update active program display - that only shows what was sent/loaded
  });

  // Handle parts updated event (e.g., from bank load)
  eventBus.on("parts:updated", (data) => {
    Logger.log(`Parts updated from ${data.source}`, "expressions");
    // Only update active program display if this is from a bank load
    if (data.source === "bankLoad") {
      updateActiveProgramDisplay();
    }
    updateExpressionGroupVisibility();
  });

  // REMOVED: expression:changed handler - expressions are now part of Part objects

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

  // Set up "Send Current Program" button
  setupProgramSendButton();

  // Set up "Quick Save" button
  setupQuickSaveButton();

  // Bank controls have been removed - using saved banks list instead

  // Set up power and volume controls
  setupPowerControl();
  setupVolumeControl();
}

/**
 * Set up bank control buttons
 */

/**
 * Update active program display (shows what was last sent/loaded)
 */
function updateActiveProgramDisplay() {
  const activeProgramDisplay = document.getElementById(
    "active-program-display",
  );
  if (!activeProgramDisplay) return;

  // Get the ACTIVE program from programState (not current editing state)
  const activeProgram = programState.activeProgram;

  if (!activeProgram) {
    activeProgramDisplay.innerHTML =
      '<span style="color: #64748b;">No active program</span>';
    return;
  }

  // Define expression colors locally (optimized for dark mode)
  const EXPRESSION_COLORS = {
    none: "#9b59b6", // Purple (to match piano keyboard)
    vibrato: "#e74c3c", // Red
    tremolo: "#f1c40f", // Yellow  
    trill: "#3498db", // Blue
  };

  let chordDisplay = '<span style="color: #64748b;">No chord</span>';

  // Check if activeProgram has parts (new paradigm)
  if (activeProgram.parts && activeProgram.parts.length > 0) {
    Logger.log(`Active program has ${activeProgram.parts.length} parts`, "ui");

    // Convert parts to display strings
    const noteStrings = activeProgram.parts.map((part) => {
      const noteName = AudioUtilities.frequencyToNoteName(part.frequency);

      // Check if this part has an expression
      if (part.expression && part.expression.type !== "none") {
        const expr = part.expression;
        switch (expr.type) {
          case "vibrato":
            return `<span style="color: ${EXPRESSION_COLORS.vibrato};">${noteName}v${Math.round((expr.depth || 0.01) * 100)}</span>`;
          case "tremolo":
            return `<span style="color: ${EXPRESSION_COLORS.tremolo};">${noteName}t${Math.round((expr.articulation || 0.8) * 100)}</span>`;
          case "trill":
            const trillNote =
              expr.targetNote ||
              AudioUtilities.frequencyToNoteName(
                part.frequency * Math.pow(2, (expr.interval || 2) / 12),
              );
            return `<span style="color: ${EXPRESSION_COLORS.trill};">${noteName}(→${trillNote})</span>`;
          default:
            return `<span style="color: ${EXPRESSION_COLORS.none};">${noteName}</span>`;
        }
      }
      return `<span style="color: ${EXPRESSION_COLORS.none};">${noteName}</span>`;
    });

    chordDisplay = noteStrings.join(" ");
  } else if (
    activeProgram.chord &&
    activeProgram.chord.frequencies &&
    activeProgram.chord.frequencies.length > 0
  ) {
    // Fallback to old paradigm for compatibility
    Logger.log(
      `Active program using old paradigm: ${activeProgram.chord.frequencies.length} frequencies`,
      "ui",
    );

    const noteStrings = activeProgram.chord.frequencies.map((freq) => {
      const noteName = AudioUtilities.frequencyToNoteName(freq);

      // Check for expressions in old format
      if (
        activeProgram.chord.expressions &&
        activeProgram.chord.expressions[noteName]
      ) {
        const expr = activeProgram.chord.expressions[noteName];
        switch (expr.type) {
          case "vibrato":
            return `<span style="color: ${EXPRESSION_COLORS.vibrato};">${noteName}v${Math.round(expr.depth * 100)}</span>`;
          case "tremolo":
            return `<span style="color: ${EXPRESSION_COLORS.tremolo};">${noteName}t${Math.round(expr.articulation * 100)}</span>`;
          case "trill":
            const trillNote = AudioUtilities.frequencyToNoteName(
              freq * Math.pow(2, expr.interval / 12),
            );
            return `<span style="color: ${EXPRESSION_COLORS.trill};">${noteName}(→${trillNote})</span>`;
          default:
            return `<span style="color: ${EXPRESSION_COLORS.none};">${noteName}</span>`;
        }
      }
      return `<span style="color: ${EXPRESSION_COLORS.none};">${noteName}</span>`;
    });

    chordDisplay = noteStrings.join(" ");
  }

  activeProgramDisplay.innerHTML = chordDisplay;
}

/**
 * Update expression group visibility based on current parts
 */
function updateExpressionGroupVisibility() {
  const partManager = appState.get("partManager");
  if (!partManager) {
    Logger.log("updateExpressionGroupVisibility: No partManager found", "ui");
    return;
  }

  // Track which expression types are active
  const activeExpressions = new Set();

  // Check all parts for expressions
  const parts = partManager.getParts();
  Logger.log(`Checking ${parts.length} parts for active expressions`, "ui");

  parts.forEach((part) => {
    if (part.hasExpression()) {
      activeExpressions.add(part.expression.type);
      Logger.log(`  Found ${part.expression.type} on part ${part.id}`, "ui");
    }
  });

  // Update visibility of expression groups
  const expressionTypes = ["vibrato", "trill", "tremolo"];
  expressionTypes.forEach((type) => {
    const group = document.querySelector(`.expression-group.${type}`);
    if (group) {
      if (activeExpressions.has(type)) {
        group.classList.add("active");
        Logger.log(
          `  Showing ${type} group - classList: ${group.classList.toString()}`,
          "ui",
        );
        // Force style recalculation
        group.style.display = "block";
      } else {
        group.classList.remove("active");
        Logger.log(
          `  Hiding ${type} group - classList: ${group.classList.toString()}`,
          "ui",
        );
        // Force style recalculation
        group.style.display = "none";
      }
    } else {
      Logger.log(`  No element found for .expression-group.${type}`, "ui");
    }
  });

  Logger.log(
    `Expression groups updated - active: ${Array.from(activeExpressions).join(", ") || "none"}`,
    "ui",
  );
}

/**
 * Update bank selector display
 */
function updateBankDisplay() {
  const banks = programState.getSavedBanks();
  const savedBanksDisplay = document.getElementById("saved-banks-display");

  // Update saved banks display in sidebar
  if (savedBanksDisplay) {
    const savedBanks = banks.filter((bank) => bank.saved);
    const clearButton = document.getElementById("clear-banks-btn");

    if (savedBanks.length === 0) {
      savedBanksDisplay.innerHTML =
        '<div style="color: #64748b; text-align: center; padding: 20px;">No banks saved yet</div>';
      if (clearButton) clearButton.style.display = "none";
    } else {
      if (clearButton) clearButton.style.display = "block";
      savedBanksDisplay.innerHTML = savedBanks
        .map((bank) => {
          const program = bank.program;
          let chordDisplay = "No chord";

          // Check if program has parts (new paradigm)
          if (program && program.parts && program.parts.length > 0) {
            Logger.log(
              `Bank ${bank.id} has ${program.parts.length} parts`,
              "ui",
            );
            // Convert parts to display strings
            const noteStrings = program.parts.map((part) => {
              const noteName = AudioUtilities.frequencyToNoteName(
                part.frequency,
              );
              Logger.log(
                `  Part: ${noteName} expr=${part.expression?.type || "undefined"}`,
                "ui",
              );

              // Check if this part has an expression
              if (part.expression && part.expression.type !== "none") {
                const expr = part.expression;
                switch (expr.type) {
                  case "vibrato":
                    return `${noteName}v${Math.round((expr.depth || 0.01) * 100)}`;
                  case "tremolo":
                    return `${noteName}t${Math.round((expr.articulation || 0.8) * 100)}`;
                  case "trill":
                    const trillNote =
                      expr.targetNote ||
                      AudioUtilities.frequencyToNoteName(
                        part.frequency * Math.pow(2, (expr.interval || 2) / 12),
                      );
                    return `${noteName}(→${trillNote})`;
                  default:
                    return noteName;
                }
              }
              return noteName;
            });

            chordDisplay = noteStrings.join(" ");
          } else if (
            program &&
            program.chord &&
            program.chord.frequencies &&
            program.chord.frequencies.length > 0
          ) {
            // Fallback to old paradigm for backwards compatibility
            const noteStrings = program.chord.frequencies.map((freq) => {
              const noteName = AudioUtilities.frequencyToNoteName(freq);

              // Check if this note has an expression
              if (
                program.chord.expressions &&
                program.chord.expressions[noteName]
              ) {
                const expr = program.chord.expressions[noteName];
                switch (expr.type) {
                  case "vibrato":
                    return `${noteName}v${Math.round(expr.depth * 100)}`;
                  case "tremolo":
                    return `${noteName}t${Math.round(expr.articulation * 100)}`;
                  case "trill":
                    const trillNote = AudioUtilities.frequencyToNoteName(
                      freq * Math.pow(2, expr.interval / 12),
                    );
                    return `${noteName}(→${trillNote})`;
                  default:
                    return noteName;
                }
              }
              return noteName;
            });

            chordDisplay = noteStrings.join(" ");
          }

          const isActive = false; // No longer tracking active bank in UI

          return `
          <div class="bank-item ${isActive ? "active" : ""}" data-bank-id="${bank.id}">
            <span class="bank-number">Bank ${bank.id}:</span>
            <span class="bank-chord">${chordDisplay}</span>
          </div>
        `;
        })
        .join("");

      // Add click handlers to bank items
      savedBanksDisplay.querySelectorAll(".bank-item").forEach((item) => {
        item.addEventListener("click", async (e) => {
          e.preventDefault(); // Prevent text selection on shift-click
          const bankId = parseInt(item.dataset.bankId);
          const isPreview = e.shiftKey;

          if (isPreview) {
            // Shift-click: Preview the program without sending to synths
            if (programManager.loadFromBank(bankId, { preview: true })) {
              uiManager.showNotification(
                `Previewing Bank ${bankId}`,
                "info",
                1500,
              );
            }
          } else {
            // Normal click: Load and send to synths
            if (programState.loadFromBank(bankId)) {
              // Update expression group visibility after loading bank
              updateExpressionGroupVisibility();

              // Get current transition parameters
              const transitionParams =
                parameterControls.getAllParameterValues();
              const transitionConfig = {
                duration:
                  parseFloat(transitionParams.transitionDuration) || 1.0,
                stagger: parseFloat(transitionParams.transitionStagger) || 0.0,
                durationSpread:
                  parseFloat(transitionParams.transitionDurationSpread) || 0.0,
              };

              // Send the loaded program to synths
              try {
                const result = await partManager.sendCurrentPart({
                  transition: transitionConfig,
                });
                Logger.log(
                  `Program from bank ${bankId} sent to ${result.successCount}/${result.totalSynths} synths`,
                  "messages",
                );

                // Set as active program if successfully sent to synths
                if (result.successCount > 0) {
                  programState.setActiveProgram();

                  // Mark all parameters as sent since we just loaded and sent them
                  if (parameterControls.markAllParametersSent) {
                    parameterControls.markAllParametersSent();
                  }

                  // Update sync status
                  updateSyncStatus();
                }
              } catch (error) {
                Logger.log(
                  `Failed to send loaded program: ${error.message}`,
                  "error",
                );
              }

              // Update displays
              updateBankDisplay();
              updateActiveProgramDisplay();
            }
          }
        });
      });
    }

    // Add click handler for clear button (only if not already attached)
    if (clearButton && !clearButton.hasAttribute("data-handler-attached")) {
      clearButton.setAttribute("data-handler-attached", "true");
      clearButton.addEventListener("click", () => {
        programState.clearAllBanks();
        updateBankDisplay();
      });
    }
  }
}

/**
 * Set up WebRTC event handlers for RELAY status
 */
function setupWebRTCEventHandlers() {
  if (!window.webRTCManager) return;

  // Update RELAY status when ICE candidates are gathered
  eventBus.on("webrtc:iceCandidateGenerated", () => {
    updateRelayStatus();
  });

  // Update when connection state changes
  eventBus.on("webrtc:connectionStateChanged", () => {
    updateRelayStatus();
  });

  // Update when peer is created
  eventBus.on("webrtc:peerCreated", () => {
    setTimeout(updateRelayStatus, 100);
  });

  // Update when peer disconnects
  eventBus.on("webrtc:disconnected", () => {
    updateRelayStatus();
  });

  Logger.log("WebRTC event handlers initialized", "lifecycle");
}

/**
 * Set up network event handlers
 */
function setupNetworkEventHandlers() {
  // Handle synth connections - NetworkCoordinator now automatically sends programs
  networkCoordinator.on("synthConnected", (data) => {
    Logger.log(`Synth connected: ${data.synthId}`, "connections");
    // NetworkCoordinator automatically sends current program on connection
    // No manual program sending needed here anymore
  });

  // DEPRECATED: Program requests removed - synths receive programs automatically
  // eventBus.on("network:programRequested", (data) => {
  //   Logger.log(`Program requested by: ${data.synthId}`, "messages");
  //   partManager.sendProgramToSpecificSynth(data.synthId);
  // });

  // Handle bank program requests from synths
  eventBus.on("network:bankProgramRequested", (data) => {
    Logger.log(`Bank ${data.bankId} requested by ${data.synthId}`, "messages");

    // This is called when a synth needs the controller to send it a bank program
    // This happens when:
    // 1. A new synth joins and needs to catch up
    // 2. A synth doesn't have the bank saved locally

    // Get the saved program from programState
    const banks = programState.getSavedBanks();
    const bank = banks.find((b) => b.id === data.bankId);

    if (!bank || !bank.saved) {
      Logger.log(`Bank ${data.bankId} not found`, "error");
      return;
    }

    const savedProgram = bank.program;

    // Get or create assignment for this synth
    let assignment = partManager.synthAssignments.get(data.synthId);

    if (
      !assignment &&
      savedProgram.chord &&
      savedProgram.chord.frequencies.length > 0
    ) {
      // Assign based on saved chord
      const synthIndex = partManager.synthAssignments.size;
      const frequency =
        savedProgram.chord.frequencies[
          synthIndex % savedProgram.chord.frequencies.length
        ];
      const noteName = partManager.frequencyToNoteName(frequency);
      const expression = savedProgram.chord.expressions[noteName] || {
        type: "none",
      };
      assignment = { frequency, expression };
      partManager.synthAssignments.set(data.synthId, assignment);
    }

    if (!assignment) {
      Logger.log(`No assignment available for ${data.synthId}`, "error");
      return;
    }

    // Use ParameterResolver to build complete program
    const resolvedProgram = partManager.parameterResolver.resolveForSynth(
      data.synthId,
      assignment,
      savedProgram.parameters,
      data.transition || {},
    );

    // Build complete message
    const programMessage = partManager.parameterResolver.buildProgramMessage(
      resolvedProgram,
      {
        chord: savedProgram.chord || { frequencies: [], expressions: {} },
        parts: { [data.synthId]: assignment }, // Just this synth's assignment
        power: savedProgram.powerOn || false,
      },
    );

    Logger.log(
      `Sending newly resolved program to ${data.synthId}: freq=${assignment.frequency.toFixed(1)}Hz, expr=${assignment.expression.type}`,
      "messages",
    );

    // Send resolved program
    const success = networkCoordinator.sendProgramToSynth(
      data.synthId,
      programMessage,
      data.transition || {},
    );

    if (!success) {
      Logger.log(`Failed to send bank program to ${data.synthId}`, "error");
    }
  });

  // Handle controller kick events
  networkCoordinator.on("kicked", (data) => {
    Logger.log(
      "This controller was kicked by another controller",
      "connections",
    );
    // Mark as kicked - compatibility layer handles this
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
  // Setting up global event listeners...

  // Listen for app events
  eventBus.on("app:initialized", (data) => {
    Logger.log(`Application ready (${data.version})`, "lifecycle");
    // Mark as ready - compatibility layer handles this
  });

  // Listen for state reset requests
  eventBus.on("app:reset", () => {
    Logger.log("Resetting application state...", "lifecycle");
    appState.reset();
  });

  // Listen for active program changes
  eventBus.on("programState:synced", (data) => {
    Logger.log("Active program synced", "lifecycle");
    updateActiveProgramDisplay();
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

  // Handle keyboard shortcuts for bank save/load
  document.addEventListener("keydown", (event) => {
    Logger.log(
      `[KEYBOARD DEBUG] Key pressed: ${event.key}, Shift: ${event.shiftKey}, Target: ${event.target.tagName}`,
      "debug",
    );

    // Ignore if user is typing in an input field
    const activeElement = document.activeElement;
    if (
      activeElement &&
      (activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        activeElement.tagName === "SELECT" ||
        activeElement.isContentEditable)
    ) {
      Logger.log(
        `[KEYBOARD DEBUG] Ignoring - user is in ${activeElement.tagName}`,
        "debug",
      );
      return;
    }

    // Check if it's a number key (1-9 or 0)
    // Use event.code which is consistent regardless of shift state
    const code = event.code;
    const key = event.key;

    // Check for 's' key (Quick Save)
    if (
      key === "s" &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      const quickSaveButton = document.getElementById("quick_save");
      if (quickSaveButton && !quickSaveButton.disabled) {
        quickSaveButton.click();
      }
      return;
    }

    // Check for Digit1-Digit9 or Digit0
    if (code && code.startsWith("Digit")) {
      const digit = code.substring(5); // Extract the digit from "DigitX"

      // Debug log
      if (event.shiftKey) {
        Logger.log(`Shift+${digit} pressed`, "lifecycle");
        Logger.log(
          `[KEYBOARD] Shift+${digit} pressed - saving to bank`,
          "lifecycle",
        );
      }

      // Map 0 to bank 10, 1-9 to banks 1-9
      const bankId = digit === "0" ? 10 : parseInt(digit);

      if (event.shiftKey) {
        // Shift + number = Save active program to bank
        event.preventDefault();
        event.stopPropagation();

        // Update active program with current state before saving
        programState.captureFromUI();
        programState.setActiveProgram();

        // Save active program to bank using ProgramState
        const success = programState.saveToBank(bankId);

        if (!success) {
          // No active program yet - need to send first
          uiManager.showNotification(
            `No active program to save. Send to synths first!`,
            "warning",
            2000,
          );
          Logger.log(`No active program to save to Bank ${bankId}`, "warning");
          return;
        }

        // Also tell all synths to save to this bank
        const connectedSynths = appState.get("connectedSynths");
        if (connectedSynths && connectedSynths.size > 0) {
          const synthIds = Array.from(connectedSynths.keys());
          let saveCount = 0;

          for (const synthId of synthIds) {
            const message = MessageBuilders.command(CommandNames.SAVE, bankId);

            const saveSuccess = networkCoordinator.sendCommandToSynth(
              synthId,
              message,
            );
            if (saveSuccess) {
              saveCount++;
              Logger.log(
                `Sent save command for bank ${bankId} to ${synthId}`,
                "messages",
              );
            }
          }

          Logger.log(
            `Bank ${bankId} save command sent to ${saveCount}/${synthIds.length} synths`,
            "messages",
          );
        }

        // Update bank display
        updateBankDisplay();
        updateActiveProgramDisplay();

        // Visual feedback
        uiManager.showNotification(
          `Saved active program to Bank ${bankId} (Shift+${key})`,
          "success",
          1500,
        );

        Logger.log(
          `Keyboard shortcut: Saved active program to Bank ${bankId}`,
          "lifecycle",
        );
      } else {
        // Just number = Load from bank
        event.preventDefault();
        event.stopPropagation();

        const success = programState.loadFromBank(bankId);

        if (success) {
          // Get current transition parameters
          const transitionParams = parameterControls.getAllParameterValues();
          const transitionConfig = {
            duration: parseFloat(transitionParams.transitionDuration) || 1.0,
            stagger: parseFloat(transitionParams.transitionStagger) || 0.0,
            durationSpread:
              parseFloat(transitionParams.transitionDurationSpread) || 0.0,
          };

          // Send the loaded program to synths
          partManager
            .sendCurrentPart({ transition: transitionConfig })
            .then((result) => {
              Logger.log(
                `Program from bank ${bankId} sent to ${result.successCount}/${result.totalSynths} synths`,
                "messages",
              );

              // Set as active program if successfully sent to synths
              if (result.successCount > 0) {
                programState.setActiveProgram();

                // Mark all parameters as sent since we just loaded and sent them
                if (parameterControls.markAllParametersSent) {
                  parameterControls.markAllParametersSent();
                }

                // Update sync status
                updateSyncStatus();
              }

              // Visual feedback
              uiManager.showNotification(
                `Loaded Bank ${bankId} (${key})`,
                "info",
                1500,
              );
              Logger.log(
                `Keyboard shortcut: Loaded Bank ${bankId}`,
                "lifecycle",
              );

              // Update bank display
              updateBankDisplay();
              updateActiveProgramDisplay();
            })
            .catch((error) => {
              Logger.log(
                `Failed to send loaded program: ${error.message}`,
                "error",
              );
            });
        } else {
          // No data in bank
          uiManager.showNotification(
            `Bank ${bankId} is empty`,
            "warning",
            1500,
          );
        }
      }
    }
  });

  // Set up Arc connect button
  const connectArcBtn = document.getElementById("connectArc");
  if (connectArcBtn) {
    connectArcBtn.addEventListener("click", async () => {
      Logger.log("Manual Arc connection requested", "hardware");
      const connected = await arcManager.connect();
      if (!connected) {
        uiManager.showNotification("Failed to connect to Arc", "error", 3000);
      }
    });
  }

  // Expose Arc test function for debugging
  window.testArc = () => arcManager.testCommunication();

  // Global event listeners set up
}

/**
 * Set up "Send Current Program" button handler
 */
function setupProgramSendButton() {
  const sendButton = document.getElementById("send_current_program");
  const statusBadge = document.getElementById("status_badge");

  if (!sendButton) {
    Logger.log("Send Current Program button not found", "error");
    return;
  }

  // Enable the button once everything is set up
  sendButton.disabled = false;

  sendButton.addEventListener("click", async () => {
    try {
      Logger.log("Send Current Program button clicked", "messages");

      if (statusBadge) {
        statusBadge.textContent = "⏳ Sending...";
        statusBadge.className = "status-badge sending";
      }

      await sendCurrentProgram();

      if (statusBadge) {
        statusBadge.textContent = "✓ Synced";
        statusBadge.className = "status-badge synced";
      }

      Logger.log("Program sent successfully", "messages");
    } catch (error) {
      Logger.log(`Failed to send program: ${error}`, "error");

      if (statusBadge) {
        statusBadge.textContent = "⚠ Error";
        statusBadge.className = "status-badge error";
      }
    }
  });

  // Send Current Program button handler registered
}

/**
 * Set up "Quick Save" button handler
 */
function setupQuickSaveButton() {
  const quickSaveButton = document.getElementById("quick_save");

  if (!quickSaveButton) {
    Logger.log("Quick Save button not found", "error");
    return;
  }

  // Enable the button once everything is set up
  quickSaveButton.disabled = false;

  quickSaveButton.addEventListener("click", async () => {
    try {
      // Check if there's an active program to save
      if (!programState.activeProgram) {
        uiManager.showNotification(
          "No active program to save. Send to synths first!",
          "warning",
          2000,
        );
        return;
      }

      // Find the next available bank (1-10)
      const banks = programState.getSavedBanks();
      let nextAvailableBank = null;

      for (let i = 1; i <= 10; i++) {
        const bank = banks.find((b) => b.id === i);
        if (!bank || !bank.saved) {
          nextAvailableBank = i;
          break;
        }
      }

      if (!nextAvailableBank) {
        uiManager.showNotification(
          "All banks are full! Clear a bank first.",
          "warning",
          2000,
        );
        return;
      }

      // Update active program with current state before saving
      programState.captureFromUI();

      // Ensure parts are properly distributed before capturing
      partManager.redistributePartsNew();

      // Set active program which will capture current parts
      programState.setActiveProgram();

      // Save to the next available bank
      const success = programState.saveToBank(nextAvailableBank);

      if (success) {
        // Also tell all synths to save to this bank
        const connectedSynths = appState.get("connectedSynths");
        if (connectedSynths && connectedSynths.size > 0) {
          const synthIds = Array.from(connectedSynths.keys());
          let saveCount = 0;

          for (const synthId of synthIds) {
            const message = {
              type: "command",
              name: "save",
              value: nextAvailableBank,
            };

            const saveSuccess = networkCoordinator.sendCommandToSynth(
              synthId,
              message,
            );
            if (saveSuccess) {
              saveCount++;
            }
          }

          Logger.log(
            `Bank ${nextAvailableBank} save command sent to ${saveCount}/${synthIds.length} synths`,
            "messages",
          );
        }

        // Update bank display with a small delay to ensure state is saved
        setTimeout(() => {
          updateBankDisplay();
          updateActiveProgramDisplay();
        }, 50);

        // Visual feedback on button
        quickSaveButton.textContent = `✓ Bank ${nextAvailableBank}`;
        quickSaveButton.classList.add("success");
        setTimeout(() => {
          quickSaveButton.classList.remove("success");
          quickSaveButton.textContent = "Save";
        }, 2000);

        uiManager.showNotification(
          `Saved to Bank ${nextAvailableBank}`,
          "success",
          1500,
        );

        Logger.log(`Quick saved to Bank ${nextAvailableBank}`, "lifecycle");
      }
    } catch (error) {
      Logger.log(`Quick save failed: ${error}`, "error");
      uiManager.showNotification("Quick save failed", "error", 2000);
    }
  });

  // Quick Save button handler registered
}

/**
 * Set up power control
 */
function setupPowerControl() {
  const powerCheckbox = document.getElementById("power");

  if (!powerCheckbox) {
    Logger.log("Power checkbox not found", "error");
    return;
  }

  powerCheckbox.addEventListener("change", (event) => {
    const isOn = event.target.checked;
    // Power state changed

    // Send power command to all synths
    const command = MessageBuilders.power(isOn);

    const count = networkCoordinator.broadcastCommand(command);

    if (count > 0) {
      uiManager.showNotification(
        `Power ${isOn ? "ON" : "OFF"} sent to ${count} synths`,
        "success",
        1000,
      );
    } else {
      uiManager.showNotification("No synths connected", "warning", 1500);
    }
  });

  // Power control handler registered
}

/**
 * Set up volume control with debouncing
 */
function setupVolumeControl() {
  const volumeSlider = document.getElementById("masterGain");
  const volumeDisplay = document.getElementById("masterGainValue");

  if (!volumeSlider || !volumeDisplay) {
    Logger.log("Volume controls not found", "error");
    return;
  }

  // Update display immediately on input
  volumeSlider.addEventListener("input", (event) => {
    const volume = parseFloat(event.target.value);
    volumeDisplay.textContent = volume.toFixed(2);
  });

  // Send to synths only on release
  volumeSlider.addEventListener("change", (event) => {
    const volume = parseFloat(event.target.value);
    Logger.log(`Volume set to ${volume}`, "parameters");

    // Send volume command to all synths
    // This affects both master gain and bow force for natural dynamics
    const command = {
      type: "command",
      name: "volume",
      value: volume,
      // Optional: specify what the volume controls
      mode: "natural", // "natural" = both gain and bow force, "gain" = just master gain
    };

    const count = networkCoordinator.broadcastCommand(command);

    // Brief visual feedback
    if (count > 0) {
      volumeDisplay.style.color = "#4ade80";
      setTimeout(() => {
        volumeDisplay.style.color = "";
      }, 300);
    }
  });

  // Volume control handler registered
}

// Make it globally available

// Global function for button handlers
window.sendCurrentProgram = async () => {
  try {
    // Capture current state from UI
    programState.captureFromUI();

    // REMOVED: updateChord call - parts are now the source of truth

    // Update harmonic selections
    const harmonicSelections = appState.getNested(
      "performance.currentProgram.harmonicSelections",
    );
    if (harmonicSelections) {
      Object.entries(harmonicSelections).forEach(([key, values]) => {
        programState.updateHarmonicSelection(key, Array.from(values));
      });
    }

    // Update selected expression
    programState.currentProgram.selectedExpression =
      appState.getNested("ui.expressions.selected") || "none";

    // Ensure parts are properly distributed before sending
    partManager.redistributePartsNew();

    // Send to synths
    const result = await partManager.sendCurrentPart();
    
    // Always mark as active program and clear change indicators (even with no synths)
    programState.setActiveProgram();
    
    // Mark parameters as sent
    if (parameterControls.markAllParametersSent) {
      parameterControls.markAllParametersSent();
    }
    
    // Update status badge to show synced
    updateSyncStatus();
    
    // Update active program display to show expressions
    updateActiveProgramDisplay();
    
    if (result.totalSynths > 0) {
      Logger.log(
        `Program sent successfully to ${result.successCount}/${result.totalSynths} synths`,
        "messages",
      );
    } else {
      Logger.log("Program saved as active (no synths connected)", "messages");
    }

    return result;
  } catch (error) {
    Logger.log(`Failed to send program: ${error.message}`, "error");
    throw error;
  }
};

/**
 * Update sync status indicator
 */
function updateSyncStatus() {
  const statusBadge = document.getElementById("status_badge");
  if (!statusBadge) return;

  const isInSync = programState.isInSync();

  if (!isInSync) {
    statusBadge.textContent = "● Changes Pending";
    statusBadge.className = "status-badge pending";
  } else {
    statusBadge.textContent = "✓ Synced";
    statusBadge.className = "status-badge synced";
  }
}

// Make it globally available
window.updateSyncStatus = updateSyncStatus;
window.updateExpressionGroupVisibility = updateExpressionGroupVisibility;

// Debug function to manually show expression groups
window.showExpressionGroup = (type) => {
  const group = document.querySelector(`.expression-group.${type}`);
  if (group) {
    group.classList.add("active");
    Logger.log(`Manually showed ${type} group`, "ui");
  } else {
    Logger.log(`No element found for .expression-group.${type}`, "ui");
  }
};

/**
 * Send current program to all connected synths
 */
// Simplified send function that uses PartManager
async function sendCurrentProgram() {
  return window.sendCurrentProgram();
}

/**
 * Compatibility layer for legacy code
 */
function setupCompatibilityLayer() {
  // Setting up compatibility layer...

  // Expose modular components globally for gradual migration
  window.modular = {
    Logger,
    SystemConfig,
    eventBus,
    appState,
    programManager,
    networkCoordinator,
    uiManager,
    parameterControls,
    pianoKeyboard,
    partManager,
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
    harmonicSelections: Object.fromEntries(
      Object.entries(partManager.harmonicSelections).map(([k, v]) => [
        k,
        Array.from(v),
      ]),
    ),
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

  // Compatibility layer ready
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
if (SystemConfig.system.logging.enabled) {
  window.dev = {
    Logger,
    SystemConfig,
    eventBus,
    appState,
    programManager,
    networkCoordinator,
    uiManager,
    parameterControls,
    pianoKeyboard,
    partManager,
    // Utility functions
    getStatus: () => appState.getStatus(),
    getHistory: () => appState.getHistory(),
    getBanks: () => programManager.getSavedBanks(),
    getNetworkStatus: () => networkCoordinator.getNetworkStatus(),
    getChordInfo: () => partManager.getChordInfo(),
    getAllParams: () => parameterControls.getAllParameterValues(),
    getPartStats: () => partManager.getStatistics(),
    testSave: () =>
      programManager.saveToBank(1, ConfigUtils.getDefaultProgram()),
    testLoad: () => programManager.loadFromBank(1),
    testConnect: () => networkCoordinator.connect(),
    testDisconnect: () => networkCoordinator.disconnect(),
    testChord: () => partManager.setChord([261.63, 329.63, 392.0]),
    testExpression: () =>
      partManager.setNoteExpression("C4", { type: "vibrato", depth: 0.02 }),
    testSend: () => partManager.sendCurrentPart(),
    testParam: () => parameterControls.setParameterValue("masterGain", 0.8),
    testTransitions: () => {
      Logger.log("=== Testing Transition Controls ===", "lifecycle");

      // Set up a chord and expressions
      partManager.setChord([261.63, 329.63, 392.0]);
      partManager.setNoteExpression("C4", { type: "vibrato", depth: 0.02 });
      partManager.setNoteExpression("E4", { type: "tremolo", depth: 0.3 });

      // Test with different transition durations
      const durations = [0.5, 1.0, 2.0, 3.0];
      const results = [];

      durations.forEach((duration, i) => {
        setTimeout(() => {
          Logger.log(`Testing transition duration: ${duration}s`, "lifecycle");
          document.getElementById("transitionDuration").value =
            duration.toString();
          document.getElementById("transitionDurationValue").textContent =
            duration.toFixed(1);

          partManager
            .sendCurrentPart()
            .then((result) => {
              Logger.log(
                `Duration ${duration}s - Success:`,
                result,
                "lifecycle",
              );
              results.push({ duration, result });
            })
            .catch((error) => {
              Logger.log(`Duration ${duration}s - Failed:`, error, "error");
              results.push({ duration, error });
            });
        }, i * 4000); // 4 seconds apart
      });

      Logger.log(
        "Transition tests scheduled. Check results in 20 seconds.",
        "lifecycle",
      );
      return Promise.resolve("Tests scheduled");
    },
    testPartManager: () => {
      Logger.log("=== PartManager Test ===", "lifecycle");

      // Test chord setting
      Logger.log("1. Setting chord to C major...", "parameters");
      partManager.setChord([261.63, 329.63, 392.0]);

      // Test expression assignment
      Logger.log("2. Adding vibrato to C4...", "lifecycle");
      partManager.setNoteExpression("C4", {
        type: "vibrato",
        depth: 0.02,
        rate: 6,
      });

      // Test harmonic selection
      Logger.log("3. Setting harmonic ratios...", "parameters");
      partManager.updateHarmonicSelection({
        expression: "vibrato",
        type: "numerator",
        selection: [1, 2, 3],
      });

      // Test info retrieval
      Logger.log("4. Getting chord info...", "expressions");
      const info = partManager.getChordInfo();
      Logger.log(`"Chord info:", info`, "expressions");

      // Test statistics
      Logger.log("5. Getting statistics...", "lifecycle");
      const stats = partManager.getStatistics();
      Logger.log(`"Stats:", stats`, "lifecycle");

      // Test program send (if synths connected)
      const connectedSynths = appState.get("connectedSynths");
      if (connectedSynths && connectedSynths.size > 0) {
        Logger.log("6. Sending current part...", "parts");
        return partManager
          .sendCurrentPart()
          .then((result) => {
            Logger.log(`"Send result:", result`, "messages");
            Logger.log("=== Test Complete ===", "lifecycle");
            return result;
          })
          .catch((error) => {
            Logger.log("Send failed:", error, "error");
            Logger.log("=== Test Complete (with error) ===", "errors");
            return error;
          });
      } else {
        Logger.log(`"6. No synths connected, skipping send test"`, "messages");
        Logger.log("=== Test Complete ===", "lifecycle");
        return Promise.resolve("No synths to test");
      }
    },
    enableAllLogs: () => {
      Object.keys(Logger.categories).forEach((cat) => {
        if (cat !== "errors") Logger.enable(cat);
      });
    },
    disableAllLogs: () => {
      Object.keys(Logger.categories).forEach((cat) => {
        Logger.disable(cat);
      });
    },
  };

  Logger.log("Development utilities available at window.dev", "lifecycle");
}

// Debug helper to check what's loaded
function debugModuleLoading() {}

// Enhanced error handling
window.addEventListener("error", (event) => {
  Logger.log("Global error:", event.error, "error");
  Logger.log("Stack:", event.error?.stack, "error");
});

window.addEventListener("unhandledrejection", (event) => {
  Logger.log("Unhandled promise rejection:", event.reason, "error");
});

// Start the application with better error handling
async function startApp() {
  try {
    debugModuleLoading();

    setupCompatibilityLayer();
    await initializeApp();
  } catch (error) {
    // Don't fall back to legacy system - we need to fix the modular system
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
      Logger.log("WebRTCManager not initialized", "error");
      return;
    }
    return await window.webRTCManager.testICEConfiguration(peerId, mode);
  },

  // Force refresh ICE servers
  refreshICE: async () => {
    await fetchIceServers();
    return SystemConfig.network.webrtc.iceServers;
  },

  // Get detailed peer info
  getPeerInfo: (peerId) => {
    if (!window.webRTCManager) {
      Logger.log("WebRTCManager not initialized", "error");
      return;
    }
    return window.webRTCManager.getPeerInfo(peerId);
  },

  // Get all peers
  getAllPeers: () => {
    if (!window.webRTCManager) {
      Logger.log("WebRTCManager not initialized", "error");
      return;
    }
    return window.webRTCManager.getAllPeers();
  },

  // Get ICE candidate stats for a peer
  getICEStats: async (peerId) => {
    if (!window.webRTCManager) {
      Logger.log("WebRTCManager not initialized", "error");
      return;
    }
    const peerData = window.webRTCManager.peers.get(peerId);
    if (!peerData) {
      Logger.log(`No peer found with ID: ${peerId}`, "error");
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
      Logger.log("WebRTCManager not initialized", "error");
      return;
    }
    window.webRTCManager.handlePeerDisconnection(peerId);
  },

  // Get current RTC config
  getConfig: () => {
    return { iceServers: SystemConfig.network.webrtc.iceServers };
  },
};
