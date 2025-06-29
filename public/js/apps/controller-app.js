// controller-app.js - Controller application entry point
window.__modularSystemActive = true;

/**
 * String Assembly FM Controller - Modular Version
 * Main application entry point
 */

// Import core modules
import { Logger } from "../modules/core/Logger.js";
import { SystemConfig, ConfigUtils, fetchIceServers } from '../config/system.config.js';
import { eventBus } from "../modules/core/EventBus.js";
import { appState } from "../modules/state/AppState.js";
import { programManager } from "../modules/state/ProgramManager.js";
import { programState } from "../modules/state/ProgramState.js";
import { networkCoordinator } from "../modules/network/NetworkCoordinator.js";
import { uiManager } from "../modules/ui/UIManager.js";
import { parameterControls } from "../modules/ui/ParameterControls.js";
import { pianoKeyboard } from "../modules/ui/PianoKeyboard.js";
import { partManager } from "../modules/audio/PartManager.js";
import { MessageBuilders, MessageTypes, CommandNames } from "../protocol/MessageProtocol.js";

// Import UI components
import "../modules/ui/HarmonicRatioSelector.js";
import { AudioUtilities } from "../modules/utils/AudioUtilities.js";

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
    await initializeCore();

    // Initialize state management
    initializeState();

    // Initialize program management
    initializeProgramManager();
    programState.initialize();
    Logger.log("Program state system initialized", "lifecycle");

    // Initialize UI components BEFORE network so status updates are visible
    await initializeUI();

    // Initialize network layer and wait for connection
    await initializeNetwork();

    // Initialize audio system
    await initializeAudio();

    // Set up event listeners
    setupGlobalEventListeners();

    Logger.log("Application initialized successfully", "lifecycle");
    
    // Mark as ready only after all systems are up
    appState.set("connectionStatus", "ready");
    
    Logger.log("Application ready (modular-v1.0)", "lifecycle");

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
      // Format value for logging, handling Maps specially
      let formattedValue;
      if (newValue instanceof Map) {
        formattedValue = `Map(${newValue.size}) {${Array.from(
          newValue.entries(),
        )
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join(", ")}}`;
      } else {
        formattedValue = JSON.stringify(newValue);
      }
      Logger.log(`State change: ${key} = ${formattedValue}`, "lifecycle");
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

  // Basic program event handlers that don't need network
  eventBus.on("program:cleared", (data) => {
    Logger.log(`Bank ${data.bankId} cleared`, "lifecycle");
  });

  Logger.log("Program management initialized", "lifecycle");
}

/**
 * Set up program network event handlers (called after network init)
 */
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
      durationSpread: parseFloat(transitionParams.transitionDurationSpread) || 0.0,
    };
    
    Logger.log(`Transition config: duration=${transitionConfig.duration.toFixed(2)}s, stagger=${transitionConfig.stagger.toFixed(2)}, spread=${transitionConfig.durationSpread.toFixed(2)}`, "messages");
    
    // Send the loaded program to synths
    try {
      const result = await partManager.sendCurrentPart({ transition: transitionConfig });
      Logger.log(`Program sent to ${result.successCount}/${result.totalSynths} synths`, "messages");
      
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
  Logger.log("Initializing network layer...", "lifecycle");

  // Initialize network coordinator
  await networkCoordinator.initialize();

  // Set up network event handlers
  setupNetworkEventHandlers();
  
  // Set up program network handlers now that network is ready
  setupProgramNetworkHandlers();

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
  
  // Store reference in appState for ProgramManager
  appState.set("pianoKeyboard", pianoKeyboard);

  // Set up UI event handlers
  setupUIEventHandlers();
  
  // Initialize sync status
  updateSyncStatus();

  Logger.log("UI layer initialized", "lifecycle");
}

/**
 * Initialize audio system
 */
async function initializeAudio() {
  Logger.log("Initializing audio system...", "lifecycle");

  // Initialize part manager (replaces expression and chord managers)
  await partManager.initialize();

  // Store in app state for global access
  appState.set("partManager", partManager);
  appState.set("parameterControls", parameterControls);
  appState.set("networkCoordinator", networkCoordinator);

  // Set up audio event handlers
  setupAudioEventHandlers();

  Logger.log("Audio system initialized", "lifecycle");
}

