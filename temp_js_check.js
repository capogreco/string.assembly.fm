            // Global state
            let audioContext = null;
            let synths = [];
            let controllerConnection = null;
            let masterGain = null;
            let isInitialized = false;

            // Real WebRTC configuration
            const rtcConfig = {
                iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
            };

            // Synth class
            class TestSynth {
                constructor(id, index, totalSynths) {
                    this.id = id;
                    this.index = index;
                    this.element = null;
                    this.noteDisplay = null;
                    this.expressionDisplay = null;
                    this.levelMeter = null;
                    this.panControl = null;

                    // Audio nodes
                    this.bowedString = null;
                    this.gain = null;
                    this.panner = null;
                    this.analyser = null;

                    // State
                    this.currentNote = null;
                    this.currentExpression = null;
                    this.isActive = false;
                    this.currentProgram = null;

                    // Banking
                    this.synthBanks = new Map();

                    // WebRTC connections (will be set up later)
                    this.ws = null;
                    this.controllers = new Map();

                    // Calculate pan position
                    this.panPosition =
                        totalSynths === 1
                            ? 0
                            : (index / (totalSynths - 1)) * 2 - 1;
                }

                async initialize(audioCtx, destination) {
                    // Create audio nodes
                    this.gain = audioCtx.createGain();
                    this.gain.gain.value = 0;

                    this.panner = audioCtx.createStereoPanner();
                    this.panner.pan.value = this.panPosition;

                    this.analyser = audioCtx.createAnalyser();
                    this.analyser.fftSize = 256;

                    // Create bowed string worklet
                    try {
                        // Verify worklet is available
                        if (!audioCtx.audioWorklet) {
                            throw new Error("AudioWorklet not supported");
                        }

                        this.bowedString = new AudioWorkletNode(
                            audioCtx,
                            "continuous-excitation-processor",
                            {
                                numberOfInputs: 0,
                                numberOfOutputs: 1,
                                outputChannelCount: [2],
                            },
                        );

                        // Connect audio graph
                        this.bowedString.connect(this.gain);
                        this.gain.connect(this.analyser);
                        this.analyser.connect(this.panner);
                        this.panner.connect(destination);

                        // Initialize parameters to defaults
                        const defaultParams = {
                            fundamentalFrequency: 220,
                            bowForce: 0.3,
                            bowPosition: 0.1,
                            bowSpeed: 0.5,
                            stringDamping: 0.1,
                            stringMaterial: 0.5,
                            brightness: 0.5,
                            masterGain: 0.8,
                        };

                        for (const [param, value] of Object.entries(
                            defaultParams,
                        )) {
                            if (this.bowedString.parameters.has(param)) {
                                this.bowedString.parameters
                                    .get(param)
                                    .setValueAtTime(
                                        value,
                                        audioCtx.currentTime,
                                    );
                            }
                        }

                        log(`[${this.id}] Audio graph initialized`, "info");
                    } catch (error) {
                        log(
                            `[${this.id}] Failed to create audio nodes: ${error.message}`,
                            "error",
                        );
                        console.error(error);
                    }
                }

                handleParamMessage(event) {
                    const data =
                        typeof event.data === "string"
                            ? JSON.parse(event.data)
                            : event.data;

                    log(
                        `[${this.id}] Received param message: ${data.type}`,
                        "info",
                    );

                    if (data.type === "program") {
                        this.applyProgram(data.program, data.transition);
                    } else if (data.type === "setTransitionConfig") {
                        // Forward transition config to worklet
                        if (this.bowedString) {
                            this.bowedString.port.postMessage({
                                type: "setTransitionConfig",
                                config: data.config,
                            });
                            log(
                                `[${this.id}] Applied transition config: ${JSON.stringify(data.config)}`,
                                "info",
                            );
                        }
                    } else if (data.type === "ping") {
                        if (
                            this.paramChannel &&
                            this.paramChannel.readyState === "open"
                        ) {
                            this.paramChannel.send(
                                JSON.stringify({
                                    type: "pong",
                                    timestamp: data.timestamp,
                                    state: {
                                        audio_enabled: true,
                                        joined: this.isActive,
                                    },
                                }),
                            );
                        }
                    }
                }

                handleCommandMessage(event) {
                    const data =
                        typeof event.data === "string"
                            ? JSON.parse(event.data)
                            : event.data;

                    if (data.type === "command") {
                        if (data.name === "power") {
                            this.setPower(data.value);
                        } else if (data.name === "save") {
                            this.handleSaveCommand(data.bank || data.value);
                        } else if (data.name === "load") {
                            this.handleLoadCommand(
                                data.bank,
                                data.fallbackProgram,
                            );
                        }
                    }
                }

                applyProgram(program, transition) {
                    log(
                        `[${this.id}] Applying program: freq=${program.fundamentalFrequency?.toFixed(1)}Hz${transition ? " with transition" : ""}`,
                        "info",
                    );

                    // Store current program for banking
                    this.currentProgram = program;

                    // Update display
                    if (program.fundamentalFrequency) {
                        const noteInfo = this.frequencyToNote(
                            program.fundamentalFrequency,
                        );
                        this.currentNote = noteInfo.note;
                        this.noteDisplay.textContent = noteInfo.note;
                    }

                    // Update expression display
                    let expression = "None";
                    if (program.vibratoEnabled) expression = "Vibrato";
                    else if (program.tremoloEnabled) expression = "Tremolo";
                    else if (program.trillEnabled) expression = "Trill";
                    this.currentExpression = expression;
                    this.expressionDisplay.textContent = `Expression: ${expression}`;

                    // Apply to worklet
                    if (this.bowedString) {
                        const defaultPeriod = 0.5; // 500ms default transition
                        const lag = transition?.lag?.min || 0;
                        const startTime = audioContext.currentTime + lag;

                        // Send timed expression state to worklet
                        let targetExpressionType = "NONE";
                        if (program.vibratoEnabled)
                            targetExpressionType = "VIBRATO";
                        else if (program.tremoloEnabled)
                            targetExpressionType = "TREMOLO";
                        else if (program.trillEnabled)
                            targetExpressionType = "TRILL";

                        setTimeout(() => {
                            if (this.bowedString) {
                                // Re-check in case synth was destroyed
                                this.bowedString.port.postMessage({
                                    type: "setExpression",
                                    expression: targetExpressionType,
                                });
                                log(
                                    `[${this.id}] Sent setExpression: ${targetExpressionType} at ${lag.toFixed(3)}s lag`,
                                    "info",
                                );
                            }
                        }, lag * 1000);

                        for (const [param, value] of Object.entries(program)) {
                            // Skip expression enable flags - they're now handled by the timed setExpression message
                            if (
                                param === "vibratoEnabled" ||
                                param === "tremoloEnabled" ||
                                param === "trillEnabled"
                            ) {
                                continue;
                            }

                            // Handle AudioParams
                            if (this.bowedString.parameters.has(param)) {
                                const audioParam =
                                    this.bowedString.parameters.get(param);
                                const currentValue = audioParam.value;
                                const targetValue =
                                    typeof value === "boolean"
                                        ? value
                                            ? 1
                                            : 0
                                        : value;

                                // Skip if value hasn't changed (unless it's fundamental frequency, always set for note on)
                                if (
                                    param !== "fundamentalFrequency" &&
                                    Math.abs(currentValue - targetValue) < 0.001
                                ) {
                                    continue;
                                }

                                const period =
                                    transition?.period?.min || defaultPeriod;
                                // lag and startTime are already defined outside this loop
                                const endTime = startTime + period;

                                // Cancel any scheduled changes and pin current value
                                audioParam.cancelScheduledValues(
                                    audioContext.currentTime,
                                );
                                audioParam.setValueAtTime(
                                    currentValue,
                                    audioContext.currentTime,
                                );

                                if (transition) {
                                    // Check if transition object exists
                                    // Smooth transition for continuous parameters
                                    if (
                                        param === "fundamentalFrequency" &&
                                        targetValue > 0 && // Ensure target is valid
                                        currentValue > 0 // Ensure current is valid for ramp
                                    ) {
                                        // Exponential for frequency
                                        audioParam.exponentialRampToValueAtTime(
                                            targetValue,
                                            endTime,
                                        );
                                    } else {
                                        // Linear for everything else
                                        audioParam.linearRampToValueAtTime(
                                            targetValue,
                                            endTime,
                                        );
                                    }
                                    log(
                                        `[${this.id}] Transitioning ${param} from ${currentValue.toFixed(3)} to ${targetValue.toFixed(3)} over ${period.toFixed(3)}s starting at ${lag.toFixed(3)}s lag`,
                                        "info",
                                    );
                                } else {
                                    // Immediate change if no transition object
                                    audioParam.setValueAtTime(
                                        targetValue,
                                        startTime, // If lag is 0, this is effectively currentTime
                                    );
                                    log(
                                        `[${this.id}] Set ${param} immediately to ${targetValue.toFixed(3)} at ${startTime.toFixed(3)}s`,
                                        "info",
                                    );
                                }
                            }
                            // Handle discrete parameters via timed messages
                            else if (
                                param === "stringMaterial" ||
                                param === "bodyType"
                            ) {
                                setTimeout(() => {
                                    if (this.bowedString) {
                                        // Re-check in case synth was destroyed
                                        this.bowedString.port.postMessage({
                                            type:
                                                param === "stringMaterial"
                                                    ? "setStringMaterial"
                                                    : "setBodyType",
                                            value: value,
                                        });
                                        log(
                                            `[${this.id}] Sent ${param}: ${value} at ${lag.toFixed(3)}s lag`,
                                            "info",
                                        );
                                    }
                                }, lag * 1000);
                            }
                            // Else, if it's not an AudioParam and not a handled discrete param, log it (optional)
                            // else {
                            //    log(`[${this.id}] Unhandled program parameter (within loop): ${param}`, "info");
                            // }
                        } // End of for...of Object.entries(program)

                        // Start bowing (if applicable and synth is active)
                        // Assuming this.isActive reflects whether the synth *should* be making sound
                        // and this.bowedString confirms the worklet is ready.
                        if (this.bowedString && this.isActive !== false) {
                            // isActive could be undefined initially
                            this.bowedString.port.postMessage({
                                type: "setBowing",
                                value: true,
                            });
                            log(`[${this.id}] Sent setBowing: true`, "info");
                        }
                    } // End of if (this.bowedString) for applying parameters

                    this.element.classList.add("active");
                    log(
                        `[${this.id}] Program applied and synth UI activated`,
                        "info",
                    );
                } // End of applyProgram method

                setPower(on) {
                    const targetGain = on ? 0.7 : 0;
                    this.gain.gain.linearRampToValueAtTime(
                        targetGain,
                        audioContext.currentTime + 0.1,
                    );
                    this.isActive = on;

                    if (on) {
                        this.element.classList.add("active");
                    } else {
                        this.element.classList.remove("active");
                    }
                }

                handleSaveCommand(bankId) {
                    if (!this.currentProgram) {
                        log(`[${this.id}] No current program to save`, "error");
                        return;
                    }

                    // Store a deep copy of current resolved parameters
                    const savedProgram = JSON.parse(
                        JSON.stringify(this.currentProgram),
                    );
                    this.synthBanks.set(bankId, savedProgram);

                    // Also save to localStorage for persistence
                    try {
                        const allBanks = {};
                        this.synthBanks.forEach((program, id) => {
                            allBanks[id] = program;
                        });
                        localStorage.setItem(
                            `synth-banks-${this.id}`,
                            JSON.stringify(allBanks),
                        );
                        log(
                            `[${this.id}] Saved resolved parameters to bank ${bankId}`,
                            "info",
                        );
                    } catch (e) {
                        log(
                            `[${this.id}] Failed to save banks to localStorage: ${e.message}`,
                            "error",
                        );
                    }
                }

                handleLoadCommand(bankId, fallbackProgram) {
                    if (this.synthBanks.has(bankId)) {
                        // This synth has saved state - restore exact values
                        const savedProgram = this.synthBanks.get(bankId);
                        log(
                            `[${this.id}] Loading saved parameters from bank ${bankId}`,
                            "info",
                        );
                        this.applyProgram(savedProgram);
                    } else if (fallbackProgram) {
                        // New synth - use fallback program from controller
                        log(
                            `[${this.id}] New synth using fallback program for bank ${bankId}`,
                            "info",
                        );
                        this.applyProgram(fallbackProgram);
                    } else {
                        log(
                            `[${this.id}] Bank ${bankId} not found and no fallback program provided`,
                            "error",
                        );
                    }
                }

                loadSynthBanksFromStorage() {
                    try {
                        const saved = localStorage.getItem(
                            `synth-banks-${this.id}`,
                        );
                        if (saved) {
                            const banksData = JSON.parse(saved);
                            Object.entries(banksData).forEach(
                                ([bankId, program]) => {
                                    this.synthBanks.set(
                                        parseInt(bankId),
                                        program,
                                    );
                                },
                            );
                            log(
                                `[${this.id}] Loaded ${this.synthBanks.size} saved banks from storage`,
                                "info",
                            );
                        }
                    } catch (e) {
                        log(
                            `[${this.id}] Failed to load banks from storage: ${e.message}`,
                            "error",
                        );
                    }
                }

                frequencyToNote(freq) {
                    const A4 = 440;
                    const semitones = Math.round(12 * Math.log2(freq / A4));
                    const noteNames = [
                        "C",
                        "C#",
                        "D",
                        "D#",
                        "E",
                        "F",
                        "F#",
                        "G",
                        "G#",
                        "A",
                        "A#",
                        "B",
                    ];
                    const octave = Math.floor((semitones + 57) / 12);
                    const noteIndex = (semitones + 69) % 12;
                    return { note: noteNames[noteIndex] + octave, semitones };
                }

                updateLevel() {
                    if (!this.analyser || !this.levelMeter) return;

                    const dataArray = new Uint8Array(
                        this.analyser.frequencyBinCount,
                    );
                    this.analyser.getByteFrequencyData(dataArray);

                    let sum = 0;
                    for (let i = 0; i < dataArray.length; i++) {
                        sum += dataArray[i];
                    }
                    const average = sum / dataArray.length;
                    const normalizedLevel = average / 255;

                    this.levelMeter.style.height = `${normalizedLevel * 100}%`;
                }

                createUI() {
                    const unit = document.createElement("div");
                    unit.className = "synth-unit";

                    unit.innerHTML = `
                    <div class="synth-header">
                        <span class="synth-id">${this.id}</span>
                        <div class="status-dot connected"></div>
                    </div>
                    <div class="note-display">--</div>
                    <div class="expression-display">Expression: None</div>
                    <div class="level-meter">
                        <div class="level-bar"></div>
                    </div>
                    <div class="pan-control">
                        <label>Pan:</label>
                        <input type="range" class="pan-slider" min="-1" max="1" step="0.1" value="${this.panPosition}">
                        <span class="pan-value">${this.panPosition.toFixed(1)}</span>
                    </div>
                `;

                    this.element = unit;
                    this.noteDisplay = unit.querySelector(".note-display");
                    this.expressionDisplay = unit.querySelector(
                        ".expression-display",
                    );
                    this.levelMeter = unit.querySelector(".level-bar");
                    this.panControl = unit.querySelector(".pan-slider");

                    // Pan control
                    this.panControl.addEventListener("input", (e) => {
                        const value = parseFloat(e.target.value);
                        this.panner.pan.value = value;
                        unit.querySelector(".pan-value").textContent =
                            value.toFixed(1);
                    });

                    return unit;
                }
            }

            async function initializeEnsemble() {
                const synthCount = parseInt(
                    document.getElementById("synth-count").value,
                );

                try {
                    if (!audioContext) {
                        audioContext = new (window.AudioContext ||
                            window.webkitAudioContext)();

                        if (audioContext.state === "suspended") {
                            await audioContext.resume();
                            log("Audio context resumed", "info");
                        }

                        masterGain = audioContext.createGain();
                        masterGain.gain.value = 0.7;
                        masterGain.connect(audioContext.destination);

                        log("Loading audio worklets...", "info");
                        await audioContext.audioWorklet.addModule(
                            "bowed_string_worklet.js",
                        );
                        await audioContext.audioWorklet.addModule(
                            "reverb_worklet.js",
                        );
                        await audioContext.audioWorklet.addModule(
                            "pink_noise.js",
                        );
                        log("Audio worklets loaded successfully", "info");
                    }

                    synths.forEach((synth) => {
                        if (synth.element && synth.element.parentNode) {
                            synth.element.parentNode.removeChild(synth.element);
                        }
                    });
                    synths = [];

                    const synthGrid = document.getElementById("synth-grid");
                    synthGrid.innerHTML = "";

                    for (let i = 0; i < synthCount; i++) {
                        const synth = new TestSynth(
                            `test-synth-${i}`,
                            i,
                            synthCount,
                        );
                        await synth.initialize(audioContext, masterGain);
                        synth.loadSynthBanksFromStorage();
                        synthGrid.appendChild(synth.createUI());
                        synths.push(synth);
                    }

                    document.getElementById("start-all").disabled = false;
                    document.getElementById("stop-all").disabled = false;

                    isInitialized = true;
                    log(`Initialized ${synthCount} synths`, "info");

                    updateLevelMeters();
                } catch (error) {
                    log(
                        `Failed to initialize ensemble: ${error.message}`,
                        "error",
                    );
                    console.error(error);
                }
            }

            function connectToController() {
                console.log("[DEBUG] connectToController called");
                if (!isInitialized) {
                    log("Please initialize synths first", "error");
                    return;
                }
                log("Connect to controller function called", "info");
            }

            async function connectSynthToController(synth, controllerId) {
                log(
                    `[${synth.id}] Initiating connection to controller ${controllerId}`,
                    "info",
                );

                const pc = new RTCPeerConnection(rtcConfig);
                const controller = synth.controllers.get(controllerId);
                controller.connection = pc;
                controller.ice_queue = [];

                // Create data channels
                const param_channel = pc.createDataChannel("params", {
                    ordered: false,
                    maxRetransmits: 0,
                });
                const command_channel = pc.createDataChannel("commands", {
                    ordered: true,
                });

                controller.channel = param_channel;
                controller.command_channel = command_channel;

                // Set up param channel handlers
                param_channel.addEventListener("open", () => {
                    log(
                        `[${synth.id}] Param channel open to ${controllerId}`,
                        "info",
                    );
                    controller.connected = true;

                    // Send immediate state update
                    param_channel.send(
                        JSON.stringify({
                            type: "pong",
                            timestamp: Date.now(),
                            state: {
                                audio_enabled: true,
                                joined: synth.isActive,
                            },
                        }),
                    );
                });

                param_channel.addEventListener("message", (event) => {
                    synth.handleParamMessage(event);
                });

                param_channel.addEventListener("close", () => {
                    log(
                        `[${synth.id}] Param channel closed to ${controllerId}`,
                        "info",
                    );
                    controller.connected = false;
                });

                // Set up command channel handlers
                command_channel.addEventListener("message", (event) => {
                    const command = JSON.parse(event.data);
                    if (command.type === "command") {
                        synth.handleCommandMessage(event);
                    }
                });

                // Handle ICE candidates
                pc.addEventListener("icecandidate", (event) => {
                    if (event.candidate) {
                        synth.ws.send(
                            JSON.stringify({
                                type: "ice",
                                source: synth.id,
                                target: controllerId,
                                data: event.candidate,
                            }),
                        );
                    }
                });

                // Handle connection state
                pc.addEventListener("connectionstatechange", () => {
                    log(
                        `[${synth.id}] Connection state to ${controllerId}: ${pc.connectionState}`,
                        "info",
                    );

                    if (
                        pc.connectionState === "failed" ||
                        pc.connectionState === "closed"
                    ) {
                        controller.connected = false;
                    }
                });

                // Create and send offer
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                synth.ws.send(
                    JSON.stringify({
                        type: "offer",
                        source: synth.id,
                        target: controllerId,
                        data: offer,
                    }),
                );
            }

            async function handleControllerAnswer(synth, message) {
                const controller = synth.controllers.get(message.source);
                if (controller && controller.connection) {
                    await controller.connection.setRemoteDescription(
                        message.data,
                    );

                    // Process any queued ICE candidates
                    if (
                        controller.ice_queue &&
                        controller.ice_queue.length > 0
                    ) {
                        log(
                            `[${synth.id}] Processing ${controller.ice_queue.length} queued ICE candidates`,
                            "info",
                        );
                        for (const candidate of controller.ice_queue) {
                            await controller.connection.addIceCandidate(
                                candidate,
                            );
                        }
                        controller.ice_queue = [];
                    }
                }
            }

            async function handleIceCandidate(synth, message) {
                const controller = synth.controllers.get(message.source);
                if (controller && controller.connection) {
                    if (controller.connection.remoteDescription) {
                        await controller.connection.addIceCandidate(
                            message.data,
                        );
                    } else {
                        // Queue ICE candidate if remote description isn't set yet
                        if (!controller.ice_queue) {
                            controller.ice_queue = [];
                        }
                        controller.ice_queue.push(message.data);
                        log(
                            `[${synth.id}] Queued ICE candidate from ${message.source}`,
                            "info",
                        );
                    }
                }
            }

            function startAllSynths() {
                synths.forEach((synth) => {
                    synth.setPower(true);
                });
            }

            function stopAllSynths() {
                synths.forEach((synth) => {
                    synth.setPower(false);
                });
            }

            function updateLevelMeters() {
                if (!isInitialized) return;

                synths.forEach((synth) => {
                    synth.updateLevel();
                });

                requestAnimationFrame(updateLevelMeters);
            }

            function log(message, type = "info") {
                const logArea = document.getElementById("log-area");
                const entry = document.createElement("div");
                entry.className = `log-entry ${type}`;
                entry.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
                logArea.appendChild(entry);
                logArea.scrollTop = logArea.scrollHeight;

                // Keep only last 100 entries
                while (logArea.children.length > 100) {
                    logArea.removeChild(logArea.firstChild);
                }
            }

            // Volume control
            document
                .getElementById("master-volume")
                .addEventListener("input", (e) => {
                    const value = parseFloat(e.target.value);
                    if (masterGain) {
                        masterGain.gain.value = value;
                    }
                    document.getElementById("volume-display").textContent =
                        `${Math.round(value * 100)}%`;
                });
