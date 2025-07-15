// synth-app.js - Single synth instance application
import { SynthClient } from "../modules/synth/SynthClient.js";
import { Logger } from "../modules/core/Logger.js";
import { WaveformVisualizer } from "../modules/ui/WaveformVisualizer.js";
import {
  SystemConfig,
  startIceServerRefresh,
} from "../config/system.config.js";
import {
  MessageBuilders,
  validateMessage,
  MessageTypes,
  isMessageType,
} from "../protocol/MessageProtocol.js";

class SynthApp {
  constructor() {
    this.synthId = `synth-${Math.random().toString(36).substr(2, 9)}`;
    this.synthClient = new SynthClient(this.synthId, {
      enableLogging: true,
      enableVisualizer: true,
    });

    this.ws = null;
    this.audioContext = null;
    this.controllers = new Map();
    this.rtcConfig = SystemConfig.network.webrtc;
    this.hasJoinedInstrument = false;

    // Debug info
    this.debugInfo = {
      wsState: "disconnected",
      controllersReceived: [],
      connectionsAttempted: [],
      iceStates: new Map(),
      errors: [],
      connectionPhases: new Map(), // Track phases per controller
      iceDiagnostics: new Map(), // Track ICE details per controller
      dataChannelDiagnostics: new Map(), // Track data channel state
    };

    // UI elements
    this.statusEl = document.getElementById("status");
    this.calibrationButton = document.getElementById("start_calibration");
    this.joinButton = document.getElementById("join_instrument");
    this.calibrationPhase = document.getElementById("calibration_phase");
    this.calibrationContent = document.getElementById("calibration_content");
    this.joinPhase = document.getElementById("join_phase");
    this.canvas = document.getElementById("visualizer");
    this.visualizer = null;

    // Initialize logging
    // SynthApp initializing
  }

  async init() {
    // console.log("[DEBUG] init() called");

    // Enable debug mode with triple tap
    this.setupDebugMode();

    // Fetch ICE servers
    await this.fetchIceServers();

    // Setup canvas and visualizer
    if (this.canvas) {
      this.visualizer = new WaveformVisualizer(this.canvas, {
        lineWidth: 2,
        strokeStyle: "#60a5fa",
        backgroundColor: "#1a1a2e",
        amplitudeScale: 0.4,
      });
      this.resizeCanvas();
      window.addEventListener("resize", () => this.resizeCanvas());
      // Start the visualizer animation loop
      this.visualizer.start();

      // Set canvas on SynthClient for its internal visualizer
      this.synthClient.setVisualizerCanvas(this.canvas);
    }

    // Connect WebSocket
    this.connectWebSocket();

    // Setup UI handlers
    this.setupUI();
  }

  async fetchIceServers() {
    const turnStatusEl = document.getElementById("turn-status");
    const turnTextEl = document.getElementById("turn-text");
    const turnIconEl = document.getElementById("turn-icon");

    // Debug log for mobile
    console.log("[TURN] Status element found:", !!turnStatusEl);
    console.log("[TURN] Text element found:", !!turnTextEl);
    console.log("[TURN] Icon element found:", !!turnIconEl);

    try {
      const response = await fetch("/ice-servers");
      const data = await response.json();
      if (data.ice_servers) {
        this.rtcConfig.iceServers = data.ice_servers;

        // Check if TURN servers are present
        const hasTurn = data.ice_servers.some(
          (server) =>
            server.urls &&
            (server.urls.startsWith("turn:") ||
              (Array.isArray(server.urls) &&
                server.urls.some((url) => url.startsWith("turn:")))),
        );

        // Log TURN server details for debugging
        const turnServers = data.ice_servers.filter((server) => {
          const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
          return urls.some((url) => url && url.startsWith("turn:"));
        });

        if (turnServers.length > 0) {
          console.log("[TURN Debug] TURN servers found:", turnServers.length);
          turnServers.forEach((server, idx) => {
            console.log(`[TURN Debug] Server ${idx + 1}:`, {
              urls: server.urls,
              hasUsername: !!server.username,
              hasCredential: !!server.credential,
              credentialLength: server.credential
                ? server.credential.length
                : 0,
            });
          });
        }

        if (hasTurn) {
          // TURN servers successfully configured
          if (turnStatusEl) {
            turnTextEl.textContent = "TURN servers active";
            turnIconEl.textContent = "✅";
            turnStatusEl.style.background = "rgba(34, 139, 34, 0.8)";
          }
          Logger.log("ICE servers loaded (with TURN)", "connections");

          // Start periodic ICE server refresh (every 4 hours)
          startIceServerRefresh(4);
          Logger.log("Started periodic ICE server refresh", "connections");
        } else {
          // Only STUN servers available
          if (turnStatusEl) {
            turnTextEl.textContent = "STUN only (no TURN)";
            turnIconEl.textContent = "⚠️";
            turnStatusEl.style.background = "rgba(255, 165, 0, 0.8)";
          }
          Logger.log("ICE servers loaded (STUN only)", "connections");
        }

        // console.log("[DEBUG] ICE servers loaded:", this.rtcConfig.iceServers);
      }
    } catch (error) {
      // Failed to fetch ICE servers
      if (turnStatusEl) {
        turnTextEl.textContent = "Failed to fetch ICE servers";
        turnIconEl.textContent = "❌";
        turnStatusEl.style.background = "rgba(220, 20, 60, 0.8)";
      }
      // console.log("[DEBUG] Failed to fetch ICE servers:", error);
      Logger.log("Failed to fetch ICE servers, using defaults", "error");
    }
  }

  resizeCanvas() {
    if (this.canvas && this.visualizer) {
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;

      // Only resize if dimensions actually changed
      if (this.canvas.width !== newWidth || this.canvas.height !== newHeight) {
        this.visualizer.resize(newWidth, newHeight);
        // console.log("[DEBUG] Canvas resized to:", newWidth, "x", newHeight);
      }
    }
  }

