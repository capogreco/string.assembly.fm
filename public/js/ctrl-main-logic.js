// // Enhanced logging system with categories
// window.DEBUG_CONFIG = {
//   connections: false, // WebSocket, WebRTC connections
//   messages: false, // Message passing between peers
//   parameters: false, // Parameter changes
//   expressions: false, // Chord and expression changes
//   performance: false, // Latency, pings
//   lifecycle: true, // Important state changes (default on)
//   errors: true, // Always on
// };

// function log(message, category = "lifecycle") {
//   // Always show errors
//   if (category === "error") {
//     console.error(`[${new Date().toLocaleTimeString()}] [ERROR] ${message}`);
//     return;
//   }

//   // Check if category is enabled
//   if (!window.DEBUG_CONFIG[category]) {
//     return;
//   }

//   const timestamp = new Date().toLocaleTimeString();
//   const prefix = `[${timestamp}] [${category.toUpperCase()}]`;
//   console.log(`${prefix} ${message}`);
// }

// const controller_id = `ctrl-${Math.random().toString(36).substr(2, 9)}`;
// const other_controllers = new Set();
// const _ws = null; // Legacy reference (unused)
// const _heartbeat_interval = null; // Legacy reference (unused)
// const _wake_lock = null;
// const _kicked = false;

// window.svgExpression = null;
// window.chordDistributor = null; // Will be initialized after its class is loaded
// window.currentChord = [];

// // Global state management
// const AppState = {
//   current_program: null,
//   current_chord_state: null, // Store current chord and distribution info
//   program_banks: new Map(),

//   // Harmonic ratio selector functionality
//   harmonicSelections: {
//     "vibrato-numerator": new Set([1]),
//     "vibrato-denominator": new Set([1]),
//     "trill-numerator": new Set([1]),
//     "trill-denominator": new Set([1]),
//     "tremolo-numerator": new Set([1]),
//     "tremolo-denominator": new Set([1]),
//   },
// };

// // Program Management Module
// const ProgramManager = {
//   // Load saved banks from localStorage
//   loadBanksFromStorage() {
//     try {
//       const saved = localStorage.getItem("string-assembly-banks");
//       if (saved) {
//         const banksData = JSON.parse(saved);
//         Object.entries(banksData).forEach(([bankId, program]) => {
//           AppState.program_banks.set(parseInt(bankId), program);
//         });
//         log(
//           `Loaded ${AppState.program_banks.size} banks from storage`,
//           "lifecycle",
//         );
//       }
//     } catch (e) {
//       log(`Failed to load banks from storage: ${e}`, "error");
//     }
//   },

//   saveBanksToStorage() {
//     try {
//       const banksData = {};
//       AppState.program_banks.forEach((program, bankId) => {
//         banksData[bankId] = program;
//       });
//       localStorage.setItem("string-assembly-banks", JSON.stringify(banksData));
//     } catch (e) {
//       log(`Failed to save banks to storage: ${e}`, "error");
//     }
//   },

//   saveToBank(bank_id) {
//     // Get current UI state (the "recipe" for new synths)
//     AppState.current_program = get_current_program();

//     // Store harmonic selections (convert Sets to Arrays for JSON serialization)
//     const harmonicSelectionsForSave = {};
//     Object.keys(AppState.harmonicSelections).forEach((key) => {
//       harmonicSelectionsForSave[key] = Array.from(
//         AppState.harmonicSelections[key],
//       );
//     });

//     const controllerState = {
//       ...AppState.current_program,
//       harmonicSelections: harmonicSelectionsForSave,
//       chordNotes: window.currentChord ? [...window.currentChord] : [],
//       expressions: window.svgExpression
//         ? window.svgExpression.getAllExpressions()
//         : {},
//     };

//     AppState.program_banks.set(bank_id, controllerState);

//     // Tell each synth to save its own resolved parameter values
//     NetworkManager.peers.forEach((peer, _id) => {
//       if (peer.command_channel && peer.command_channel.readyState === "open") {
//         peer.command_channel.send(
//           JSON.stringify({
//             type: "save_to_bank",
//             bank_id: bank_id,
//           }),
//         );
//       }
//     });

//     this.saveBanksToStorage();
//     UIManager.updateBankDisplay();
//     log(`Saved program to bank ${bank_id}`);
//   },

//   loadFromBank(bank_id) {
//     log(`Loading from bank ${bank_id}...`, "lifecycle");
//     if (!AppState.program_banks.has(bank_id)) {
//       log(`Bank ${bank_id} not found`, "error");
//       return false;
//     }

//     const saved_state = AppState.program_banks.get(bank_id);
//     if (!saved_state) {
//       log(`Bank ${bank_id} has no data`, "error");
//       return false;
//     }

//     // Restore UI parameter values
//     UIManager.param_ids.forEach((_id) => {
//       if (saved_state[_id] !== undefined) {
//         const element = UIManager.param_elements[_id];
//         if (element && element.input) {
//           element.input.value = saved_state[_id];
//           UIManager.updateDisplayValue(_id, saved_state[_id]);
//         }
//       }
//     });

//     // Restore harmonic selections
//     if (saved_state.harmonicSelections) {
//       for (const key in saved_state.harmonicSelections) {
//         if (
//           AppState.harmonicSelections[key] &&
//           Array.isArray(saved_state.harmonicSelections[key])
//         ) {
//           AppState.harmonicSelections[key].clear();
//           saved_state.harmonicSelections[key].forEach((value) => {
//             AppState.harmonicSelections[key].add(value);
//           });
//         }
//       }
//     }

//     // Restore chord and expressions
//     if (saved_state.chordNotes && Array.isArray(saved_state.chordNotes)) {
//       window.currentChord = [...saved_state.chordNotes];
//       if (window.svgExpression) {
//         window.svgExpression.setChordNotes(window.currentChord);
//         if (saved_state.expressions) {
//           window.svgExpression.setMultipleExpressions(saved_state.expressions);
//         }
//       }
//     }

//     AppState.current_program = saved_state;
//     window.current_program = saved_state; // Keep window version in sync

//     // Tell each synth to load its own saved values (or generate new ones if it's new)
//     NetworkManager.peers.forEach((peer, _id) => {
//       if (peer.command_channel && peer.command_channel.readyState === "open") {
//         peer.command_channel.send(
//           JSON.stringify({
//             type: "load_from_bank",
//             bank_id: bank_id,
//           }),
//         );
//       }
//     });

//     log(`Loaded program from bank ${bank_id}`);
//     return true;
//   },

//   createExampleProgram() {
//     return {
//       stringMaterial: { type: "choice", options: [0, 1, 2, 3] },
//       stringDamping: { type: "uniform", min: 0.3, max: 0.7 },
//       bowPosition: { type: "uniform", min: 0.08, max: 0.25 },
//       bowSpeed: { type: "normal", mean: 0.6, std: 0.1 },
//       bowForce: { type: "uniform", min: 0.3, max: 0.8 },
//       brightness: { type: "uniform", min: 0.2, max: 0.8 },
//       vibratoRate: { type: "uniform", min: 4.0, max: 7.0 },
//       vibratoDepth: { type: "uniform", min: 0.0, max: 0.3 },
//       bodyType: { type: "choice", options: [0, 1, 2] },
//       bodyResonance: { type: "uniform", min: 0.1, max: 0.9 },
//       masterGain: { type: "uniform", min: 0.4, max: 0.8 },
//     };
//   },
// };

// // Legacy wrappers for backward compatibility
// function _loadBanksFromStorage() {
//   ProgramManager.loadBanksFromStorage();
// }

// function _saveBanksToStorage() {
//   ProgramManager.saveBanksToStorage();
// }

// // WebRTC configuration
// const rtc_config = {
//   iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
// };

// // Fetch ICE servers from server
// async function fetch_ice_servers() {
//   try {
//     const response = await fetch("/ice-servers");
//     const data = await response.json();
//     rtc_config.iceServers = data.ice_servers;
//     log(
//       `ICE servers loaded: ${JSON.stringify(rtc_config.iceServers)}`,
//       "connections",
//     );
//   } catch (error) {
//     log(`Failed to fetch ICE servers, using defaults: ${error}`, "error");
//     // Fall back to default STUN servers
//     rtc_config.iceServers = [
//       { urls: "stun:stun.l.google.com:19302" },
//       { urls: "stun:stun1.l.google.com:19302" },
//     ];
//     log(
//       `Using default ICE servers: ${JSON.stringify(rtc_config.iceServers)}`,
//       "connections",
//     );
//   }
// }

// // UI Manager Object
// const UIManager = {
//   status_el: document.getElementById("status"),
//   synth_list_el: document.getElementById("synth_list"),
//   connected_count_el: document.getElementById("connected_count"),
//   avg_latency_el: document.getElementById("avg_latency"),
//   param_elements: {},
//   param_ids: [
//     "stringMaterial",
//     "stringDamping",
//     "bowPosition",
//     "bowSpeed",
//     "bowForce",
//     "brightness",
//     "vibratoRate",
//     "trillSpeed",
//     "trillArticulation",
//     "tremoloSpeed",
//     "tremoloArticulation",
//     "bodyType",
//     "bodyResonance",
//     "masterGain",
//     "volume",
//     "transitionDuration",
//     "transitionSpread",
//     "transitionStagger",
//     "transitionVariance",
//   ],
//   // expression_radios and expression_groups will be queried within methods or init