/**
 * Set up audio event handlers
 */
function setupAudioEventHandlers() {
  // PartManager handles all chord and expression events internally
  // No additional event handlers needed
  Logger.log(
    "Audio event handlers set up (PartManager handles internally)",
    "lifecycle",
  );
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

  // Handle chord changes from piano (don't auto-distribute)
  pianoKeyboard.on("chordChanged", (data) => {
    Logger.log(`Chord updated: ${data.noteNames.join(", ")}`, "expressions");

    // Update part manager
    partManager.setChord(data.chord);

    // Update legacy app state for compatibility
    appState.set("currentChord", data.chord);
  });

  // Handle expression changes from piano
  eventBus.on("expression:changed", (data) => {
    if (data.note && data.expression) {
      Logger.log(
        `Expression assigned: ${data.note} = ${data.expression.type}`,
        "expressions",
      );
      partManager.setNoteExpression(data.note, data.expression);
    } else if (data.note && !data.expression) {
      Logger.log(`Expression removed: ${data.note}`, "expressions");
      partManager.setNoteExpression(data.note, null);
    }
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

  // Set up "Send Current Program" button
  setupProgramSendButton();
  
  // Set up "Quick Save" button
  setupQuickSaveButton();
  
  // Set up bank control buttons
  setupBankControls();
  
  // Set up power and volume controls
  setupPowerControl();
  setupVolumeControl();
}

/**
 * Set up bank control buttons
 */
function setupBankControls() {
  const saveButton = document.getElementById("save_bank");
  const loadButton = document.getElementById("load_bank");
  const bankSelector = document.getElementById("bank_selector");
  
  if (saveButton) {
    saveButton.addEventListener("click", (e) => {
      const bankId = parseInt(bankSelector.value);
      
      // Save active program to bank using ProgramState
      const success = programState.saveToBank(bankId);
      
      if (success) {
        // Also tell all synths to save to this bank
        const connectedSynths = appState.get("connectedSynths");
        if (connectedSynths && connectedSynths.size > 0) {
          const synthIds = Array.from(connectedSynths.keys());
          let saveCount = 0;
          
          for (const synthId of synthIds) {
            const message = MessageBuilders.command(CommandNames.SAVE, bankId);
            
            const saveSuccess = networkCoordinator.sendCommandToSynth(synthId, message);
            if (saveSuccess) {
              saveCount++;
            }
          }
          
          Logger.log(`Bank ${bankId} save command sent to ${saveCount}/${synthIds.length} synths`, "messages");
        }
        
        // Update bank display
        updateBankDisplay();
        updateActiveProgramDisplay();
        
        // Visual feedback
        e.target.classList.add("success");
        e.target.textContent = "✓ Saved";
        setTimeout(() => {
          e.target.classList.remove("success");
          e.target.textContent = "Save";
        }, 1500);
        
        Logger.log(`Saved to Bank ${bankId}`, "lifecycle");
      } else {
        // No active program to save
        e.target.classList.add("error");
        e.target.textContent = "✗ No Active";
        setTimeout(() => {
          e.target.classList.remove("error");
          e.target.textContent = "Save";
        }, 1500);
        
        uiManager.showNotification(
          "No active program to save. Send to synths first!",
          "warning",
          2000
        );
      }
    });
  }
  
  if (loadButton) {
    loadButton.addEventListener("click", async (e) => {
      const bankId = parseInt(bankSelector.value);
      const success = programState.loadFromBank(bankId);
      
      if (success) {
        // Tell synths to load their stored bank
        const result = await sendBankLoadMessage(bankId);
        
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
        
        // Update bank display
        updateBankDisplay();
        updateActiveProgramDisplay();
        
        // Visual feedback
        e.target.classList.add("success");
        e.target.textContent = "✓ Loaded";
        setTimeout(() => {
          e.target.classList.remove("success");
          e.target.textContent = "Load";
        }, 1500);
      } else {
        // Error feedback
        e.target.classList.add("error");
        e.target.textContent = "✗ Empty";
        setTimeout(() => {
          e.target.classList.remove("error");
          e.target.textContent = "Load";
        }, 1500);
      }
    });
  }
  
  
  // Update bank display on load
  updateBankDisplay();
  updateActiveProgramDisplay();
}

/**
 * Update active program display
 */
function updateActiveProgramDisplay() {
  const activeProgramDisplay = document.getElementById('active-program-display');
  if (!activeProgramDisplay) return;
  
  const activeProgram = programState.activeProgram;
  
  if (!activeProgram) {
    activeProgramDisplay.innerHTML = '<span style="color: #64748b;">No active program</span>';
    return;
  }
  
  // Define expression colors locally (optimized for dark mode)
  const EXPRESSION_COLORS = {
    none: "#60a5fa",      // Light blue
    vibrato: "#f87171",   // Light red
    tremolo: "#4ade80",   // Light green
    trill: "#fbbf24"      // Amber (instead of yellow for better visibility)
  };
  
  let chordDisplay = '<span style="color: #64748b;">No chord</span>';
  
  if (activeProgram.chord && activeProgram.chord.frequencies && activeProgram.chord.frequencies.length > 0) {
    // Convert frequencies to note names with expressions
    const noteStrings = activeProgram.chord.frequencies.map(freq => {
      const noteName = AudioUtilities.frequencyToNoteName(freq);
      
      // Check if this note has an expression
      if (activeProgram.chord.expressions && activeProgram.chord.expressions[noteName]) {
        const expr = activeProgram.chord.expressions[noteName];
        switch (expr.type) {
          case 'vibrato':
            return `<span style="color: ${EXPRESSION_COLORS.vibrato};">${noteName}v${Math.round(expr.depth * 100)}</span>`;
          case 'tremolo':
            return `<span style="color: ${EXPRESSION_COLORS.tremolo};">${noteName}t${Math.round(expr.articulation * 100)}</span>`;
          case 'trill':
            const trillNote = AudioUtilities.frequencyToNoteName(freq * Math.pow(2, expr.interval / 12));
            return `<span style="color: ${EXPRESSION_COLORS.trill};">${noteName}(→${trillNote})</span>`;
          default:
            return `<span style="color: ${EXPRESSION_COLORS.none};">${noteName}</span>`;
        }
      }
      return `<span style="color: ${EXPRESSION_COLORS.none};">${noteName}</span>`;
    });
    
    chordDisplay = noteStrings.join(' ');
  }
  
  activeProgramDisplay.innerHTML = chordDisplay;
}

/**
 * Update bank selector display
 */
function updateBankDisplay() {
  const banks = programState.getSavedBanks();
  const selector = document.getElementById("bank_selector");
  const savedBanksDisplay = document.getElementById("saved-banks-display");
  
  if (selector) {
    banks.forEach(bank => {
      const option = selector.querySelector(`option[value="${bank.id}"]`);
      if (option) {
        option.textContent = bank.saved ? `Bank ${bank.id} ●` : `Bank ${bank.id} ⚪`;
      }
    });
  }
  
  // Update saved banks display in sidebar
  if (savedBanksDisplay) {
    const savedBanks = banks.filter(bank => bank.saved);
    const clearButton = document.getElementById('clear-banks-btn');
    
    if (savedBanks.length === 0) {
      savedBanksDisplay.innerHTML = '<div style="color: #64748b; text-align: center; padding: 20px;">No banks saved yet</div>';
      if (clearButton) clearButton.style.display = 'none';
    } else {
      if (clearButton) clearButton.style.display = 'block';
      savedBanksDisplay.innerHTML = savedBanks.map(bank => {
        const program = bank.program;
        let chordDisplay = 'No chord';
        
        if (program && program.chord && program.chord.frequencies && program.chord.frequencies.length > 0) {
          // Convert frequencies to note names with expressions
          const noteStrings = program.chord.frequencies.map(freq => {
            const noteName = AudioUtilities.frequencyToNoteName(freq);
            
            // Check if this note has an expression
            if (program.chord.expressions && program.chord.expressions[noteName]) {
              const expr = program.chord.expressions[noteName];
              switch (expr.type) {
                case 'vibrato':
                  return `${noteName}v${Math.round(expr.depth * 100)}`;
                case 'tremolo':
                  return `${noteName}t${Math.round(expr.articulation * 100)}`;
                case 'trill':
                  const trillNote = AudioUtilities.frequencyToNoteName(freq * Math.pow(2, expr.interval / 12));
                  return `${noteName}(→${trillNote})`;
                default:
                  return noteName;
              }
            }
            return noteName;
          });
          
          chordDisplay = noteStrings.join(' ');
        }
        
        const isActive = parseInt(selector?.value) === bank.id;
        
        return `
          <div class="bank-item ${isActive ? 'active' : ''}" data-bank-id="${bank.id}">
            <span class="bank-number">Bank ${bank.id}:</span>
            <span class="bank-chord">${chordDisplay}</span>
          </div>
        `;
      }).join('');
      
      // Add click handlers to bank items
      savedBanksDisplay.querySelectorAll('.bank-item').forEach(item => {
        item.addEventListener('click', async (e) => {
          e.preventDefault(); // Prevent text selection on shift-click
          const bankId = parseInt(item.dataset.bankId);
          const isPreview = e.shiftKey;

          if (isPreview) {
            // Shift-click: Preview the program without sending to synths
            if (programManager.loadFromBank(bankId, { preview: true })) {
              uiManager.showNotification(`Previewing Bank ${bankId}`, "info", 1500);
            }
          } else {
            // Normal click: Load and send to synths
            if (programState.loadFromBank(bankId)) {
              // Update bank selector
              const bankSelector = document.getElementById("bank_selector");
              if (bankSelector) {
                bankSelector.value = bankId;
              }
              
              // Tell synths to load their stored bank
              const result = await sendBankLoadMessage(bankId);
              
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
              
              // Update displays
              updateBankDisplay();
              updateActiveProgramDisplay();
            }
          }
        });
      });
    }
    
    // Add click handler for clear button (only if not already attached)
    if (clearButton && !clearButton.hasAttribute('data-handler-attached')) {
      clearButton.setAttribute('data-handler-attached', 'true');
      clearButton.addEventListener('click', () => {
        programState.clearAllBanks();
        updateBankDisplay();
      });
    }
  }
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
    const bank = banks.find(b => b.id === data.bankId);
    
    if (!bank || !bank.saved) {
      Logger.log(`Bank ${data.bankId} not found`, "error");
      return;
    }
    
    const savedProgram = bank.program;
    
    // Get or create assignment for this synth
    let assignment = partManager.synthAssignments.get(data.synthId);
    
    if (!assignment && savedProgram.chord && savedProgram.chord.frequencies.length > 0) {
      // Assign based on saved chord
      const synthIndex = partManager.synthAssignments.size;
      const frequency = savedProgram.chord.frequencies[synthIndex % savedProgram.chord.frequencies.length];
      const noteName = partManager.frequencyToNoteName(frequency);
      const expression = savedProgram.chord.expressions[noteName] || { type: "none" };
      assignment = { frequency, expression };
      partManager.synthAssignments.set(data.synthId, assignment);
    }
    
    if (!assignment) {
      Logger.log(`No assignment available for ${data.synthId}`, "error");
      return;
    }
    
    // Create synth program with saved parameters
    const synthProgram = {
      ...savedProgram.parameters,
      powerOn: savedProgram.powerOn,
      fundamentalFrequency: assignment.frequency
    };
    
    // IMPORTANT: For bank loads, we need to apply expression with HRG resolution
    // The controller's saved program doesn't have the resolved expression values
    // Each synth needs its own unique HRG-resolved values
    partManager.applyExpressionToProgram(synthProgram, assignment.expression);
    
    Logger.log(`Sending newly resolved program to ${data.synthId}: freq=${assignment.frequency.toFixed(1)}Hz, expr=${assignment.expression.type}`, "messages");
    
    // Send with transition
    const success = networkCoordinator.sendProgramToSynth(
      data.synthId,
      synthProgram,
      data.transition || {}
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
    console.log(`[KEYBOARD DEBUG] Key pressed: ${event.key}, Shift: ${event.shiftKey}, Target: ${event.target.tagName}`);
    
    // Ignore if user is typing in an input field
    const activeElement = document.activeElement;
    if (activeElement && (
      activeElement.tagName === "INPUT" || 
      activeElement.tagName === "TEXTAREA" ||
      activeElement.tagName === "SELECT" ||
      activeElement.isContentEditable
    )) {
      console.log(`[KEYBOARD DEBUG] Ignoring - user is in ${activeElement.tagName}`);
      return;
    }
    
    // Check if it's a number key (1-9 or 0)
    // Use event.code which is consistent regardless of shift state
    const code = event.code;
    const key = event.key;
    
    // Check for 's' key (Quick Save)
    if (key === 's' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
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
        console.log(`[KEYBOARD] Shift+${digit} pressed - saving to bank`);
      }
      
      // Map 0 to bank 10, 1-9 to banks 1-9
      const bankId = digit === "0" ? 10 : parseInt(digit);
      
      if (event.shiftKey) {
        // Shift + number = Save active program to bank
        event.preventDefault();
        event.stopPropagation();
        
        // Save active program to bank using ProgramState
        const success = programState.saveToBank(bankId);
        
        if (!success) {
          // No active program yet - need to send first
          uiManager.showNotification(
            `No active program to save. Send to synths first!`,
            "warning",
            2000
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
            
            const saveSuccess = networkCoordinator.sendCommandToSynth(synthId, message);
            if (saveSuccess) {
              saveCount++;
              Logger.log(`Sent save command for bank ${bankId} to ${synthId}`, "messages");
            }
          }
          
          Logger.log(`Bank ${bankId} save command sent to ${saveCount}/${synthIds.length} synths`, "messages");
        }
        
        // Update bank selector to show current bank
        const bankSelector = document.getElementById("bank_selector");
        if (bankSelector) {
          bankSelector.value = bankId;
        }
        
        // Update bank display
        updateBankDisplay();
        updateActiveProgramDisplay();
        
        // Visual feedback
        uiManager.showNotification(
          `Saved active program to Bank ${bankId} (Shift+${key})`,
          "success",
          1500
        );
        
        Logger.log(`Keyboard shortcut: Saved active program to Bank ${bankId}`, "lifecycle");
      } else {
        // Just number = Load from bank
        event.preventDefault();
        event.stopPropagation();
        
        const success = programState.loadFromBank(bankId);
        
        if (success) {
          // Update bank selector to show current bank
          const bankSelector = document.getElementById("bank_selector");
          if (bankSelector) {
            bankSelector.value = bankId;
          }
          
          // Program loaded and applied to UI
          // Now tell synths to load their stored bank
          sendBankLoadMessage(bankId).then((result) => {
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
              1500
            );
            Logger.log(`Keyboard shortcut: Loaded Bank ${bankId}`, "lifecycle");
            
            // Update bank display
            updateBankDisplay();
            updateActiveProgramDisplay();
          });
        } else {
          // No data in bank
          uiManager.showNotification(
            `Bank ${bankId} is empty`,
            "warning",
            1500
          );
        }
      }
    }
  });

  Logger.log("Global event listeners set up", "lifecycle");
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

  Logger.log("Send Current Program button handler registered", "lifecycle");
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
          2000
        );
        return;
      }
      
      // Find the next available bank (1-10)
      const banks = programState.getSavedBanks();
      let nextAvailableBank = null;
      
      for (let i = 1; i <= 10; i++) {
        const bank = banks.find(b => b.id === i);
        if (!bank || !bank.saved) {
          nextAvailableBank = i;
          break;
        }
      }
      
      if (!nextAvailableBank) {
        uiManager.showNotification(
          "All banks are full! Clear a bank first.",
          "warning",
          2000
        );
        return;
      }
      
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
              value: nextAvailableBank
            };
            
            const saveSuccess = networkCoordinator.sendCommandToSynth(synthId, message);
            if (saveSuccess) {
              saveCount++;
            }
          }
          
          Logger.log(`Bank ${nextAvailableBank} save command sent to ${saveCount}/${synthIds.length} synths`, "messages");
        }
        
        // Update bank selector to show the saved bank
        const bankSelector = document.getElementById("bank_selector");
        if (bankSelector) {
          bankSelector.value = nextAvailableBank;
        }
        
        // Update bank display
        updateBankDisplay();
        updateActiveProgramDisplay();
        
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
          1500
        );
        
        Logger.log(`Quick saved to Bank ${nextAvailableBank}`, "lifecycle");
      }
    } catch (error) {
      Logger.log(`Quick save failed: ${error}`, "error");
      uiManager.showNotification(
        "Quick save failed",
        "error",
        2000
      );
    }
  });
  
  Logger.log("Quick Save button handler registered", "lifecycle");
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
    Logger.log(`Power ${isOn ? 'ON' : 'OFF'}`, "messages");
    
    // Send power command to all synths
    const command = MessageBuilders.power(isOn);
    
    const count = networkCoordinator.broadcastCommand(command);
    
    if (count > 0) {
      uiManager.showNotification(
        `Power ${isOn ? 'ON' : 'OFF'} sent to ${count} synths`,
        "success",
        1000
      );
    } else {
      uiManager.showNotification(
        "No synths connected",
        "warning",
        1500
      );
    }
  });
  
  Logger.log("Power control handler registered", "lifecycle");
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
      mode: "natural" // "natural" = both gain and bow force, "gain" = just master gain
    };
    
    const count = networkCoordinator.broadcastCommand(command);
    
    // Brief visual feedback
    if (count > 0) {
      volumeDisplay.style.color = '#4ade80';
      setTimeout(() => {
        volumeDisplay.style.color = '';
      }, 300);
    }
  });
  
  Logger.log("Volume control handler registered", "lifecycle");
}