  connectWebSocket() {
    const wsUrl = SystemConfig.network.websocket.url;
    // console.log("[DEBUG] Connecting to WebSocket:", wsUrl);
    this.ws = new WebSocket(wsUrl);

    this.ws.addEventListener("open", () => {
      // console.log("[DEBUG] WebSocket connected");
      // Connected to server
      this.updateStatus(`Connected as ${this.synthId}`);
      this.updateDebugInfo("wsState", "connected");

      // Register as a synth (not a controller)
      const registerMsg = {
        type: "register",
        client_id: this.synthId,
        client_type: "synth", // Help server identify this is a synth
      };
      // console.log("[DEBUG] Sending registration:", registerMsg);
      this.ws.send(JSON.stringify(registerMsg));

      // Request controllers after a short delay to ensure registration is processed
      setTimeout(() => {
        const requestMsg = {
          type: "request-controllers",
          source: this.synthId,
        };
        // console.log("[DEBUG] Requesting controllers:", requestMsg);
        this.ws.send(JSON.stringify(requestMsg));
      }, 1000); // Increased to 1 second to allow controllers to register

      // Periodically request controllers to catch any late-joining ones
      this.controllerRefreshInterval = setInterval(() => {
        if (this.ws.readyState === WebSocket.OPEN) {
          const requestMsg = {
            type: "request-controllers",
            source: this.synthId,
          };
          this.ws.send(JSON.stringify(requestMsg));
        }
      }, 10000); // Refresh every 10 seconds
    });

    this.ws.addEventListener("message", async (event) => {
      const message = JSON.parse(event.data);
      await this.handleMessage(message);
    });

    this.ws.addEventListener("close", () => {
      Logger.log("Disconnected from server", "connections");
      this.updateStatus("Disconnected - Reconnecting...");
      this.updateDebugInfo("wsState", "disconnected");

      // Clear controller refresh interval
      if (this.controllerRefreshInterval) {
        clearInterval(this.controllerRefreshInterval);
        this.controllerRefreshInterval = null;
      }

      setTimeout(
        () => this.connectWebSocket(),
        SystemConfig.network.websocket.reconnectDelay,
      );
    });

    this.ws.addEventListener("error", (error) => {
      Logger.log(`WebSocket error: ${error}`, "error");
    });
  }