//   // Initialize UIManager and populate param_elements
//   initialize() {
//     // Initialize param_elements object
//     this.param_ids.forEach((id) => {
//       const input = document.getElementById(id);
//       const display = document.getElementById(id + "_display");
//       if (input) {
//         this.param_elements[id] = {
//           input: input,
//           display: display,
//         };
//       }
//     });
//     log(
//       `UIManager initialized with ${Object.keys(this.param_elements).length} parameter elements`,
//       "debug",
//     );

//     // Sub-components will be initialized separately to avoid duplication
//   },

//   // Update display value for a parameter
//   updateDisplayValue(id, value) {
//     const element = this.param_elements[id];
//     if (element && element.display) {
//       element.display.textContent = value;
//     }
//   },

//   // Placeholder for other UI methods that will be moved
// };

// // Original param_ids, expression_radios, expression_groups might still be used by non-UIManager functions temporarily.
// // We will clean this up as we move functions into UIManager.
// const param_ids = [
//   "stringMaterial",
//   "stringDamping",
//   "bowPosition",
//   "bowSpeed",
//   "bowForce",
//   "brightness",
//   "vibratoRate",
//   "trillSpeed",
//   "trillArticulation",
//   "tremoloSpeed",
//   "tremoloArticulation",
//   "bodyType",
//   "bodyResonance",
//   "masterGain",
//   "volume",
//   "transitionDuration",
//   "transitionSpread",
//   "transitionStagger",
//   "transitionVariance",
// ];
// const expression_radios = document.querySelectorAll('input[name="expression"]');
// const _expression_groups = document.querySelectorAll(".expression-group");

// // Legacy WebSocket wrapper - now points to NetworkManager
// function _connect_websocket() {
//   NetworkManager.connect();
// }

// // Network Management Module
// const NetworkManager = {
//   ws: null,
//   peers: new Map(),
//   heartbeat_interval: null,

//   // WebSocket functions
//   sendMessage(message) {
//     if (this.ws && this.ws.readyState === WebSocket.OPEN) {
//       this.ws.send(JSON.stringify(message));
//     } else {
//       log(
//         `Cannot send message - WebSocket not open: ${this.ws?.readyState}`,
//         "error",
//       );
//     }
//   },

//   connect() {
//     // Check if modular system is active - don't create legacy connection
//     if (window.__modularSystemActive) {
//       console.log(
//         "[LEGACY-NETWORK] Modular system active, skipping legacy WebSocket connection",
//       );
//       return;
//     }

//     if (window.webSocketManager || window.webRTCManager) {
//       console.log(
//         "[LEGACY-NETWORK] Modular managers detected, skipping legacy WebSocket connection",
//       );
//       return;
//     }

//     const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
//     const ws_url = `${protocol}//${window.location.host}/`;

//     this.ws = new WebSocket(ws_url);

//     this.ws.addEventListener("open", () => {
//       log("WebSocket connected", "connections");
//       UIManager.status_el.textContent = "Connected";
//       UIManager.status_el.classList.add("connected");

//       this.sendMessage({
//         type: "register",
//         client_id: controller_id,
//         client_type: "controller",
//       });

//       this.heartbeat_interval = setInterval(() => {
//         this.sendMessage({ type: "heartbeat" });
//       }, 20000);
//     });

//     // Only add message handler if modular system isn't active
//     if (!window.__modularSystemActive && !window.webSocketManager) {
//       this.ws.addEventListener("message", async (event) => {
//         const message = JSON.parse(event.data);
//         await this.handleMessage(message);
//       });
//     } else {
//       console.log(
//         "[LEGACY-NETWORK] Skipping legacy message handler - modular system is active",
//       );
//     }

//     this.ws.addEventListener("close", () => {
//       log("WebSocket disconnected", "connections");
//       UIManager.status_el.textContent = "Disconnected";
//       UIManager.status_el.classList.remove("connected");
//       if (this.heartbeat_interval) {
//         clearInterval(this.heartbeat_interval);
//         this.heartbeat_interval = null;
//       }
//       setTimeout(() => this.connect(), 3000);
//     });

//     this.ws.addEventListener("error", (error) => {
//       log(`WebSocket error: ${error}`, "error");
//     });
//   },

//   async handleMessage(message) {
//     switch (message.type) {
//       case "controllers-list": {
//         // Handle controller list (not needed for this client)
//         break;
//       }
//       case "controller-joined":
//         other_controllers.add(message.controller_id);
//         UIManager.updateControllerWarning();
//         break;
//       case "controller-left":
//         other_controllers.delete(message.controller_id);
//         UIManager.updateControllerWarning();
//         break;
//       case "announce":
//         other_controllers.add(message.sender_id);
//         UIManager.updateControllerWarning();
//         break;
//       case "kicked":
//         _kicked = true;
//         UIManager.status_el.textContent = `Kicked by ${message.kicked_by}`;
//         UIManager.status_el.classList.remove("connected");
//         break;
//       case "offer":
//         await this.handleOffer(message);
//         break;
//       case "answer":
//         this.handleAnswer(message);
//         break;
//       case "ice":
//         await this.handleIceCandidate(message);
//         break;
//       case "active_controllers":
//         other_controllers.clear();
//         const controllers = message.data || message.controllers || [];
//         controllers
//           .filter((id) => id !== controller_id)
//           .forEach((id) => other_controllers.add(id));
//         UIManager.updateControllerWarning();
//         break;
//     }
//   },

//   async handleOffer(message) {
//     const synth_id = message.source;
//     // Processing WebRTC offer

//     const peerData = {
//       latency: null,
//       state: null,
//     };
//     this.peers.set(synth_id, peerData);

//     const pc = this.createAndConfigurePeerConnection(
//       synth_id,
//       rtc_config,
//       peerData,
//     );
//     await this.completeOfferAnswerExchange(pc, synth_id, message.data);
//   },

//   handleAnswer(_message) {
//     log("Received unexpected answer message", "error");
//   },

//   createAndConfigurePeerConnection(synth_id, rtc_config_param, peerData) {
//     const pc = new RTCPeerConnection(rtc_config_param);
//     peerData.connection = pc;

//     pc.addEventListener("icecandidate", (event) => {
//       if (event.candidate) {
//         this.sendMessage({
//           type: "ice",
//           source: controller_id,
//           target: synth_id,
//           data: event.candidate,
//         });
//       }
//     });

//     pc.addEventListener("datachannel", (event) => {
//       this.handleDataChannelEvent(event, synth_id, peerData);
//     });

//     return pc;
//   },

//   handleDataChannelEvent(event, synth_id, peerData) {
//     const channel = event.channel;
//     if (channel.label === "params") {
//       this.setupParamChannel(channel, synth_id, peerData);
//     } else if (channel.label === "commands") {
//       this.setupCommandChannel(channel, synth_id, peerData);
//     }
//   },

//   setupParamChannel(channel, synth_id, peerData) {
//     peerData.param_channel = channel;
//     channel.addEventListener("open", () =>
//       this.onParamChannelOpen(channel, synth_id, peerData),
//     );
//     channel.addEventListener("message", (event) =>
//       this.handleParamChannelMessage(event, synth_id, peerData),
//     );
//     channel.addEventListener("close", () => {
//       log(`Param channel closed to ${synth_id}`, "connections");
//       UIManager.updateSynthList();
//     });
//   },

//   setupCommandChannel(channel, synth_id, peerData) {
//     peerData.command_channel = channel;
//     channel.addEventListener("open", () => {
//       log(`Command channel open to ${synth_id}`, "connections");
//       UIManager.updateSynthList();
//     });
//     channel.addEventListener("close", () => {
//       log(`Command channel closed to ${synth_id}`, "connections");
//       UIManager.updateSynthList();
//     });
//   },

//   onParamChannelOpen(channel, synth_id, peerData) {
//     log(`Param channel open to ${synth_id}`, "connections");
//     UIManager.updateSynthList();

//     log(`Auto-sending program to newly connected ${synth_id}`, "messages");
//     const assignment = assignNoteToSynth(synth_id);

//     if (assignment) {
//       channel.send(
//         JSON.stringify({
//           type: "program",
//           program: assignment.program,
//           transition: assignment.transition,
//         }),
//       );
//     } else if (
//       window.current_program &&
//       Object.keys(window.current_program).length > 0
//     ) {
//       channel.send(
//         JSON.stringify({ type: "program", program: window.current_program }),
//       );
//     }
//   },

//   handleParamChannelMessage(event, synth_id, peerData) {
//     const data = JSON.parse(event.data);
//     if (data.type === "pong") {
//       peerData.latency = Date.now() - data.timestamp;
//       peerData.state = data.state || null;
//       log(
//         `Received pong from ${synth_id} with state: ${JSON.stringify(data.state)}`,
//         "performance",
//       );
//       UIManager.updateSynthList();
//     } else if (data.type === "request_program") {
//       log(`Received program request from ${synth_id}`, "messages");
//       const assignment = assignNoteToSynth(synth_id);
//       const channel = peerData.param_channel;

//       if (assignment) {
//         channel.send(
//           JSON.stringify({
//             type: "program",
//             program: assignment.program,
//             transition: assignment.transition,
//           }),
//         );
//       } else if (
//         window.current_program &&
//         Object.keys(window.current_program).length > 0
//       ) {
//         const transition = calculateTransitionTiming(window.current_program, 0);
//         channel.send(
//           JSON.stringify({
//             type: "program",
//             program: window.current_program,
//             transition: transition,
//           }),
//         );
//       }
//     }
//   },