/**
 * Send bank load message to all connected synths
 * @param {number} bankId - Bank ID to load
 */
async function sendBankLoadMessage(bankId) {
  try {
    Logger.log(`Sending bank load message for bank ${bankId}`, "messages");
    
    const connectedSynths = appState.get("connectedSynths");
    if (!connectedSynths || connectedSynths.size === 0) {
      Logger.log("No synths connected to load bank", "warning");
      return { successCount: 0, totalSynths: 0 };
    }
    
    let successCount = 0;
    const synthIds = Array.from(connectedSynths.keys());
    
    // Get current transition parameters from UI
    const transitionParams = parameterControls.getAllParameterValues();
    
    const transitionConfig = {
      duration: transitionParams.transitionDuration,
      stagger: transitionParams.transitionStagger,
      durationSpread: transitionParams.transitionDurationSpread,
      glissando: transitionParams.glissando !== undefined ? transitionParams.glissando : true, // default true
    };
    
    Logger.log(`Using transition config: duration=${transitionConfig.duration}s, stagger=${transitionConfig.stagger}, spread=${transitionConfig.durationSpread}`, "messages");
    
    // Send load command to each synth
    for (const synthId of synthIds) {
      const message = MessageBuilders.command(CommandNames.LOAD, {
        bank: bankId,
        transition: transitionConfig
      });
      
      Logger.log(`Attempting to send load command to ${synthId} for bank ${bankId}`, "messages");
      
      const success = networkCoordinator.sendCommandToSynth(synthId, message);
      if (success) {
        successCount++;
        Logger.log(`Sent bank ${bankId} load to ${synthId}`, "messages");
      } else {
        Logger.log(`Failed to send bank ${bankId} load to ${synthId}`, "error");
      }
    }
    
    Logger.log(`Bank load sent to ${successCount}/${synthIds.length} synths`, "messages");
    return { successCount, totalSynths: synthIds.length };
  } catch (error) {
    Logger.log(`Failed to send bank load: ${error}`, "error");
    throw error;
  }
}