  async handleMessage(message) {
    console.log("[DEBUG] Received WebSocket message:", message);

    switch (message.type) {
      case "controllers-list":
        // Received list of active controllers
        console.log("[DEBUG] Controllers list received:", message.controllers);
        console.log(
          "[DEBUG] Current controllers map:",
          Array.from(this.controllers.keys()),
        );
        this.updateDebugInfo("controllersReceived", message.controllers || []);
        // Received controllers list

        // Clear controllers that are no longer in the list
        for (const [controllerId, controller] of this.controllers) {
          if (!message.controllers.includes(controllerId)) {
            if (controller.connection) {
              controller.connection.close();
            }
            this.controllers.delete(controllerId);
            this.synthClient.controllers.delete(controllerId);
          }
        }

        // Add and connect to any new controllers
        for (const controllerId of message.controllers) {
          if (!this.controllers.has(controllerId)) {
            // console.log(`[DEBUG] Discovered new controller: ${controllerId}`);
            // Discovered controller
            this.updateConnectionPhase(controllerId, "discovered", "success");
            this.controllers.set(controllerId, {
              id: controllerId,
              connection: null,
              channel: null,
              connected: false,
              iceQueue: [],
            });
            // Auto-connect to discovered controller
            // console.log(`[DEBUG] Auto-connecting to controller: ${controllerId}`);
            this.connectToController(controllerId);
          } else {
            // console.log(`[DEBUG] Controller ${controllerId} already in map`);
          }
        }
        this.updateControllerList();
        break;

      case "controller-joined":
        // New controller joined
        // New controller joined
        if (!this.controllers.has(message.controller_id)) {
          this.controllers.set(message.controller_id, {
            id: message.controller_id,
            connection: null,
            channel: null,
            connected: false,
            iceQueue: [],
          });
          this.connectToController(message.controller_id);
        }
        this.updateControllerList();
        break;

      case "controller-left":
        // Controller disconnected
        Logger.log(`Controller left: ${message.controller_id}`, "connections");
        if (this.controllers.has(message.controller_id)) {
          const controller = this.controllers.get(message.controller_id);
          if (controller.connection) {
            controller.connection.close();
          }
          this.controllers.delete(message.controller_id);
          this.synthClient.controllers.delete(message.controller_id);
          // Clean up ICE diagnostics for this controller
          this.debugInfo.iceDiagnostics.delete(message.controller_id);
          this.debugInfo.connectionPhases.delete(message.controller_id);
          this.debugInfo.dataChannelDiagnostics.delete(message.controller_id);
          this.updateDataChannelDiagnosticsDisplay();
          // Update the RELAY status display
          this.updateIceDiagnosticsDisplay();
        }
        this.updateControllerList();
        break;

      case "answer":
        // Handle WebRTC answer from controller
        // console.log(`[DEBUG] Received answer from ${message.source}`);
        this.updateDebugInfo(
          "error",
          `Received answer from ${message.source.substr(-6)}`,
        );
        this.updateConnectionPhase(
          message.source,
          "answer_received",
          "success",
        );
        const controller = this.controllers.get(message.source);
        if (controller && controller.connection) {
          // console.log(`[DEBUG] Setting remote description for ${message.source}`);
          await controller.connection.setRemoteDescription(message.data);
          this.updateDebugInfo(
            "error",
            `Answer set for ${message.source.substr(-6)}`,
          );

          // Process any queued ICE candidates
          if (controller.iceQueue && controller.iceQueue.length > 0) {
            // console.log(`[DEBUG] Processing ${controller.iceQueue.length} queued ICE candidates`);
            for (const candidate of controller.iceQueue) {
              await controller.connection.addIceCandidate(candidate);
              // Add small delay to avoid overwhelming the connection
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
            controller.iceQueue = [];
          }
        } else {
          // console.log(`[DEBUG] No controller or connection for ${message.source}`);
        }
        break;

      case "ice-candidate":
      case "ice": // Server sends "ice" not "ice-candidate"
        // Handle ICE candidate from controller
        // console.log(`[DEBUG] Received ICE candidate from ${message.source}`);
        const candidateInfo = message.data.candidate || "";
        const candidateType = candidateInfo.includes("relay")
          ? "RELAY"
          : candidateInfo.includes("srflx")
            ? "SRFLX"
            : candidateInfo.includes("host")
              ? "HOST"
              : "UNKNOWN";
        this.updateDebugInfo(
          "error",
          `Got ${candidateType} ICE from ${message.source.substr(-6)}`,
        );

        // Track remote candidate types
        const iceDiag = this.debugInfo.iceDiagnostics.get(message.source);
        if (iceDiag) {
          if (!iceDiag.remoteCandidateTypes) {
            iceDiag.remoteCandidateTypes = [];
          }
          if (!iceDiag.remoteCandidateTypes.includes(candidateType)) {
            iceDiag.remoteCandidateTypes.push(candidateType);
          }
          this.updateIceDiagnosticsDisplay();
        }

        this.updateConnectionPhase(
          message.source,
          "ice_candidates_received",
          "success",
        );
        const targetController = this.controllers.get(message.source);
        if (targetController && targetController.connection) {
          try {
            if (targetController.connection.remoteDescription) {
              // console.log(`[DEBUG] Adding ICE candidate immediately`);
              await targetController.connection.addIceCandidate(message.data);
              // Add small delay to avoid overwhelming the connection
              await new Promise((resolve) => setTimeout(resolve, 50));
            } else {
              // Queue ICE candidate until remote description is set
              // console.log(`[DEBUG] Queueing ICE candidate (no remote description yet)`);
              targetController.iceQueue.push(message.data);
            }
          } catch (error) {
            // console.log(`[DEBUG] Error adding ICE candidate: ${error.message}`);
          }
        } else {
          // console.log(`[DEBUG] No controller or connection found for ${message.source}`);
        }
        break;
    }
  }

  async connectToController(controllerId) {
    // console.log(`[DEBUG] connectToController called for: ${controllerId}`);
    this.debugInfo.connectionsAttempted.push(controllerId);
    this.updateDebugInfo(
      "connectionsAttempted",
      this.debugInfo.connectionsAttempted,
    );

    // Initialize ICE diagnostics for this controller
    this.debugInfo.iceDiagnostics.set(controllerId, {
      iceServers: "",
      candidateTypes: [],
      hasRelay: false,
      totalCandidates: 0,
      iceState: "new",
      connectionState: "new",
    });

    const controller = this.controllers.get(controllerId);
    if (!controller) {
      // console.log(`[DEBUG] Controller ${controllerId} not found in map`);
      Logger.log(`Controller ${controllerId} not found in map`, "error");
      this.updateDebugInfo(
        "error",
        `Controller ${controllerId} not found in map`,
      );
      return;
    }

    // Don't reconnect if already connected
    if (
      controller.connected &&
      controller.connection &&
      controller.connection.connectionState === "connected"
    ) {
      // console.log(`[DEBUG] Already connected to controller ${controllerId}`);
      Logger.log(
        `Already connected to controller ${controllerId}`,
        "connections",
      );
      return;
    }

    // Close any existing connection
    if (controller.connection) {
      // console.log(`[DEBUG] Closing existing connection to ${controllerId}`);
      controller.connection.close();
    }

    // console.log(`[DEBUG] Creating new RTCPeerConnection for ${controllerId}`);
    // Initiating connection to controller

    try {
      // Log the ICE servers being used
      const iceServersInfo = this.rtcConfig.iceServers
        .map((s) => {
          if (typeof s.urls === "string") {
            return s.urls.startsWith("turn:") ? "TURN" : "STUN";
          } else if (Array.isArray(s.urls)) {
            return s.urls.some((u) => u.startsWith("turn:")) ? "TURN" : "STUN";
          }
          return "UNKNOWN";
        })
        .join(", ");

      this.updateDebugInfo("error", `Using ICE: ${iceServersInfo}`);
      this.updateConnectionPhase(
        controllerId,
        "ice_servers_loaded",
        iceServersInfo.includes("TURN") ? "success" : "failed",
      );

      // Update ICE diagnostics
      const iceDiag = this.debugInfo.iceDiagnostics.get(controllerId);
      if (iceDiag) {
        iceDiag.iceServers = iceServersInfo;
        this.updateIceDiagnosticsDisplay();
      }

      const pc = new RTCPeerConnection(this.rtcConfig);
      controller.connection = pc;

      // Create unified data channel
      const dataChannel = pc.createDataChannel("data", {
        ordered: true,
      });
      controller.channel = dataChannel;

      // Initialize and track data channel diagnostics
      const channelDiag = {
        readyState: dataChannel.readyState,
        bufferedAmount: dataChannel.bufferedAmount,
        lastError: null,
      };
      this.debugInfo.dataChannelDiagnostics.set(controllerId, channelDiag);
      this.updateDataChannelDiagnosticsDisplay();

      dataChannel.addEventListener("open", () => {
        // Update diagnostics
        channelDiag.readyState = dataChannel.readyState;
        this.updateDataChannelDiagnosticsDisplay();

        // console.log(`[DEBUG] Data channel OPENED to controller ${controllerId}`);
        // Data channel open to controller
        controller.connected = true;
        this.updateConnectionPhase(
          controllerId,
          "connection_established",
          "success",
        );

        // Add to SynthClient's controllers with data channel reference
        this.synthClient.controllers.set(controllerId, {
          ...controller,
          dataChannel: dataChannel,
        });

        this.updateControllerList();

        // Send immediate state update
        dataChannel.send(
          JSON.stringify({
            type: "pong",
            timestamp: Date.now(),
            state: this.getSynthState(),
          }),
        );

        // No need to request program - controller will push automatically
      });

      dataChannel.addEventListener("message", (event) => {
        this.handleDataChannelMessage(controllerId, JSON.parse(event.data));
      });

      dataChannel.addEventListener("error", (error) => {
        Logger.log(`Data channel error for ${controllerId}: ${error}`, "error");
        channelDiag.lastError = error.message || "Unknown error";
        channelDiag.readyState = dataChannel.readyState;
        this.updateDataChannelDiagnosticsDisplay();
      });

      dataChannel.addEventListener("close", () => {
        // Update diagnostics before removing
        channelDiag.readyState = dataChannel.readyState;
        this.updateDataChannelDiagnosticsDisplay();

        // Data channel closed to controller
        controller.connected = false;

        // Remove from SynthClient's controllers
        this.synthClient.controllers.delete(controllerId);

        // Clean up ICE diagnostics when data channel closes
        this.debugInfo.iceDiagnostics.delete(controllerId);
        this.debugInfo.connectionPhases.delete(controllerId);
        this.debugInfo.dataChannelDiagnostics.delete(controllerId);
        this.updateDataChannelDiagnosticsDisplay();
        this.updateIceDiagnosticsDisplay();

        this.updateControllerList();
      });

      // Track candidate types
      let hasRelay = false;
      let candidateCount = 0;

      // Handle ICE candidates
      pc.addEventListener("icecandidate", (event) => {
        if (event.candidate) {
          candidateCount++;
          // Log candidate type
          const candidateType = event.candidate.candidate.includes("relay")
            ? "RELAY"
            : event.candidate.candidate.includes("srflx")
              ? "SRFLX"
              : event.candidate.candidate.includes("host")
                ? "HOST"
                : "OTHER";

          if (candidateType === "RELAY") {
            hasRelay = true;
          }

          // Update ICE diagnostics
          const iceDiag = this.debugInfo.iceDiagnostics.get(controllerId);
          if (iceDiag) {
            if (!iceDiag.candidateTypes.includes(candidateType)) {
              iceDiag.candidateTypes.push(candidateType);
            }
            iceDiag.totalCandidates = candidateCount;
            iceDiag.hasRelay = hasRelay;
            this.updateIceDiagnosticsDisplay();
          }

          this.updateDebugInfo(
            "error",
            `Generated ${candidateType} candidate (#${candidateCount})`,
          );

          // Update relay status immediately when RELAY candidate is generated
          if (candidateType === "RELAY") {
            this.updateRelayStatusDisplay();
          }

          this.sendMessage({
            type: "ice-candidate",
            source: this.synthId,
            target: controllerId,
            data: event.candidate,
          });

          this.updateConnectionPhase(
            controllerId,
            "ice_candidates_sent",
            "success",
          );
        } else {
          this.updateDebugInfo(
            "error",
            `ICE gathering complete - ${candidateCount} candidates, RELAY: ${hasRelay ? "YES" : "NO"}`,
          );
          this.updateConnectionPhase(
            controllerId,
            "ice_gathering",
            hasRelay ? "success" : "failed",
          );
        }
      });

      // Track ICE gathering state
      pc.addEventListener("icegatheringstatechange", () => {
        this.updateDebugInfo("error", `ICE gathering: ${pc.iceGatheringState}`);
      });

      // Track ICE connection state
      pc.addEventListener("iceconnectionstatechange", () => {
        this.updateDebugInfo(
          "error",
          `ICE connection to ${controllerId.substr(-6)}: ${pc.iceConnectionState}`,
        );

        // Update ICE diagnostics
        const iceDiag = this.debugInfo.iceDiagnostics.get(controllerId);
        if (iceDiag) {
          iceDiag.iceState = pc.iceConnectionState;
          this.updateIceDiagnosticsDisplay();
        }

        if (pc.iceConnectionState === "checking") {
          this.updateDebugInfo("error", `Checking connectivity...`);
        } else if (pc.iceConnectionState === "connected") {
          this.updateDebugInfo(
            "error",
            `ICE connected! Waiting for data channel...`,
          );
        } else if (pc.iceConnectionState === "failed") {
          this.updateDebugInfo("error", `ICE failed - checking stats...`);

          // Get detailed connection stats
          pc.getStats().then((stats) => {
            let candidatePairs = [];
            let localCandidates = new Map();
            let remoteCandidates = new Map();

            stats.forEach((report) => {
              if (report.type === "local-candidate") {
                localCandidates.set(report.id, report);
              } else if (report.type === "remote-candidate") {
                remoteCandidates.set(report.id, report);
              } else if (report.type === "candidate-pair") {
                candidatePairs.push(report);
              }
            });

            // Update ICE diagnostics with failure details
            const iceDiag = this.debugInfo.iceDiagnostics.get(controllerId);
            if (iceDiag) {
              iceDiag.failureDetails = {
                totalPairs: candidatePairs.length,
                succeededPairs: candidatePairs.filter(
                  (p) => p.state === "succeeded",
                ).length,
                failedPairs: candidatePairs.filter((p) => p.state === "failed")
                  .length,
              };

              // Check if any RELAY pairs were attempted
              let relayPairsAttempted = 0;
              candidatePairs.forEach((pair) => {
                const local = localCandidates.get(pair.localCandidateId);
                const remote = remoteCandidates.get(pair.remoteCandidateId);
                if (local && local.candidateType === "relay") {
                  relayPairsAttempted++;
                }
              });

              iceDiag.failureDetails.relayPairsAttempted = relayPairsAttempted;

              // Add specific failure reason based on the stats
              if (
                relayPairsAttempted > 0 &&
                iceDiag.failureDetails.succeededPairs === 0
              ) {
                iceDiag.failureDetails.likelyReason =
                  "TURN auth failed or server unreachable";
              } else if (relayPairsAttempted === 0) {
                iceDiag.failureDetails.likelyReason =
                  "No TURN candidates could connect";
              }

              this.updateIceDiagnosticsDisplay();
            }
          });
        }
      });

      // Handle connection state changes
      pc.addEventListener("connectionstatechange", () => {
        Logger.log(
          `Connection state to ${controllerId}: ${pc.connectionState}`,
          "connections",
        );
        this.debugInfo.iceStates.set(controllerId, pc.connectionState);
        this.updateDebugInfo("iceStates", this.debugInfo.iceStates);

        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected"
        ) {
          controller.connected = false;
          this.updateControllerList();
          this.updateDebugInfo(
            "error",
            `Connection to ${controllerId} ${pc.connectionState}`,
          );
          this.updateConnectionPhase(
            controllerId,
            "connection_established",
            "failed",
          );
          // Clean up ICE diagnostics for failed connection
          if (pc.connectionState === "failed") {
            this.debugInfo.iceDiagnostics.delete(controllerId);
            this.debugInfo.connectionPhases.delete(controllerId);
            this.debugInfo.dataChannelDiagnostics.delete(controllerId);
            this.updateDataChannelDiagnosticsDisplay();
            this.updateIceDiagnosticsDisplay();
          }
        }
      });

      // Small delay to ensure controller is ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Create and send offer
      // console.log(`[DEBUG] Creating WebRTC offer for ${controllerId}`);

      // HACK: Add a no-op icecandidate listener before creating the offer.
      // This is a known workaround for a race condition in some browser WebRTC
      // implementations that can prevent the data channel from being negotiated correctly.
      pc.addEventListener("icecandidate", () => {});

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Log offer SDP to check if TURN is in the offer
      const sdpLines = offer.sdp.split("\n");
      const hasTurnInSdp = sdpLines.some((line) => line.includes("relay"));

      // Check if data channel is in SDP
      const hasDataChannel = sdpLines.some((line) =>
        line.includes("m=application"),
      );
      const sctpLines = sdpLines.filter((line) => line.includes("sctp"));
      console.log(`[WEBRTC-CRITICAL] Offer SDP analysis for ${controllerId}:
        - Has data channel (m=application): ${hasDataChannel}
        - SCTP lines found: ${sctpLines.length}
        - SCTP content: ${sctpLines.join("; ")}
        - Data channel state before offer: ${dataChannel.readyState}`);
      this.updateDebugInfo(
        "error",
        `Created offer for ${controllerId.substr(-6)} - TURN in SDP: ${hasTurnInSdp}`,
      );
      this.updateConnectionPhase(controllerId, "offer_created", "success");

      const offerMessage = {
        type: "offer",
        source: this.synthId,
        target: controllerId,
        data: offer,
      };
      // console.log(`[DEBUG] Sending offer to ${controllerId}:`, offerMessage);
      this.sendMessage(offerMessage);
      this.updateDebugInfo("error", `Sent offer to ${controllerId.substr(-6)}`);
      this.updateConnectionPhase(controllerId, "offer_sent", "success");
    } catch (error) {
      Logger.log(
        `Failed to connect to controller ${controllerId}: ${error.message}`,
        "error",
      );
      this.updateDebugInfo("error", `Failed to connect: ${error.message}`);
      controller.connected = false;
      this.updateControllerList();
    }
  }