//   async completeOfferAnswerExchange(pc, synth_id, offerData) {
//     try {
//       await pc.setRemoteDescription(offerData);
//       const answer = await pc.createAnswer();
//       await pc.setLocalDescription(answer);

//       this.sendMessage({
//         type: "answer",
//         source: controller_id,
//         target: synth_id,
//         data: answer,
//       });

//       log(`[CTRL] Sent answer to ${synth_id}`);
//     } catch (error) {
//       log(`Error in offer-answer exchange with ${synth_id}: ${error}`, "error");
//     }
//   },

//   async handleIceCandidate(message) {
//     const synth_id = message.source;
//     const peerData = this.peers.get(synth_id);

//     if (peerData && peerData.connection) {
//       try {
//         await peerData.connection.addIceCandidate(message.data);
//       } catch (error) {
//         log(`Error adding ICE candidate from ${synth_id}: ${error}`, "error");
//       }
//     }
//   },
// };

// // Expression and Chord Management Module
// const ExpressionManager = {
//   // Select frequency and update chord
//   selectFrequency(freq) {
//     const noteData = UIManager.frequencyToNote(freq);
//     const noteName = `${noteData.note}${noteData.octave}`;
//     log(`Piano key clicked: ${noteName} (${freq}Hz)`);
//     log(`Current chord: ${window.currentChord.join(", ")}`, "expressions");

//     const chordDisplay = document.getElementById("chord-display");
//     if (chordDisplay && window.svgExpression) {
//       if (window.currentChord.length > 0) {
//         const _expressions = window.svgExpression.getAllExpressions();
//         const chordParts = [];
//         const actualChordNotes = window.currentChord.filter((_note) => {
//           return true;
//         });
//         actualChordNotes.forEach((_note) => {
//           // existing display logic
//         });
//         chordDisplay.textContent = chordParts.join(" ");
//       } else {
//         chordDisplay.textContent = "None";
//       }
//     }

//     if (window.svgExpression) {
//       log("[CTRL] Updating SVG expression system with chord notes");
//       window.svgExpression.setChordNotes(window.currentChord);
//       setTimeout(() => {
//         if (window.svgExpression) window.svgExpression.render();
//       }, 10);
//     } else {
//       log(
//         "Warning: svgExpression not initialized yet - will update when ready",
//         "warn",
//       );
//       window.pendingChordUpdate = window.currentChord;
//     }
//     UIManager.updateExpressionDisplay();
//   },

//   // Clear all chord and expression data
//   clearChord() {
//     if (window.svgExpression) {
//       window.svgExpression.clearAll();
//       window.currentChord = [];
//       document.getElementById("chord-display").textContent = "None";
//       UIManager.updateExpressionDisplay();
//       UIManager.updateExpressionGroups();

//       mark_parameter_changed("chord");
//       UIManager.checkOverallStatus();
//     }
//   },

//   // Assign note to synth for program distribution
//   assignNoteToSynth(synthId) {
//     const chordState =
//       AppState.current_chord_state || window.current_chord_state;
//     if (!chordState || chordState.chord.length === 0) {
//       log(
//         `No chord state available for ${synthId} - cannot assign note`,
//         "expressions",
//       );
//       return null;
//     }

//     const assignedNote =
//       chordState.chord[Math.floor(Math.random() * chordState.chord.length)];
//     const synthProgram = { ...chordState.baseProgram };
//     // Assigned note for synth

//     // Set frequency for assigned note
//     const frequency = note_to_frequency(
//       assignedNote.slice(0, -1),
//       parseInt(assignedNote.slice(-1)),
//     );
//     synthProgram.fundamentalFrequency = frequency;

//     // Apply expressions if available
//     const expressions = window.svgExpression
//       ? window.svgExpression.getAllExpressions()
//       : {};
//     const assignedExpression = expressions[assignedNote] || { type: "none" };

//     // Apply expression parameters
//     switch (assignedExpression.type) {
//       case "vibrato": {
//         synthProgram.vibratoEnabled = true;
//         const vibratoRatio = UtilityManager.getRandomHarmonicRatio("vibrato");
//         synthProgram.vibratoRate =
//           (synthProgram.vibratoRate || 4) * vibratoRatio;
//         synthProgram.vibratoDepth = assignedExpression.depth || 0.01;
//         break;
//       }
//       case "tremolo": {
//         synthProgram.tremoloEnabled = true;
//         const tremoloRatio = UtilityManager.getRandomHarmonicRatio("tremolo");
//         synthProgram.tremoloSpeed =
//           (synthProgram.tremoloSpeed || 10) * tremoloRatio;
//         synthProgram.tremoloDepth = assignedExpression.depth || 0.3;
//         synthProgram.tremoloArticulation =
//           synthProgram.tremoloArticulation || 0.8;
//         break;
//       }
//       case "trill": {
//         synthProgram.trillEnabled = true;
//         const trillRatio = UtilityManager.getRandomHarmonicRatio("trill");
//         synthProgram.trillSpeed = (synthProgram.trillSpeed || 8) * trillRatio;
//         synthProgram.trillInterval = assignedExpression.interval || 2;
//         synthProgram.trillArticulation = synthProgram.trillArticulation || 0.7;
//         break;
//       }
//       default: {
//         synthProgram.vibratoEnabled = false;
//         synthProgram.tremoloEnabled = false;
//         synthProgram.trillEnabled = false;
//         break;
//       }
//     }

//     return {
//       program: synthProgram,
//       metadata: {
//         baseNote: assignedNote,
//         frequency: frequency,
//         expression: assignedExpression.type,
//       },
//       transition: UtilityManager.calculateTransitionTiming(synthProgram, 0),
//     };
//   },
// };

// // Utility Management Module
// const UtilityManager = {
//   // Audio utility functions
//   noteToFrequency(note, octave) {
//     const notes = [
//       "C",
//       "C#",
//       "D",
//       "D#",
//       "E",
//       "F",
//       "F#",
//       "G",
//       "G#",
//       "A",
//       "A#",
//       "B",
//     ];
//     const note_index = notes.indexOf(note);
//     const semitones_from_a4 = (octave - 4) * 12 + (note_index - 9);
//     return 440 * Math.pow(2, semitones_from_a4 / 12);
//   },

//   frequencyToNote(freq) {
//     const semitones_from_a4 = Math.round(12 * Math.log2(freq / 440));
//     const total_semitones = semitones_from_a4 + 4 * 12 + 9;
//     const octave = Math.floor(total_semitones / 12);
//     const note_index = ((total_semitones % 12) + 12) % 12;
//     const notes = [
//       "C",
//       "C#",
//       "D",
//       "D#",
//       "E",
//       "F",
//       "F#",
//       "G",
//       "G#",
//       "A",
//       "A#",
//       "B",
//     ];
//     return { note: notes[note_index], octave: octave };
//   },

//   // Get random harmonic ratio from selections
//   getRandomHarmonicRatio(expression) {
//     const numeratorKey = `${expression}-numerator`;
//     const denominatorKey = `${expression}-denominator`;

//     const numerators = Array.from(AppState.harmonicSelections[numeratorKey]);
//     const denominators = Array.from(
//       AppState.harmonicSelections[denominatorKey],
//     );

//     if (numerators.length === 0 || denominators.length === 0) {
//       return 1.0;
//     }

//     const randomNumerator =
//       numerators[Math.floor(Math.random() * numerators.length)];
//     const randomDenominator =
//       denominators[Math.floor(Math.random() * denominators.length)];

//     return randomNumerator / randomDenominator;
//   },

//   // Calculate transition timing based on settings
//   calculateTransitionTiming(program, synthIndex = 0) {
//     const transitionDuration = parseFloat(program.transitionDuration || 1.0);
//     const spread = parseFloat(program.transitionSpread || 20) / 100;
//     const variance = parseFloat(program.transitionVariance || 10) / 100;
//     const stagger = program.transitionStagger || "sync";

//     let lag = 0;
//     if (stagger === "cascade") {
//       lag = synthIndex * transitionDuration * spread * 0.3;
//     } else if (stagger === "random") {
//       lag = Math.random() * transitionDuration * spread;
//     }

//     const jitter = (Math.random() - 0.5) * variance * transitionDuration;
//     return { delay: Math.max(0, lag + jitter) };
//   },
// };

// // Legacy globals - now managed by NetworkManager
// const peers = NetworkManager.peers; // Alias for backward compatibility

// // Legacy wrapper for backward compatibility
// function send_message(message) {
//   NetworkManager.sendMessage(message);
// }

// // Legacy wrapper - now routes to NetworkManager
// async function _handle_message(message) {
//   await NetworkManager.handleMessage(message);
// }

// // --- handle_offer refactoring helpers ---

// function _createAndConfigurePeerConnection(
//   synth_id,
//   rtc_config_param,
//   peerData,
// ) {
//   const pc = new RTCPeerConnection(rtc_config_param);
//   peerData.connection = pc;

//   pc.addEventListener("icecandidate", (event) => {
//     if (event.candidate) {
//       send_message({
//         type: "ice",
//         source: controller_id, // controller_id should be accessible in this scope
//         target: synth_id,
//         data: event.candidate,
//       });
//     }
//   });
//   return pc;
// }