// Make it globally available
window.sendBankLoadMessage = sendBankLoadMessage;

// Global function for button handlers
window.sendCurrentProgram = async () => {
  try {
    // Capture current state from UI
    programState.captureFromUI();
    
    // Update chord and expressions in program state
    programState.updateChord(partManager.currentChord, Object.fromEntries(partManager.noteExpressions));
    
    // Update harmonic selections
    const harmonicSelections = appState.get('harmonicSelections');
    if (harmonicSelections) {
      Object.entries(harmonicSelections).forEach(([key, values]) => {
        programState.updateHarmonicSelection(key, Array.from(values));
      });
    }
    
    // Update selected expression
    programState.currentProgram.selectedExpression = appState.get('selectedExpression') || 'none';
    
    // Send to synths
    const result = await partManager.sendCurrentPart();
    Logger.log(
      `Program sent successfully to ${result.successCount}/${result.totalSynths} synths`,
      "messages",
    );

    // Store as active program only if send was successful
    if (result.successCount > 0) {
      programState.setActiveProgram();
      
      // Mark parameters as sent
      if (parameterControls.markAllParametersSent) {
        parameterControls.markAllParametersSent();
      }
      
      // Update status badge to show synced
      updateSyncStatus();
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
  Logger.log("Setting up compatibility layer...", "lifecycle");

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
    testSave: () => programManager.saveToBank(1, ConfigUtils.getDefaultProgram()),
    testLoad: () => programManager.loadFromBank(1),
    testConnect: () => networkCoordinator.connect(),
    testDisconnect: () => networkCoordinator.disconnect(),
    testChord: () => partManager.setChord([261.63, 329.63, 392.0]),
    testExpression: () =>
      partManager.setNoteExpression("C4", { type: "vibrato", depth: 0.02 }),
    testSend: () => partManager.sendCurrentPart(),
    testParam: () => parameterControls.setParameterValue("masterGain", 0.8),
    testTransitions: () => {
      console.log("=== Testing Transition Controls ===");

      // Set up a chord and expressions
      partManager.setChord([261.63, 329.63, 392.0]);
      partManager.setNoteExpression("C4", { type: "vibrato", depth: 0.02 });
      partManager.setNoteExpression("E4", { type: "tremolo", depth: 0.3 });

      // Test with different transition durations
      const durations = [0.5, 1.0, 2.0, 3.0];
      const results = [];

      durations.forEach((duration, i) => {
        setTimeout(() => {
          console.log(`Testing transition duration: ${duration}s`);
          document.getElementById("transitionDuration").value =
            duration.toString();
          document.getElementById("transitionDurationValue").textContent =
            duration.toFixed(1);

          partManager
            .sendCurrentPart()
            .then((result) => {
              console.log(`Duration ${duration}s - Success:`, result);
              results.push({ duration, result });
            })
            .catch((error) => {
              console.error(`Duration ${duration}s - Failed:`, error);
              results.push({ duration, error });
            });
        }, i * 4000); // 4 seconds apart
      });

      console.log("Transition tests scheduled. Check results in 20 seconds.");
      return Promise.resolve("Tests scheduled");
    },
    testPartManager: () => {
      console.log("=== PartManager Test ===");

      // Test chord setting
      console.log("1. Setting chord to C major...");
      partManager.setChord([261.63, 329.63, 392.0]);

      // Test expression assignment
      console.log("2. Adding vibrato to C4...");
      partManager.setNoteExpression("C4", {
        type: "vibrato",
        depth: 0.02,
        rate: 6,
      });

      // Test harmonic selection
      console.log("3. Setting harmonic ratios...");
      partManager.updateHarmonicSelection({
        expression: "vibrato",
        type: "numerator",
        selection: [1, 2, 3],
      });

      // Test info retrieval
      console.log("4. Getting chord info...");
      const info = partManager.getChordInfo();
      console.log("Chord info:", info);

      // Test statistics
      console.log("5. Getting statistics...");
      const stats = partManager.getStatistics();
      console.log("Stats:", stats);

      // Test program send (if synths connected)
      const connectedSynths = appState.get("connectedSynths");
      if (connectedSynths && connectedSynths.size > 0) {
        console.log("6. Sending current part...");
        return partManager
          .sendCurrentPart()
          .then((result) => {
            console.log("Send result:", result);
            console.log("=== Test Complete ===");
            return result;
          })
          .catch((error) => {
            console.error("Send failed:", error);
            console.log("=== Test Complete (with error) ===");
            return error;
          });
      } else {
        console.log("6. No synths connected, skipping send test");
        console.log("=== Test Complete ===");
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
function debugModuleLoading() {
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
      console.error("WebRTCManager not initialized");
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
    return { iceServers: SystemConfig.network.webrtc.iceServers };
  },
};