  handleDataChannelMessage(controllerId, message) {
    // Validate message before processing
    try {
      validateMessage(message);
    } catch (error) {
      Logger.log(
        `Invalid message from ${controllerId}: ${error.message}`,
        "error",
      );
      Logger.log("[ERROR] Invalid message:", message, error, "error");
      return;
    }

    switch (message.type) {
      case MessageTypes.PING:
        // Respond to ping immediately, as per documentation
        const pongMessage = MessageBuilders.pong(
          message.timestamp,
          this.getSynthState(),
        );
        const controller = this.controllers.get(controllerId);
        if (
          controller &&
          controller.channel &&
          controller.channel.readyState === "open"
        ) {
          controller.channel.send(JSON.stringify(pongMessage));
          if (window.Logger) {
            window.Logger.log(
              `Responded to ping from ${controllerId}`,
              "messages",
            );
          }
        }
        break;
      case MessageTypes.PING: {
        // Respond to ping immediately, as per documentation
        const pingResponse = MessageBuilders.pong(
          message.timestamp,
          this.getSynthState(),
        );
        const controller = this.controllers.get(controllerId);
        if (
          controller &&
          controller.channel &&
          controller.channel.readyState === "open"
        ) {
          controller.channel.send(JSON.stringify(pingResponse));
          if (window.Logger) {
            window.Logger.log(
              `Responded to ping from ${controllerId}`,
              "messages",
            );
          }
        }
        break;
      }
      case MessageTypes.PROGRAM:
        // Receive program from controller
        Logger.log(`"[DEBUG] Received program message:", message`, "messages");
        Logger.log(
          `"[DEBUG] Program has parts:", !!message.program?.parts`,
          "messages",
        );
        Logger.log(
          `"[DEBUG] Program parts:", message.program?.parts`,
          "messages",
        );

        // Use SynthClient to handle complete program message
        this.synthClient.handleProgram(message);
        break;

      case MessageTypes.COMMAND:
        // Handle commands
        Logger.log(`"[DEBUG] Received command:", message`, "messages");

        if (message.name === "power") {
          // Handle power on/off
          const powerOn = message.value;
          Logger.log(`[DEBUG] Setting power to: ${powerOn}`, "parameters");
          this.synthClient.setPower(powerOn);
        } else if (message.name === "volume") {
          // Handle volume parameter from Arc
          Logger.log(
            `[DEBUG] Setting volume to: ${message.value}`,
            "parameters",
          );
          this.synthClient.setVolume(message.value);
        } else if (message.name === "brightness") {
          // Handle brightness parameter from Arc
          Logger.log(
            `[DEBUG] Setting brightness to: ${message.value}`,
            "parameters",
          );
          this.synthClient.setBrightness(message.value);
        } else if (message.name === "detune") {
          // Handle detune parameter from Arc
          Logger.log(
            `[DEBUG] Setting detune to: ${message.value}`,
            "parameters",
          );
          this.synthClient.setDetune(message.value);
        } else if (message.name === "reverb") {
          // Handle reverb parameter from Arc
          Logger.log(
            `[DEBUG] Setting reverb to: ${message.value}`,
            "parameters",
          );
          this.synthClient.setReverb(message.value);
        }
        break;

      case MessageTypes.SAVE_TO_BANK:
        // TODO: Implement bank saving
        break;

      case MessageTypes.LOAD_FROM_BANK:
        // TODO: Implement bank loading
        break;

      default:
        // Handle legacy message types for backward compatibility
        if (message.type === "ping") {
          // Legacy ping format
          const controller = this.controllers.get(controllerId);
          if (
            controller &&
            controller.channel &&
            controller.channel.readyState === "open"
          ) {
            const pongMessage = MessageBuilders.pong(
              message.timestamp,
              this.getSynthState(),
            );
            controller.channel.send(JSON.stringify(pongMessage));
          }
        } else {
          Logger.log(`Unknown message type: ${message.type}`, "warn");
        }
        break;
    }
  }

  sendMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // console.log(`[DEBUG] Sending WebSocket message:`, message);
      this.ws.send(JSON.stringify(message));
    } else {
      // console.log(`[DEBUG] Cannot send message, WebSocket not open. State:`, this.ws?.readyState);
    }
  }

  sendStateToController(controllerId) {
    const controller = this.controllers.get(controllerId);
    if (
      controller &&
      controller.channel &&
      controller.channel.readyState === "open"
    ) {
      controller.channel.send(
        JSON.stringify({
          type: "state",
          timestamp: Date.now(),
          state: this.getSynthState(),
        }),
      );
    }
  }

  getSynthState() {
    const clientState = this.synthClient.getState();
    return {
      synthId: this.synthId,
      isCalibrating: clientState.isCalibrating,
      isPowered: clientState.isPoweredOn,
      hasProgram: clientState.isActive,
      audioContextState: this.audioContext ? this.audioContext.state : "none",
      // These are the fields expected by the controller for UI indicators
      audio_enabled:
        clientState.audioInitialized &&
        this.audioContext &&
        this.audioContext.state === "running",
      joined: this.hasJoinedInstrument,
    };
  }

  broadcastStateUpdate() {
    // Send state update to all connected controllers
    const state = this.getSynthState();
    const stateMessage = {
      type: "state_update",
      state: state,
    };

    this.controllers.forEach((controller, controllerId) => {
      if (
        controller.connected &&
        controller.channel &&
        controller.channel.readyState === "open"
      ) {
        controller.channel.send(JSON.stringify(stateMessage));
        Logger.log(
          `State update sent to controller ${controllerId}`,
          "messages",
        );
      }
    });
  }

  setupUI() {
    // Calibration button handler
    if (this.calibrationButton) {
      this.calibrationButton.addEventListener("click", () =>
        this.startCalibration(),
      );
    }

    // Join button handler
    if (this.joinButton) {
      this.joinButton.addEventListener("click", () => this.joinInstrument());
    }
  }

  async startCalibration() {
    // Initialize audio context and start calibration
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      await this.synthClient.initializeAudio(this.audioContext);

      // Connect visualizer to the analyser
      if (this.visualizer && this.synthClient.analyser) {
        this.visualizer.setAnalyserNode(this.synthClient.analyser);
      }
    }

    // Start calibration via SynthClient
    await this.synthClient.startCalibration(0.7);

    // Update UI
    if (this.calibrationContent) {
      this.calibrationContent.style.display = "none";
    }
    if (this.joinPhase) {
      this.joinPhase.style.display = "block";
    }

    Logger.log("Started calibration", "lifecycle");

    // Send state update to notify controllers that audio is enabled
    this.broadcastStateUpdate();
  }

  async joinInstrument() {
    if (!this.synthClient.audioInitialized) {
      Logger.log("SynthClient not initialized", "error");
      return;
    }

    // End calibration and set power
    this.synthClient.endCalibration();
    this.synthClient.setPower(true);

    // Set joined flag
    this.hasJoinedInstrument = true;

    // Controllers will push programs automatically

    // Hide calibration UI
    if (this.calibrationPhase) {
      this.calibrationPhase.style.display = "none";
    }

    // Update visualizer
    if (this.canvas) {
      this.canvas.classList.remove("dimmed");
    }

    Logger.log("Joined instrument", "lifecycle");

    // Send state update to all connected controllers
    this.broadcastStateUpdate();

    // Request wake lock
    this.requestWakeLock();
  }

  async requestWakeLock() {
    if ("wakeLock" in navigator) {
      try {
        const wakeLock = await navigator.wakeLock.request("screen");
        Logger.log("Wake lock acquired", "lifecycle");

        // Show wake lock status
        const wakeLockStatus = document.getElementById("wake-lock-status");
        if (wakeLockStatus) {
          wakeLockStatus.style.display = "block";
        }
      } catch (err) {
        Logger.log(`Wake lock failed: ${err.message}`, "error");
      }
    }
  }

  updateStatus(text) {
    if (this.statusEl) {
      this.statusEl.textContent = text;
    }
  }

  updateControllerList() {
    const controllerListEl = document.getElementById("controller_list");
    if (!controllerListEl) return;

    // console.log("[DEBUG] updateControllerList called");
    // console.log("[DEBUG] All controllers:", Array.from(this.controllers.entries()).map(([id, c]) => ({
    //   id,
    //   connected: c.connected,
    //   hasConnection: !!c.connection,
    //   connectionState: c.connection?.connectionState
    // })));

    const connectedControllers = Array.from(this.controllers.values())
      .filter((c) => c.connected)
      .map((c) => c.id);

    // console.log("[DEBUG] Connected controllers:", connectedControllers);

    if (connectedControllers.length === 0) {
      controllerListEl.textContent = "None";
      controllerListEl.style.color = "#64748b";
    } else {
      controllerListEl.textContent = connectedControllers.join(", ");
      controllerListEl.style.color = "#60a5fa";
    }
  }

  // Visualizer is now handled by WaveformVisualizer module

  setupDebugMode() {
    let tapCount = 0;
    let tapTimer;

    // Info button handler
    const infoButton = document.getElementById("info-button");
    if (infoButton) {
      infoButton.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent triggering triple-tap
        const debugEl = document.getElementById("debug-info");
        if (debugEl) {
          debugEl.style.display =
            debugEl.style.display === "none" ? "block" : "none";
          if (debugEl.style.display === "block") {
            this.updateDebugDisplay();
          }
          // Update button text
          infoButton.textContent =
            debugEl.style.display === "none" ? "ℹ️ Info" : "❌ Close";
        }
      });
    }

    // Keep triple-tap as alternative method
    document.addEventListener("click", (e) => {
      // Ignore clicks on the info button
      if (e.target.id === "info-button") return;

      tapCount++;
      clearTimeout(tapTimer);

      if (tapCount >= 3) {
        // Toggle debug mode
        const debugEl = document.getElementById("debug-info");
        if (debugEl) {
          debugEl.style.display =
            debugEl.style.display === "none" ? "block" : "none";
          if (debugEl.style.display === "block") {
            this.updateDebugDisplay();
          }
          // Update button text if it exists
          if (infoButton) {
            infoButton.textContent =
              debugEl.style.display === "none" ? "ℹ️ Info" : "❌ Close";
          }
        }
        tapCount = 0;
      }

      tapTimer = setTimeout(() => {
        tapCount = 0;
      }, 500);
    });
  }

  updateDebugInfo(key, value) {
    if (key === "error") {
      this.debugInfo.errors.push(
        `${new Date().toLocaleTimeString()}: ${value}`,
      );
      if (this.debugInfo.errors.length > 5) {
        this.debugInfo.errors.shift();
      }
    } else {
      this.debugInfo[key] = value;
    }

    // Update display if visible
    const debugEl = document.getElementById("debug-info");
    if (debugEl && debugEl.style.display !== "none") {
      this.updateDebugDisplay();
    }
  }

  updateConnectionPhase(controllerId, phase, status = "pending") {
    if (!this.debugInfo.connectionPhases.has(controllerId)) {
      this.debugInfo.connectionPhases.set(controllerId, new Map());
    }

    const phases = this.debugInfo.connectionPhases.get(controllerId);
    phases.set(phase, status);

    // Update display if visible
    const debugEl = document.getElementById("debug-info");
    if (debugEl && debugEl.style.display !== "none") {
      this.updateDebugDisplay();
    }
  }

  updateIceDiagnosticsDisplay() {
    const iceInfo = document.getElementById("ice-info");
    if (!iceInfo) return;

    let html = "";
    for (const [controllerId, diag] of this.debugInfo.iceDiagnostics) {
      // Determine RELAY status color and icon
      const relayStatus = diag.hasRelay
        ? '<span style="color: #22c55e; font-size: 18px;">✅ YES</span>'
        : '<span style="color: #ef4444; font-size: 18px;">❌ NO</span>';

      const remoteRelayStatus =
        diag.remoteCandidateTypes && diag.remoteCandidateTypes.includes("RELAY")
          ? '<span style="color: #22c55e;">✅</span>'
          : '<span style="color: #ef4444;">❌</span>';

      html += `<div style="margin-bottom: 12px; padding: 10px; background: #f8f9fa; border-radius: 6px; border: 2px solid ${diag.hasRelay ? "#22c55e" : "#ef4444"};">`;
      html += `<div style="font-weight: bold; font-size: 16px; margin-bottom: 8px;">Controller ${controllerId.substr(-6)}:</div>`;

      // Prominent RELAY status
      html += `<div style="font-size: 14px; font-weight: bold; margin-bottom: 6px;">`;
      html += `LOCAL RELAY: ${relayStatus}`;
      html += `</div>`;

      html += `<div style="font-size: 12px; color: #666;">`;
      html += `<div>ICE Servers: ${diag.iceServers}</div>`;
      html += `<div>Local candidates: ${diag.totalCandidates} (${diag.candidateTypes.join(", ") || "none"})</div>`;
      html += `<div>Remote RELAY: ${remoteRelayStatus} ${diag.remoteCandidateTypes ? diag.remoteCandidateTypes.join(", ") : "waiting..."}</div>`;
      html += `<div>Connection: ${diag.iceState}</div>`;
      html += `</div>`;

      if (diag.failureDetails) {
        html += `<div style="margin-top: 6px; padding: 6px; background: #fee; border-radius: 4px; font-size: 11px;">`;
        html += `<div style="font-weight: bold; color: #ef4444;">Connection Failed:</div>`;
        html += `<div>- Pairs tried: ${diag.failureDetails.totalPairs}</div>`;
        html += `<div>- RELAY pairs: ${diag.failureDetails.relayPairsAttempted}</div>`;
        if (diag.failureDetails.likelyReason) {
          html += `<div>- ${diag.failureDetails.likelyReason}</div>`;
        }
        html += `</div>`;
      }

      html += `</div>`;
    }

    iceInfo.innerHTML =
      html ||
      '<div style="padding: 10px; text-align: center; color: #666;">No controllers connected yet</div>';

    // Also update the main error display with RELAY status
    this.updateRelayStatusDisplay();
  }

  updateDataChannelDiagnosticsDisplay() {
    const dcInfo = document.getElementById("data-channel-info");
    if (!dcInfo) return;

    let html = "";
    if (this.debugInfo.dataChannelDiagnostics.size === 0) {
      html = "<div>No data channels to monitor</div>";
    } else {
      for (const [controllerId, diag] of this.debugInfo
        .dataChannelDiagnostics) {
        const stateColor =
          diag.readyState === "open"
            ? "#22c55e"
            : diag.readyState === "connecting"
              ? "#f59e0b"
              : "#ef4444";

        html += `<div style="margin-bottom: 8px;">`;
        html += `<div style="font-weight: bold;">Controller ${controllerId.substr(
          -6,
        )}:</div>`;
        html += `<div>State: <span style="color: ${stateColor}; font-weight: bold;">${diag.readyState.toUpperCase()}</span></div>`;
        html += `<div>Buffered Amount: ${diag.bufferedAmount} bytes</div>`;
        if (diag.lastError) {
          html += `<div style="color: #ef4444;">Last Error: ${diag.lastError}</div>`;
        }
        html += `</div>`;
      }
    }
    dcInfo.innerHTML = html;
  }

  updateDebugDisplay() {
    const debugContent = document.getElementById("debug-content");
    const phaseList = document.getElementById("phase-list");
    if (!debugContent) return;

    const html = `
      <div style="margin-bottom: 5px"><b>Debug Info</b></div>
      <div>Synth ID: ${this.synthId.substr(-6)}</div>
      <div>WS State: ${this.debugInfo.wsState}</div>
      <div>Controllers Received: ${this.debugInfo.controllersReceived.length > 0 ? this.debugInfo.controllersReceived.join(", ") : "none"}</div>
      <div>Connections Attempted: ${this.debugInfo.connectionsAttempted.length}</div>
      <div>Active Controllers: ${Array.from(this.controllers.values()).filter((c) => c.connected).length}</div>
    `;

    debugContent.innerHTML = html;

    // Update connection phases
    if (phaseList) {
      let phasesHtml = "";

      for (const [controllerId, phases] of this.debugInfo.connectionPhases) {
        phasesHtml += `<div style="margin-bottom: 10px;">`;
        phasesHtml += `<div style="font-weight: bold; margin-bottom: 5px;">Controller ${controllerId.substr(-6)}:</div>`;

        const phaseOrder = [
          "discovered",
          "ice_servers_loaded",
          "offer_created",
          "offer_sent",
          "answer_received",
          "ice_gathering",
          "ice_candidates_sent",
          "ice_candidates_received",
          "connection_established",
        ];

        for (const phaseName of phaseOrder) {
          const status = phases.get(phaseName) || "pending";
          const icon =
            status === "success" ? "✅" : status === "failed" ? "❌" : "⏳";
          const color =
            status === "success"
              ? "#4ade80"
              : status === "failed"
                ? "#ef4444"
                : "#94a3b8";

          phasesHtml += `<div style="font-size: 11px; margin-left: 10px; color: ${color};">`;
          phasesHtml += `${icon} ${phaseName.replace(/_/g, " ")}`;
          phasesHtml += `</div>`;
        }

        phasesHtml += `</div>`;
      }

      phaseList.innerHTML =
        phasesHtml ||
        '<div style="color: #94a3b8;">No connection attempts yet</div>';
    }
  }

  updateRelayStatusDisplay() {
    // Create or update a persistent RELAY status display
    let relayStatusEl = document.getElementById("relay-status-display");
    if (!relayStatusEl) {
      relayStatusEl = document.createElement("div");
      relayStatusEl.id = "relay-status-display";
      relayStatusEl.style.cssText = `
          position: fixed;
          top: 60px;
          right: 20px;
          background: rgba(51, 51, 51, 0.8);
          color: #f0f0f0;
          padding: 10px;
          border-radius: 4px;
          font-size: 13px;
          z-index: 10;
          min-width: 180px;
        `;
      document.body.appendChild(relayStatusEl);
    }

    let hasAnyRelay = false;
    let connectedCount = 0;
    let relayCount = 0;

    for (const [controllerId, diag] of this.debugInfo.iceDiagnostics) {
      connectedCount++;
      if (diag.hasRelay) {
        hasAnyRelay = true;
        relayCount++;
      }
    }

    if (connectedCount === 0) {
      relayStatusEl.innerHTML = `
          <div>
            <span style="color: #64748b;">RELAY: </span>
            <span style="color: #64748b;">Waiting...</span>
          </div>
        `;
      relayStatusEl.style.border = "none";
    } else {
      const allHaveRelay = connectedCount === relayCount;
      const statusIcon = allHaveRelay ? "✅" : relayCount > 0 ? "⚠️" : "❌";
      const statusColor = allHaveRelay
        ? "#22c55e"
        : relayCount > 0
          ? "#f59e0b"
          : "#ef4444";

      relayStatusEl.innerHTML = `
          <div>
            <span>RELAY: </span>
            <span style="color: ${statusColor};">${statusIcon} ${relayCount}/${connectedCount}</span>
            ${!allHaveRelay ? '<span style="font-size: 11px; color: #fbbf24; margin-left: 5px;">(Remote may fail)</span>' : ""}
          </div>
        `;
      relayStatusEl.style.border = "none";
    }
  }
}