// function _onParamChannelOpen(channel, synth_id, peerData) {
//   log(`Param channel open to ${synth_id}`, "connections");
//   UIManager.updateSynthList();

//   log(`Auto-sending program to newly connected ${synth_id}`, "messages");
//   const assignment = assignNoteToSynth(synth_id); // assignNoteToSynth needs to be defined/accessible

//   if (assignment) {
//     channel.send(
//       JSON.stringify({
//         type: "program",
//         program: assignment.program,
//         transition: calculateTransitionTiming(assignment.program, 0), // calculateTransitionTiming needs to be accessible
//       }),
//     );
//     channel.send(
//       JSON.stringify({
//         type: "setTransitionConfig",
//         config: {
//           duration: parseFloat(assignment.program.transitionDuration || 1.0),
//           spread: parseFloat(assignment.program.transitionSpread || 20) / 100,
//           stagger: assignment.program.transitionStagger || "sync",
//           variance:
//             parseFloat(assignment.program.transitionVariance || 10) / 100,
//         },
//       }),
//     );
//     log(
//       `Sent requested program to ${synth_id}: ${assignment.note} (${assignment.frequency.toFixed(1)}Hz, ${assignment.expression}) with transition timing`,
//       "messages",
//     );
//   } else if (
//     window.current_program &&
//     Object.keys(window.current_program).length > 0
//   ) {
//     // Use window.current_program
//     channel.send(
//       JSON.stringify({ type: "program", program: window.current_program }),
//     );
//     log(
//       `Automatically sent stored program to newly connected ${synth_id} (no chord active)`,
//       "messages",
//     );
//   } else {
//     const default_program = get_current_program(); // get_current_program needs to be accessible
//     if (default_program && Object.keys(default_program).length > 0) {
//       const transition = calculateTransitionTiming(default_program, 0);
//       channel.send(
//         JSON.stringify({
//           type: "program",
//           program: default_program,
//           transition: transition,
//         }),
//       );
//       log(
//         `Automatically sent default UI program to newly connected ${synth_id}`,
//         "messages",
//       );
//     } else {
//       log(
//         `No program available to send to newly connected ${synth_id}`,
//         "error",
//       );
//     }
//   }

//   const ping_interval = setInterval(() => {
//     if (channel.readyState === "open") {
//       const timestamp = Date.now();
//       peerData.last_ping = timestamp;
//       channel.send(JSON.stringify({ type: "ping", timestamp: timestamp }));
//     } else {
//       clearInterval(ping_interval);
//     }
//   }, 1000);
// }

// function _handleParamChannelMessage(event, synth_id, peerData) {
//   const data = JSON.parse(event.data);
//   if (data.type === "pong") {
//     peerData.latency = Date.now() - data.timestamp;
//     peerData.state = data.state || null;
//     log(
//       `Received pong from ${synth_id} with state: ${JSON.stringify(data.state)}`,
//       "performance",
//     );
//     UIManager.updateSynthList();
//   } else if (data.type === "request_program") {
//     log(`Received program request from ${synth_id}`, "messages");
//     const assignment = assignNoteToSynth(synth_id);
//     const channel = peerData.param_channel; // Get channel from peerData

//     if (assignment) {
//       channel.send(
//         JSON.stringify({
//           type: "program",
//           program: assignment.program,
//           transition: calculateTransitionTiming(assignment.program, 0),
//         }),
//       );
//       channel.send(
//         JSON.stringify({
//           type: "setTransitionConfig",
//           config: {
//             duration: parseFloat(assignment.program.transitionDuration || 1.0),
//             spread: parseFloat(assignment.program.transitionSpread || 20) / 100,
//             stagger: assignment.program.transitionStagger || "sync",
//             variance:
//               parseFloat(assignment.program.transitionVariance || 10) / 100,
//           },
//         }),
//       );
//       log(
//         `Sent chord-based program to requesting ${synth_id}: ${assignment.note} (${assignment.frequency.toFixed(1)}Hz, ${assignment.expression})`,
//         "messages",
//       );
//     } else if (
//       window.current_program &&
//       Object.keys(window.current_program).length > 0
//     ) {
//       const transition = calculateTransitionTiming(window.current_program, 0);
//       channel.send(
//         JSON.stringify({
//           type: "program",
//           program: window.current_program,
//           transition: transition,
//         }),
//       );
//       log(
//         `Sent stored program to requesting ${synth_id} (no chord active)`,
//         "messages",
//       );
//     } else {
//       log(
//         `No stored program for ${synth_id} - creating default from UI`,
//         "messages",
//       );
//       const default_program = get_current_program();
//       channel.send(
//         JSON.stringify({ type: "program", program: default_program }),
//       );
//       log(`Sent default UI program to ${synth_id}`, "messages");
//     }
//   }
// }

// // Legacy wrapper
// function _setupParamChannel(channel, synth_id, peerData) {
//   NetworkManager.setupParamChannel(channel, synth_id, peerData);
// }

// // Legacy wrapper
// function _setupCommandChannel(channel, synth_id, peerData) {
//   NetworkManager.setupCommandChannel(channel, synth_id, peerData);
// }

// // Legacy wrapper
// function _handleDataChannelEvent(event, synth_id, peerData) {
//   NetworkManager.handleDataChannelEvent(event, synth_id, peerData);
// }

// async function _completeOfferAnswerExchange(pc, synth_id, offerSdp) {
//   await pc.setRemoteDescription(offerSdp);
//   const answer = await pc.createAnswer();
//   await pc.setLocalDescription(answer);

//   send_message({
//     // send_message needs to be accessible
//     type: "answer",
//     source: controller_id, // controller_id needs to be accessible
//     target: synth_id,
//     data: answer,
//   });
// }

// // --- Refactored handle_offer ---
// async function handle_offer(message) {
//   const synth_id = message.source;
//   log(`Received offer from ${synth_id}`, "connections");

//   const peerData = {
//     connection: null,
//     param_channel: null,
//     command_channel: null,
//     latency: null,
//     last_ping: null,
//     state: null,
//   };
//   peers.set(synth_id, peerData); // 'peers' should be the global Map

//   const pc = _createAndConfigurePeerConnection(synth_id, rtc_config, peerData); // rtc_config should be accessible
//   pc.ondatachannel = (event) =>
//     _handleDataChannelEvent(event, synth_id, peerData);

//   await _completeOfferAnswerExchange(pc, synth_id, message.data);
// }

// // Legacy wrapper
// async function _handle_offer(message) {
//   await NetworkManager.handleOffer(message);
// }

// // Legacy wrapper
// function _handle_answer(_message) {
//   NetworkManager.handleAnswer(_message);
// }

// async function _handle_ice_candidate(message) {
//   const synth_id = message.source;
//   const peer = peers.get(synth_id);

//   if (peer && peer.connection) {
//     await peer.connection.addIceCandidate(message.data);
//   }
// }

// UIManager.updateSynthList = function () {
//   const synth_entries = Array.from(NetworkManager.peers.entries());
//   this.connected_count_el.textContent = synth_entries
//     .filter(
//       ([id, peer]) =>
//         peer.param_channel && peer.param_channel.readyState === "open",
//     )
//     .length.toString();

//   if (synth_entries.length === 0) {
//     this.synth_list_el.innerHTML = "None connected";
//   } else {
//     this.synth_list_el.innerHTML = synth_entries
//       .map(([id, peer]) => {
//         const param_state = peer.param_channel
//           ? peer.param_channel.readyState
//           : "closed";
//         const command_state = peer.command_channel
//           ? peer.command_channel.readyState
//           : "closed";
//         const connection_state =
//           param_state === "open" && command_state === "open"
//             ? "connected"
//             : param_state === "connecting" || command_state === "connecting"
//               ? "connecting"
//               : "disconnected";

//         const latency_text =
//           peer.latency !== null
//             ? `<span class="latency">${peer.latency}ms</span>`
//             : "";

//         // Build detailed state information
//         let state_details = "";
//         if (peer.state) {
//           const audio_status = peer.state.audio_enabled
//             ? "running"
//             : "disabled";
//           const synthesis_status = peer.state.joined ? "joined" : "calibrating";

//           state_details = `
//                 <div class="synth-details">
//                     <span class="audio-state">Audio: ${audio_status}</span>
//                     <span class="synthesis-state">Synth: ${synthesis_status}</span>
//                 </div>`;
//         }

//         return `<div class="synth ${connection_state}">
//             <div class="synth-header">${id} [${connection_state}] ${latency_text}</div>
//             ${state_details}
//         </div>`;
//       })
//       .join("");
//   }

//   // Update average latency
//   const latencies = synth_entries
//     .map(([id, peer]) => peer.latency)
//     .filter((l) => l !== null);
//   if (latencies.length > 0) {
//     const avg = Math.round(
//       latencies.reduce((a, b) => a + b, 0) / latencies.length,
//     );
//     this.avg_latency_el.textContent = `${avg}ms`;
//   } else {
//     this.avg_latency_el.textContent = "-";
//   }
// };

// // Legacy wrapper for UtilityManager
// function getRandomHarmonicRatio(expression) {
//   return UtilityManager.getRandomHarmonicRatio(expression);
// }

// // Legacy wrapper for ExpressionManager
// function assignNoteToSynth(synthId) {
//   return ExpressionManager.assignNoteToSynth(synthId);
// }

// // Helper function to calculate transition timing based on settings
// // Legacy wrapper for UtilityManager
// function calculateTransitionTiming(program, synthIndex = 0) {
//   return UtilityManager.calculateTransitionTiming(program, synthIndex);
// }

// // --- distributeActiveParts refactoring helpers ---

// function _getAvailableSynthEntries(peersMap) {
//   return Array.from(peersMap.entries()).filter(
//     ([_id, peer]) =>
//       peer.param_channel && peer.param_channel.readyState === "open",
//   );
// }

// function _getCurrentArrangementBaseProgram() {
//   // This function might be more complex if get_current_program needs specific context
//   // For now, it's a direct call.
//   return get_current_program(); // Ensure get_current_program is accessible
// }

// function _getDistributablePartsAndExpressions(
//   selectedPartIdentifiers,
//   svgExprInstance,
// ) {
//   const allExpressions = svgExprInstance
//     ? svgExprInstance.getAllExpressions()
//     : {};
//   // Use window.log if log is not directly in scope or pass it as an argument.
//   // Assuming log is a global function here for brevity.
//   log(
//     "🎭 All expressions from SVG system:" +
//       JSON.stringify(allExpressions).substring(0, 200),
//   );
//   log(
//     "🎵 Selected part identifiers for distribution: " +
//       selectedPartIdentifiers.join(", "),
//   );

//   const distributableParts = selectedPartIdentifiers.filter((partId) => {
//     const expr = allExpressions[partId];
//     if (!expr || expr.type === "none") {
//       for (const otherPartId of selectedPartIdentifiers) {
//         if (otherPartId === partId) continue;
//         const otherExpr = allExpressions[otherPartId];
//         if (
//           otherExpr &&
//           otherExpr.type === "trill" &&
//           otherExpr.targetNote === partId
//         ) {
//           return false;
//         }
//       }
//     }
//     return true;
//   });

//   const relevantExpressions = {};
//   distributableParts.forEach((partId) => {
//     if (allExpressions[partId]) {
//       relevantExpressions[partId] = allExpressions[partId];
//     }
//   });
//   return { distributableParts, relevantExpressions };
// }

// function _generateProgramsForDistribution(
//   distributableParts,
//   synthIds,
//   strategy,
//   baseProgram,
//   expressions,
//   chordDistributorInstance,
// ) {
//   const assignments = chordDistributorInstance.distributeChord(
//     { notes: distributableParts }, // chordDistributor still uses 'notes' internally
//     synthIds,
//     {
//       strategy: strategy,
//       stochasticParams: {
//         /* ... your existing params ... */ microDetuning: { enabled: false },
//         octaveDoubling: { enabled: false },
//         harmonicEnrichment: { enabled: false },
//         dynamicVariation: { enabled: false },
//       },
//       expressions: expressions,
//     },
//   );
//   log(
//     "📋 Assignments after distribution: " +
//       JSON.stringify(assignments).substring(0, 200),
//   );

//   return chordDistributorInstance.generatePrograms(
//     assignments,
//     baseProgram,
//     expressions,
//   );
// }

// function _sendProgramToSynth(
//   synthId,
//   peer,
//   programDetails,
//   baseProgramForTiming,
// ) {
//   const { program, metadata } = programDetails;

//   // Apply harmonic ratios
//   if (program.vibratoEnabled === true) {
//     const vibratoRatio = UtilityManager.getRandomHarmonicRatio("vibrato");
//     program.vibratoRate = (program.vibratoRate || 4) * vibratoRatio;
//     log(
//       synthId +
//         " vibrato: " +
//         program.vibratoRate.toFixed(2) +
//         "Hz (" +
//         vibratoRatio.toFixed(2) +
//         "x)",
//     );
//   }
//   if (program.tremoloEnabled === true) {
//     const tremoloRatio = UtilityManager.getRandomHarmonicRatio("tremolo");
//     program.tremoloSpeed = (program.tremoloSpeed || 10) * tremoloRatio;
//     log(
//       synthId +
//         " tremolo: " +
//         program.tremoloSpeed.toFixed(2) +
//         "Hz (" +
//         tremoloRatio.toFixed(2) +
//         "x)",
//     );
//   }
//   if (program.trillEnabled === true) {
//     const trillRatio = UtilityManager.getRandomHarmonicRatio("trill");
//     program.trillSpeed = (program.trillSpeed || 8) * trillRatio;
//     log(
//       synthId +
//         " trill: " +
//         program.trillSpeed.toFixed(2) +
//         "Hz (" +
//         trillRatio.toFixed(2) +
//         "x), interval=" +
//         program.trillInterval,
//     );
//   }

//   const synthIndex = Array.from(NetworkManager.peers.keys()).indexOf(synthId);
//   const transition = UtilityManager.calculateTransitionTiming(
//     program,
//     synthIndex,
//   );

//   peer.param_channel.send(
//     JSON.stringify({
//       type: "program",
//       program: program,
//       transition: transition,
//     }),
//   );

//   peer.param_channel.send(
//     JSON.stringify({
//       type: "setTransitionConfig",
//       config: {
//         duration: parseFloat(
//           program.transitionDuration ||
//             baseProgramForTiming.transitionDuration ||
//             1.0,
//         ),
//         spread:
//           parseFloat(
//             program.transitionSpread ||
//               baseProgramForTiming.transitionSpread ||
//               20,
//           ) / 100,
//         stagger:
//           program.transitionStagger ||
//           baseProgramForTiming.transitionStagger ||
//           "sync",
//         variance:
//           parseFloat(
//             program.transitionVariance ||
//               baseProgramForTiming.transitionVariance ||
//               10,
//           ) / 100,
//       },
//     }),
//   );

//   log(
//     synthId +
//       ": " +
//       metadata.baseNote +
//       " (" +
//       program.fundamentalFrequency.toFixed(1) +
//       "Hz) - " +
//       metadata.expression,
//   );
// }

// // Distribute active parts to connected synths
// function distributeActiveParts() {
//   log("[CTRL] distributeActiveParts called.");

//   if (!window.currentChord || window.currentChord.length === 0) {
//     alert("Please select at least one part");
//     log("[CTRL] distributeActiveParts: No parts selected.");
//     return;
//   }

//   const availableSynthEntries = _getAvailableSynthEntries(NetworkManager.peers);
//   if (availableSynthEntries.length === 0) {
//     alert("No synths connected");
//     log("[CTRL] distributeActiveParts: No synths available.");
//     return;
//   }
//   const availableSynthIds = availableSynthEntries.map(([id, _peer]) => id);

//   log(
//     "[CTRL] Distributing arrangement with parts [" +
//       window.currentChord.join(", ") +
//       "] to " +
//       availableSynthIds.length +
//       " synths",
//   );

//   const baseProgram = _getCurrentArrangementBaseProgram();
//   const { distributableParts, relevantExpressions } =
//     _getDistributablePartsAndExpressions(
//       window.currentChord,
//       window.svgExpression, // Assumes svgExpression is on window
//     );

//   if (distributableParts.length === 0) {
//     log("[CTRL] No actual parts to distribute after processing.", "warn");
//     // Send stop programs to all synths
//     availableSynthEntries.forEach(([synthId, peer]) => {
//       log("[CTRL] Sending stop program to synth: " + synthId);
//       if (
//         peer &&
//         peer.param_channel &&
//         peer.param_channel.readyState === "open"
//       ) {
//         peer.param_channel.send(JSON.stringify({ type: "stop" }));
//       }
//     });
//     window.current_chord_state = null;
//     AppState.current_chord_state = null;
//     return;
//   }
//   log("[CTRL] Actual parts to distribute: " + distributableParts.join(", "));

//   const programsToDistribute = _generateProgramsForDistribution(
//     distributableParts,
//     availableSynthIds,
//     "randomized-balanced",
//     baseProgram,
//     relevantExpressions,
//     window.chordDistributor, // Assumes chordDistributor is on window
//   );

//   let sentCount = 0;
//   if (programsToDistribute && programsToDistribute.length > 0) {
//     programsToDistribute.forEach((programDetails) => {
//       const { synthId } = programDetails;
//       const peer = NetworkManager.peers.get(synthId);
//       _sendProgramToSynth(synthId, peer, programDetails, baseProgram);
//       sentCount++;
//     });
//   } else {
//     log("[CTRL] No programs generated by _generateProgramsForDistribution.");
//   }

//   log(
//     "[CTRL] 🎼 Distributed [" +
//       distributableParts.join(", ") +
//       "] to " +
//       sentCount +
//       " synths.",
//   );

//   window.current_chord_state = {
//     chord: [...distributableParts],
//     baseProgram: { ...baseProgram },
//     strategy: "randomized-balanced",
//     timestamp: Date.now(),
//   };
//   AppState.current_chord_state = window.current_chord_state;
//   log(
//     "[CTRL] 💾 Stored active arrangement state:" +
//       JSON.stringify(AppState.current_chord_state).substring(0, 200),
//   );

//   window.current_program = { ...baseProgram };
//   AppState.current_program = window.current_program;
// }

// // Get current program from UI (excluding frequency and expressions - those are handled by chord distribution)
// function get_current_program() {
//   const program = {};

//   UIManager.param_ids.forEach((id) => {
//     // Use UIManager.param_ids
//     const element = UIManager.param_elements[id]; // Use UIManager.param_elements
//     if (element && element.input) {
//       const value =
//         element.input.type === "range"
//           ? parseFloat(element.input.value)
//           : element.input.value;
//       program[id] = value;
//     }
//   });