// Initialize on load
const synthApp = new SynthApp();

// Wait for DOM to be ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => synthApp.init());
} else {
  synthApp.init();
}

// Export for debugging
window.synthApp = synthApp;

// Add debug functions
window.debugSynth = {
  showControllers: () => {
    Logger.log("[DEBUG] Current controllers:", "debug");
    synthApp.controllers.forEach((controller, id) => {
      Logger.log(
        `  ${id}: connected=${controller.connected}, state=${controller.connection?.connectionState}`,
        "lifecycle",
      );
    });
  },

  requestControllers: () => {
    Logger.log("[DEBUG] Manually requesting controllers list", "debug");
    if (synthApp.ws && synthApp.ws.readyState === WebSocket.OPEN) {
      synthApp.ws.send(
        JSON.stringify({
          type: "request-controllers",
          source: synthApp.synthId,
        }),
      );
    } else {
      Logger.log("[DEBUG] WebSocket not connected", "connections");
    }
  },

  showCanvasInfo: () => {
    Logger.log("[DEBUG] Canvas info:", "debug");
    Logger.log(`"  Element:", synthApp.canvas`, "lifecycle");
    Logger.log(`"  Visualizer:", synthApp.visualizer`, "lifecycle");
    Logger.log(
      `"  Dimensions:", synthApp.canvas?.width, "x", synthApp.canvas?.height`,
      "lifecycle",
    );
    Logger.log(`"  Class:", synthApp.canvas?.className`, "lifecycle");
    Logger.log(
      `"  Computed style opacity:", window.getComputedStyle(synthApp.canvas).opacity`,
      "lifecycle",
    );
  },
};