//   // Initialize expression parameters to disabled state
//   // These will be overridden during chord distribution if expressions are active
//   program.vibratoEnabled = false;
//   program.tremoloEnabled = false;
//   program.trillEnabled = false;

//   // Include harmonic selections in program state
//   program.harmonicSelections = {};
//   for (const [key, selection] of Object.entries(AppState.harmonicSelections)) {
//     program.harmonicSelections[key] = Array.from(selection);
//   }

//   // Include current chord in program state
//   program.currentChord = window.currentChord.slice(); // Create a copy

//   return program;
// }

// // Create example program with stochastic elements
// // Legacy wrappers for backward compatibility
// function _create_example_program() {
//   return ProgramManager.createExampleProgram();
// }

// function save_to_bank(bank_id) {
//   ProgramManager.saveToBank(bank_id);
// }

// function load_from_bank(bank_id) {
//   return ProgramManager.loadFromBank(bank_id);
// }

// // Update UI display values
// // Temporary global function for compatibility during refactor
// function update_display_value(id, value) {
//   UIManager.updateDisplayValue(id, value);
// }

// UIManager.updateExpressionGroups = function () {
//   const expressionRadio = document.querySelector(
//     'input[name="expression"]:checked',
//   );
//   if (!expressionRadio) {
//     log(
//       "[CTRL] Expression radio buttons not found yet for updateExpressionGroups",
//     ); // Use new log
//     return;
//   }

//   const active_expression = expressionRadio.value;
//   // Query expression_groups inside the method if it's not a stable UIManager property
//   const current_expression_groups =
//     document.querySelectorAll(".expression-group");
//   current_expression_groups.forEach((group) => {
//     group.classList.remove("active");
//   });

//   if (active_expression !== "none") {
//     const active_group = document.querySelector(
//       `.expression-group.${active_expression}`,
//     );
//     if (active_group) {
//       active_group.classList.add("active");
//     }
//   }
// };

// UIManager.updateControllerWarning = function () {
//   const warning_el = document.getElementById("controller_warning");
//   const other_controllers_el = document.getElementById("other_controllers");

//   if (warning_el && other_controllers_el) {
//     // Add checks for elements
//     if (other_controllers.size > 0) {
//       // other_controllers is still global for now
//       warning_el.classList.add("show");
//       other_controllers_el.textContent = `Other controllers: ${Array.from(other_controllers).join(", ")}`;
//     } else {
//       warning_el.classList.remove("show");
//     }
//   } else {
//     log("[CTRL] Controller warning UI elements not found.", "warn");
//   }
// };

// // Event Listeners

// // Parameter input handlers (combined with change tracking)
// param_ids.forEach((id) => {
//   const element = UIManager.param_elements[id];
//   if (element && element.input) {
//     element.input.addEventListener("input", (e) => {
//       const value =
//         e.target.type === "range" ? parseFloat(e.target.value) : e.target.value;
//       update_display_value(id, value);
//       log(`Parameter ${id} changed to ${value}`, "parameters");
//       mark_parameter_changed(id);
//       check_overall_status();
//       // Update current program with new values
//       if (AppState.current_program) {
//         AppState.current_program[id] = value;
//         window.current_program = AppState.current_program; // Keep window version in sync
//       }
//     });
//   }
// });

// // Expression radio handlers (only if they exist)
// if (expression_radios.length > 0) {
//   expression_radios.forEach((radio) => {
//     radio.addEventListener("change", update_expression_groups);
//   });
// }

// // Program control buttons
// document
//   .getElementById("send_current_program")
//   .addEventListener("click", () => {
//     UIManager.updateStatusBadge("sending");
//     distributeActiveParts();
//     UIManager.markAllParametersSent();
//     setTimeout(() => UIManager.updateStatusBadge("synced"), 500);
//   });

// // Banking controls
// document.getElementById("save_bank").addEventListener("click", (e) => {
//   const bank_id = parseInt(document.getElementById("bank_selector").value);
//   save_to_bank(bank_id);

//   // Visual feedback
//   e.target.classList.add("success");
//   e.target.textContent = "✓ Saved";
//   setTimeout(() => {
//     e.target.classList.remove("success");
//     e.target.textContent = "Save";
//   }, 1500);

//   log(`Program saved to Bank ${bank_id}`, "lifecycle");
// });

// document.getElementById("load_bank").addEventListener("click", (e) => {
//   const bank_id = parseInt(document.getElementById("bank_selector").value);
//   const success = load_from_bank(bank_id);

//   if (success) {
//     // Visual feedback
//     e.target.classList.add("success");
//     e.target.textContent = "✓ Loaded";
//     setTimeout(() => {
//       e.target.classList.remove("success");
//       e.target.textContent = "Load";
//     }, 1500);

//     // Update harmonic displays after DOM is ready
//     setTimeout(() => {
//       ["vibrato", "trill", "tremolo"].forEach((expression) => {
//         ["numerator", "denominator"].forEach((type) => {
//           if (typeof updateHarmonicDisplay === "function") {
//             updateHarmonicDisplay(expression, type);
//           }
//         });
//       });
//       if (typeof UIManager.updateExpressionDisplay === "function") {
//         // Check UIManager method
//         UIManager.updateExpressionDisplay();
//       }
//     }, 100);
//   } else {
//     // Error feedback
//     e.target.classList.add("error");
//     e.target.textContent = "✗ Empty";
//     setTimeout(() => {
//       e.target.classList.remove("error");
//       e.target.textContent = "Load";
//     }, 1500);
//   }
// });

// // Power control
// document.getElementById("power").addEventListener("change", (e) => {
//   const is_on = e.target.checked;
//   peers.forEach((peer, id) => {
//     if (peer.command_channel && peer.command_channel.readyState === "open") {
//       peer.command_channel.send(
//         JSON.stringify({
//           type: "command",
//           name: "power",
//           value: is_on,
//         }),
//       );
//     }
//   });
// });

// // Kick other controllers
// document.getElementById("kick_others").addEventListener("click", () => {
//   send_message({
//     type: "kick-other-controllers",
//   });
//   other_controllers.clear();
//   UIManager.updateControllerWarning();
// });

// // This function will be moved into UIManager.initialize or called by it.
// // For now, define its new UIManager version.
// UIManager.initializeActualUI = function () {
//   // Set initial display values using UIManager's param_elements
//   param_ids.forEach((id) => {
//     const element = this.param_elements[id];
//     if (element && element.input) {
//       const value =
//         element.input.type === "range"
//           ? parseFloat(element.input.value)
//           : element.input.value;
//       this.updateDisplayValue(id, value);
//     }
//   });
// };

// // Legacy wrappers - now use UtilityManager methods
// function note_to_frequency(note, octave) {
//   return UtilityManager.noteToFrequency(note, octave);
// }

// function _frequency_to_note(freq) {
//   return UtilityManager.frequencyToNote(freq);
// }

// UIManager.calculateRanges = function () {
//   // Now a UIManager method
//   // Uses UIManager.noteToFrequency if that also becomes a UIManager method, or global if not.
//   // For now, assuming note_to_frequency is still global or will be part of UIManager.
//   return {
//     0: {
//       name: "Violin",
//       low: note_to_frequency("G", 3), // Assuming note_to_frequency will be accessible
//       high: note_to_frequency("A", 7),
//     },
//     1: {
//       name: "Viola",
//       low: note_to_frequency("C", 3),
//       high: note_to_frequency("E", 6),
//     },
//     2: {
//       name: "Cello",
//       low: note_to_frequency("C", 2),
//       high: note_to_frequency("C", 6),
//     },
//     3: {
//       name: "Guitar",
//       low: note_to_frequency("E", 3),
//       high: note_to_frequency("E", 6),
//     },
//     4: {
//       name: "None",
//       low: note_to_frequency("A", 1),
//       high: note_to_frequency("C", 8),
//     },
//   };
// };

// // instrument_ranges will be a property of UIManager, initialized by its init method.
// // UIManager.instrument_ranges = UIManager.calculateRanges(); // This call will be done in UIManager.initialize

// // These note/freq utilities can become static methods of UIManager or standalone utils.
// // For now, prefixing with UIManager assuming they will be moved in.
// UIManager.noteToFrequency = function (note, octave) {
//   const notes = [
//     "C",
//     "C#",
//     "D",
//     "D#",
//     "E",
//     "F",
//     "F#",
//     "G",
//     "G#",
//     "A",
//     "A#",
//     "B",
//   ];
//   const note_index = notes.indexOf(note);
//   const semitones_from_a4 = (octave - 4) * 12 + (note_index - 9);
//   return 440 * Math.pow(2, semitones_from_a4 / 12);
// };

// UIManager.frequencyToNote = function (freq) {
//   const semitones_from_a4 = Math.round(12 * Math.log2(freq / 440));
//   const total_semitones = semitones_from_a4 + 4 * 12 + 9;
//   const octave = Math.floor(total_semitones / 12);
//   const note_index = ((total_semitones % 12) + 12) % 12;
//   const notes = [
//     "C",
//     "C#",
//     "D",
//     "D#",
//     "E",
//     "F",
//     "F#",
//     "G",
//     "G#",
//     "A",
//     "A#",
//     "B",
//   ];
//   return { note: notes[note_index], octave: octave };
// };

// UIManager.initializePiano = function () {
//   const piano = document.getElementById("piano");
//   const bodyTypeInput = document.getElementById("bodyType"); // Get the select element
//   if (!piano || !bodyTypeInput) {
//     log(
//       "[CTRL] Piano or bodyType element not found for piano initialization.",
//       "warn",
//     );
//     return;
//   }
//   const bodyType = parseInt(bodyTypeInput.value);
//   this.drawPianoKeys(bodyType); // Call UIManager method

//   bodyTypeInput.addEventListener("change", (e) => {
//     const newBodyType = parseInt(e.target.value);
//     this.drawPianoKeys(newBodyType); // Call UIManager method
//   });
// };

// UIManager.drawPianoKeys = function (bodyType) {
//   const piano = document.getElementById("piano");
//   if (!this.instrument_ranges) {
//     // instrument_ranges should be initialized in UIManager.init
//     this.instrument_ranges = this.calculateRanges();
//   }
//   const range = this.instrument_ranges[bodyType];

//   if (!piano || !range) {
//     log(
//       "[CTRL] Piano element or instrument range not found for drawing keys.",
//       "warn",
//     );
//     return;
//   }

//   piano.innerHTML = ""; // Clear existing keys
//   const pianoRect = piano.getBoundingClientRect();
//   const pianoWidth = pianoRect.width;
//   const start_octave = 2;
//   const end_octave = 7;
//   const white_keys = ["C", "D", "E", "F", "G", "A", "B"];
//   const totalWhiteKeys = (end_octave - start_octave + 1) * white_keys.length;
//   const key_width = Math.floor(pianoWidth / totalWhiteKeys);
//   const white_key_height = 60;
//   const black_key_height = 35;
//   let key_count = 0;
//   let white_key_x = 0;

//   for (let octave = start_octave; octave <= end_octave; octave++) {
//     for (let note of white_keys) {
//       const freq = UIManager.noteToFrequency(note, octave); // Use UIManager method
//       const in_range = freq >= range.low && freq <= range.high;
//       const rect = document.createElementNS(
//         "http://www.w3.org/2000/svg",
//         "rect",
//       );
//       rect.setAttribute("x", white_key_x);
//       rect.setAttribute("y", 10);
//       rect.setAttribute("width", key_width);
//       rect.setAttribute("height", white_key_height);
//       rect.setAttribute("fill", in_range ? "white" : "#f5f5f5");
//       rect.setAttribute("stroke", "#333");
//       rect.setAttribute("stroke-width", "1");
//       rect.setAttribute("data-note", note);
//       rect.setAttribute("data-octave", String(octave));
//       rect.setAttribute("data-freq", freq.toFixed(1));
//       if (in_range) {
//         rect.style.cursor = "pointer";
//         rect.addEventListener("click", () => select_frequency(freq)); // select_frequency is still global
//         // ... (hover listeners)
//       }
//       piano.appendChild(rect);
//       key_count++;
//       white_key_x += key_width;
//     }
//   }
//   white_key_x = 0; // Reset for black keys
//   for (let octave = start_octave; octave <= end_octave; octave++) {
//     for (let i = 0; i < white_keys.length; i++) {
//       const note = white_keys[i];
//       let black_note = null;
//       if (note === "C") black_note = "C#";
//       else if (note === "D") black_note = "D#";
//       else if (note === "F") black_note = "F#";
//       else if (note === "G") black_note = "G#";
//       else if (note === "A") black_note = "A#";
//       if (black_note) {
//         const freq = UIManager.noteToFrequency(black_note, octave); // Use UIManager method
//         const in_range = freq >= range.low && freq <= range.high;
//         const rect = document.createElementNS(
//           "http://www.w3.org/2000/svg",
//           "rect",
//         );
//         rect.setAttribute(
//           "x",
//           String(white_key_x + key_width - key_width * 0.3),
//         ); // Adjusted positioning
//         rect.setAttribute("y", 10);
//         rect.setAttribute("width", String(key_width * 0.6)); // Adjusted width
//         rect.setAttribute("height", String(black_key_height));
//         rect.setAttribute("fill", in_range ? "#333" : "#ccc");
//         rect.setAttribute("stroke", "#000");
//         rect.setAttribute("stroke-width", "1");
//         rect.setAttribute("data-note", black_note);
//         rect.setAttribute("data-octave", String(octave));
//         rect.setAttribute("data-freq", freq.toFixed(1));
//         if (in_range) {
//           rect.style.cursor = "pointer";
//           rect.addEventListener("click", () => select_frequency(freq)); // select_frequency is still global
//           // ... (hover listeners)
//         }
//         piano.appendChild(rect);
//         key_count++;
//       }
//       white_key_x += key_width;
//     }
//   }
//   // Piano keys created
//   const totalActualWidth =
//     (end_octave - start_octave + 1) * white_keys.length * key_width;
//   piano.setAttribute("viewBox", `0 0 ${totalActualWidth} 80`);
//   // setTimeout(() => UIManager.highlightCurrentFrequency(), 100); // Assuming highlightCurrentFrequency becomes UIManager method
// };

// // Legacy wrapper for ExpressionManager
// function select_frequency(freq) {
//   ExpressionManager.selectFrequency(freq);
// }

// UIManager.updateExpressionDisplay = function () {
//   // Update the SVG expression system display if it exists
//   if (window.svgExpression) {
//     try {
//       window.svgExpression.render();
//     } catch (error) {
//       log(`Error updating expression display: ${error}`, "error");
//     }
//   }

//   // Update chord display text based on current chord and expressions
//   const chordDisplay = document.getElementById("chord-display");
//   if (chordDisplay && window.currentChord && window.currentChord.length > 0) {
//     if (window.svgExpression) {
//       const expressions = window.svgExpression.getAllExpressions();
//       const chordParts = [];

//       window.currentChord.forEach((note) => {
//         const expression = expressions[note];
//         if (expression && expression.type) {
//           chordParts.push(`${note}[${expression.type}]`);
//         } else {
//           chordParts.push(note);
//         }
//       });

//       chordDisplay.textContent = chordParts.join(" ");
//     } else {
//       chordDisplay.textContent = window.currentChord.join(" ");
//     }
//   } else if (chordDisplay) {
//     chordDisplay.textContent = "None";
//   }
// };

// UIManager.highlightCurrentFrequency = function () {
//   /* ... (kept for now, if needed) ... */
// };

// UIManager.initializeHarmonicSelectors = function () {
//   const selectors = document.querySelectorAll(".harmonic-selector");

//   if (selectors.length === 0) {
//     log("Warning: No harmonic selectors found in DOM", "warn");
//     return;
//   }

//   selectors.forEach((selector) => {
//     const expression = selector.dataset.expression;
//     if (!expression) {
//       log(
//         "[CTRL] Warning: Harmonic selector missing data-expression attribute",
//         "warn",
//       );
//       return;
//     }

//     ["numerator", "denominator"].forEach((type) => {
//       const row = selector.querySelector(`[data-type="${type}"]`);
//       if (!row) {
//         log(`Warning: No ${type} row found for ${expression}`, "warn");
//         return;
//       }

//       const numbers = row.querySelectorAll(".harmonic-number");
//       if (numbers.length === 0) {
//         log(
//           `Warning: No harmonic numbers found for ${expression} ${type}`,
//           "warn",
//         );
//         return;
//       }

//       // Add click listeners to number buttons
//       numbers.forEach((number) => {
//         number.addEventListener("click", (e) => {
//           e.preventDefault();
//           const value = parseInt(number.dataset.value);

//           if (e.ctrlKey || e.metaKey) {
//             // Ctrl/Cmd+click: toggle individual value
//             UIManager.toggleHarmonicValue(expression, type, value);
//           } else if (e.shiftKey) {
//             // Shift+click: range selection (if there's a previous selection)
//             const selected = row.querySelectorAll(".harmonic-number.selected");
//             if (selected.length > 0) {
//               const lastSelected = parseInt(
//                 selected[selected.length - 1].dataset.value,
//               );
//               UIManager.selectHarmonicRange(
//                 expression,
//                 type,
//                 lastSelected,
//                 value,
//               );
//             } else {
//               UIManager.selectHarmonicValue(expression, type, value);
//             }
//           } else {
//             // Regular click: select single value (clear others first)
//             AppState.harmonicSelections[`${expression}-${type}`].clear();
//             UIManager.selectHarmonicValue(expression, type, value);
//           }
//         });
//       });

//       // Add clear button listener (if exists)
//       const clearBtn = row.querySelector(".clear-selection");
//       if (clearBtn) {
//         clearBtn.addEventListener("click", () => {
//           UIManager.clearHarmonicSelection(expression, type);
//         });
//       }

//       // Initialize display
//       UIManager.updateHarmonicDisplay(expression, type);
//     });
//   });
// };

// UIManager.toggleHarmonicValue = function (expression, type, value) {
//   const key = `${expression}-${type}`;
//   const selection = AppState.harmonicSelections[key];
//   if (selection.has(value)) {
//     selection.delete(value);
//   } else {
//     selection.add(value);
//   }
//   this.updateHarmonicDisplay(expression, type);
//   mark_parameter_changed("harmonicRatios");
//   UIManager.checkOverallStatus();
// };

// UIManager.selectHarmonicValue = function (expression, type, value) {
//   const key = `${expression}-${type}`;
//   AppState.harmonicSelections[key].add(value);
//   this.updateHarmonicDisplay(expression, type);
//   mark_parameter_changed("harmonicRatios");
//   check_overall_status();
// };

// UIManager.selectHarmonicRange = function (expression, type, start, end) {
//   const min = Math.min(start, end);
//   const max = Math.max(start, end);
//   const key = `${expression}-${type}`;
//   const selection = AppState.harmonicSelections[key];
//   for (let i = min; i <= max; i++) {
//     selection.add(i);
//   }
//   this.updateHarmonicDisplay(expression, type);
//   mark_parameter_changed("harmonicRatios");
//   check_overall_status();
// };

// UIManager.clearHarmonicSelection = function (expression, type) {
//   const key = `${expression}-${type}`;
//   AppState.harmonicSelections[key].clear();
//   this.updateHarmonicDisplay(expression, type);
//   mark_parameter_changed("harmonicRatios");
//   check_overall_status();
// };

// UIManager.updateHarmonicDisplay = function (expression, type) {
//   const selector = document.querySelector(`[data-expression="${expression}"]`);
//   if (!selector) return;
//   const row = selector.querySelector(`[data-type="${type}"]`);
//   if (!row) return;
//   const numbers = row.querySelectorAll(".harmonic-number");
//   const key = `${expression}-${type}`;
//   const selection = AppState.harmonicSelections[key];
//   numbers.forEach((number) => {
//     const value = parseInt(number.dataset.value);
//     number.classList.toggle("selected", selection.has(value));
//   });

//   // Harmonic selection updated
// };

// UIManager.updateBankDisplay = function () {
//   const selector = document.getElementById("bank_selector");
//   if (!selector) return;
//   for (let i = 1; i <= 5; i++) {
//     const option = selector.querySelector(`option[value="${i}"]`);
//     if (option) {
//       const hasData = AppState.program_banks.has(i);
//       const baseText = `Bank ${i}`;
//       option.textContent = hasData ? `${baseText} ●` : `${baseText} ⚪`;
//     }
//   }
// };
// // NOTE: The actual event listener setup inside initializeHarmonicSelectors needs to be fully converted
// // to call this.toggleHarmonicValue, this.selectHarmonicRange etc. This is a partial conversion.
// // Full conversion of initializeHarmonicSelectors' internals is complex for one edit.

// // Start the application
// async function start_controller() {
//   // Check if modular system is already running
//   if (window.__modularSystemActive) {
//     console.log(
//       "[LEGACY] Modular system active flag detected, skipping legacy initialization",
//     );
//     return;
//   }

//   if (
//     window.moduleLoader &&
//     window.moduleLoader.getLoadedSystem() === "modular"
//   ) {
//     console.log(
//       "[LEGACY] Modular system detected via module loader, skipping legacy initialization",
//     );
//     return;
//   }

//   // Also check if modular app is already initialized
//   if (window.webSocketManager || window.webRTCManager) {
//     console.log(
//       "[LEGACY] Modular managers detected, skipping legacy initialization",
//     );
//     return;
//   }

//   log("Starting controller...");

//   // Initialize core modules
//   await fetch_ice_servers();
//   UIManager.initialize();
//   UIManager.initializeActualUI();
//   UIManager.initializePiano();
//   UIManager.initializeParameterTracking();
//   UIManager.initializeHarmonicSelectors();
//   NetworkManager.connect();
//   ProgramManager.loadBanksFromStorage();

//   // Initialize application state
//   AppState.current_program = get_current_program();
//   window.current_program = AppState.current_program;

//   log("Controller initialization complete");
// }

// // Parameter change tracking (moved to UIManager)
// let sent_program_state = {}; // Legacy global for compatibility

// // Move parameter tracking to UIManager
// UIManager.initializeParameterTracking = function () {
//   // Store initial state as "sent"
//   this.sent_program_state = get_current_program();
//   sent_program_state = this.sent_program_state; // Keep legacy global in sync
//   this.updateStatusBadge("synced");

//   // Add listeners to expression radios
//   const expressionRadios = document.querySelectorAll(
//     'input[name="expression"]',
//   );
//   if (expressionRadios.length > 0) {
//     expressionRadios.forEach((radio) => {
//       radio.addEventListener("change", () => {
//         mark_parameter_changed("expression");
//         this.updateExpressionGroups();
//       });
//     });
//   }
// };

// // Legacy wrapper
// function initialize_parameter_tracking() {
//   UIManager.initializeParameterTracking();
// }

// // Legacy wrapper
// function initialize_piano() {
//   UIManager.initializePiano();
// }

// function mark_parameter_changed(param_id) {
//   // Find the control group for this parameter
//   let control_group = null;

//   if (param_id === "expression") {
//     const expressionRadio = document.querySelector('input[name="expression"]');
//     if (expressionRadio) {
//       control_group = expressionRadio.closest(".control-group");
//     }
//   } else if (param_id === "harmonicRatios") {
//     // Mark all harmonic selector control groups as changed
//     const selectors = document.querySelectorAll(".harmonic-selector");
//     selectors.forEach((selector) => {
//       const group = selector.closest(".control-group");
//       if (group) {
//         group.classList.remove("sent");
//         group.classList.add("changed");
//       }
//     });
//     return; // Don't need to find a specific control group
//   } else if (param_id === "chord") {
//     // Mark the chord control section as changed
//     const chordSection = document.querySelector(".chord-control");
//     if (chordSection) {
//       const group = chordSection.closest(".control-group") || chordSection;
//       group.classList.remove("sent");
//       group.classList.add("changed");
//     }
//     return;
//   } else {
//     const element = UIManager.param_elements[param_id];
//     if (element && element.input) {
//       control_group = element.input.closest(".control-group");
//     }
//   }

//   if (control_group) {
//     control_group.classList.remove("sent");
//     control_group.classList.add("changed");
//     log(`Added changed class to ${param_id}`, "parameters");
//   } else {
//     log(`Could not find control group for ${param_id}`, "error");
//   }
// }

// UIManager.markAllParametersSent = function () {
//   // Remove changed class and briefly add sent class to all parameters
//   this.param_ids.forEach((id) => {
//     const element = this.param_elements[id];
//     if (element && element.input) {
//       const control_group = element.input.closest(".control-group");
//       if (control_group) {
//         control_group.classList.remove("changed");
//         control_group.classList.add("sent");
//         setTimeout(() => {
//           control_group.classList.remove("sent");
//         }, 1000);
//       }
//     }
//   });

//   // Handle expression group (if it exists)
//   const expressionRadio = document.querySelector('input[name="expression"]');
//   if (expressionRadio) {
//     const expressionGroup = expressionRadio.closest(".control-group");
//     if (expressionGroup) {
//       expressionGroup.classList.remove("changed");
//       expressionGroup.classList.add("sent");
//       setTimeout(() => {
//         expressionGroup.classList.remove("sent");
//       }, 1000);
//     }
//   }

//   // Handle harmonic selector groups
//   const harmonicGroups = document.querySelectorAll(".harmonic-selector");
//   harmonicGroups.forEach((selector) => {
//     const group = selector.closest(".control-group");
//     if (group) {
//       group.classList.remove("changed");
//       group.classList.add("sent");
//       setTimeout(() => {
//         group.classList.remove("sent");
//       }, 1000);
//     }
//   });

//   // Handle chord control section
//   const chordSection = document.querySelector(".chord-control");
//   if (chordSection) {
//     const group = chordSection.closest(".control-group") || chordSection;
//     group.classList.remove("changed");
//     group.classList.add("sent");
//     setTimeout(() => {
//       group.classList.remove("sent");
//     }, 1000);
//   }

//   // Update sent state
//   this.sent_program_state = get_current_program();
//   sent_program_state = this.sent_program_state; // Keep legacy global in sync
// };

// // Legacy wrapper
// function _mark_all_parameters_sent() {
//   UIManager.markAllParametersSent();
// }

// // Mark unused functions with underscore prefix
// function _create_example_program() {
//   return ProgramManager.createExampleProgram();
// }

// function _frequency_to_note(freq) {
//   return UIManager.frequencyToNote(freq);
// }

// UIManager.checkOverallStatus = function () {
//   const current_state = get_current_program();
//   const sent_state = this.sent_program_state || sent_program_state;
//   const has_changes =
//     JSON.stringify(current_state) !== JSON.stringify(sent_state);

//   if (has_changes) {
//     this.updateStatusBadge("pending");
//   } else {
//     this.updateStatusBadge("synced");
//   }
// };

// // Legacy wrapper
// function check_overall_status() {
//   UIManager.checkOverallStatus();
// }

// UIManager.updateStatusBadge = function (status) {
//   const badge = document.getElementById("status_badge");
//   if (badge) {
//     // Add check for element
//     badge.className = `status-badge ${status}`;

//     switch (status) {
//       case "synced": {
//         badge.textContent = "✓ Synced";
//         break;
//       }
//       case "pending": {
//         badge.textContent = "● Changes Pending";
//         break;
//       }
//       case "sending":
//         badge.textContent = "📡 Sending...";
//         break;
//     }
//   } else {
//     log("[CTRL] Status badge element not found.", "warn");
//   }
// };

// // Clear chord button
// document.getElementById("clear-chord").addEventListener("click", () => {
//   ExpressionManager.clearChord();
// });

// // Initial call to set up controller and UI
// // This will only run if called by module-loader.js when loading legacy system
// // The start_controller function itself checks if modular system is active
