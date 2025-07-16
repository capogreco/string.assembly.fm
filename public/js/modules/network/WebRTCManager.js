/**
 * WebRTCManager Module for String Assembly FM
 * Handles WebRTC peer-to-peer connections between controller and synths
 */

import { eventBus } from "../core/EventBus.js";
import { SystemConfig } from "../../config/system.config.js";
import { MessageTypes } from "../../protocol/MessageProtocol.js";

export class WebRTCManager {
  constructor(
    rtcConfig = SystemConfig.network.webrtc,
    eventBusInstance = eventBus,
  ) {
    // Don't store rtcConfig - use Config.RTC_CONFIG directly to get updates
    this.eventBus = eventBusInstance;
    this.peers = new Map();
    this.pendingOffers = new Map();
    this.isInitialized = false;
    this.isReady = false; // Ready state flag
    this.clientId = null; // Will be set during initialization
    this.enableDiagnosticLogs = false; // Set to true to enable WEBRTC-DIAG logs
  }

  /**
   * Initialize WebRTC manager
   */
  initialize() {
    if (this.isInitialized) {
      if (window.Logger) {
        window.Logger.log("WebRTCManager already initialized", "lifecycle");
      }
      return;
    }

    // Get clientId from WebSocketManager
    if (window.webSocketManager && window.webSocketManager.clientId) {
      this.clientId = window.webSocketManager.clientId;
      if (this.enableDiagnosticLogs)
        console.log(
          `[WEBRTC-DIAG] WebRTCManager initialized with clientId: ${this.clientId}`,
        );
    }

    // WebRTCManager.initialize() called

    // Listen for WebSocket messages that trigger WebRTC operations
    // Setting up websocket:message listener
    this.eventBus.on("websocket:message", (data) => {
      if (window.Logger) {
        window.Logger.log(
          `WebRTCManager received websocket:message event: ${data.message.type}`,
          "messages",
        );
      }
      this.handleWebSocketMessage(data.message);
    });

    this.isInitialized = true;
    this.isReady = true; // Set ready state after initialization

    if (window.Logger) {
      window.Logger.log(
        "WebRTC Manager initialized - event listener attached",
        "connections",
      );
    }
  }

  /**
   * Create a new peer connection
   * @param {string} peerId - Unique peer identifier
   * @param {boolean} isInitiator - Whether this peer initiates the connection
   * @returns {RTCPeerConnection} The created peer connection
   */
  createPeerConnection(peerId, isInitiator = false) {
    if (this.peers.has(peerId)) {
      const existingPeerData = this.peers.get(peerId);
      const existingPc = existingPeerData.connection;

      // Check if the existing connection is in a failed or closed state
      if (
        existingPc.connectionState === "failed" ||
        existingPc.connectionState === "closed" ||
        existingPc.iceConnectionState === "failed" ||
        existingPc.iceConnectionState === "closed"
      ) {
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DIAG] Peer ${peerId}: Existing connection is in ${existingPc.connectionState}/${existingPc.iceConnectionState} state. Closing and creating new connection.`,
          );

        // Clean up the old connection
        existingPc.close();
        this.peers.delete(peerId);

        // Fall through to create a new connection
      } else if (existingPc.signalingState !== "stable") {
        if (this.enableDiagnosticLogs)
          console.warn(
            `[WEBRTC-DIAG] Peer ${peerId}: Existing connection in unstable signaling state: ${existingPc.signalingState}. Creating new connection.`,
          );

        // Close the existing connection in non-stable state
        existingPc.close();
        this.peers.delete(peerId);

        // Fall through to create a new connection
      } else {
        // Connection exists and is in good state, return it
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DIAG] Peer ${peerId}: Returning existing RTCPeerConnection. SignalingState: ${existingPc.signalingState}`,
          );

        if (window.Logger) {
          window.Logger.log(
            `Peer connection already exists for ${peerId} in ${existingPc.connectionState} state`,
            "connections",
          );
        }

        return existingPc;
      }
    }
    // Always use the latest RTC configuration
    const currentConfig = { ...SystemConfig.network.webrtc };
    if (this.enableDiagnosticLogs)
      console.log(
        `[WEBRTC-DIAG] Peer ${peerId}: Creating new RTCPeerConnection at ${new Date().toISOString()}. Config:`,
        JSON.stringify(currentConfig, null, 2),
      );

    // Validate ICE servers before creating connection
    if (!currentConfig.iceServers || currentConfig.iceServers.length === 0) {
      if (this.enableDiagnosticLogs)
        console.error(
          `[WEBRTC-DIAG] Peer ${peerId}: WARNING - No ICE servers configured! Using fallback STUN server.`,
        );
      currentConfig.iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
    }

    const pc = new RTCPeerConnection({ 
      iceServers: currentConfig.iceServers 
    });

    // Set peerId for SDP logging
    if (pc.peerId !== undefined) {
      pc.peerId = peerId;
    }
    if (this.enableDiagnosticLogs)
      console.log(
        `[WEBRTC-DIAG] Peer ${peerId}: New RTCPeerConnection created. Initial SignalingState: ${pc.signalingState}`,
      );

    const peerData = {
      connection: pc,
      peerId,
      isInitiator,
      paramChannel: null,
      commandChannel: null,
      latency: null,
      lastPing: null,
      state: null,
      createdAt: Date.now(),
      iceCandidateQueue: [], // Initialize ICE candidate queue
      connectionTimeout: null, // Add timeout tracking
      offerCreatedAt: null, // Track when offer was created
      iceCandidateStats: {
        // Track ICE candidate statistics
        localCandidates: { host: 0, srflx: 0, relay: 0, other: 0 },
        remoteCandidates: { host: 0, srflx: 0, relay: 0, other: 0 },
        hasLocalRelay: false,
        hasRemoteRelay: false,
        totalLocalCandidates: 0,
        totalRemoteCandidates: 0,
      },
    };

    this.peers.set(peerId, peerData);

    // Debug: Confirming setupPeerEventListeners is about to be called
    if (window.Logger) {
      window.Logger.log(
        `[WEBRTC-DEBUG] About to call setupPeerEventListeners for ${peerId}`,
        "connections",
      );
    }
    if (this.enableDiagnosticLogs)
      console.log(
        `[WEBRTC-DEBUG] About to call setupPeerEventListeners for ${peerId}`,
      );

    // Set up connection event listeners
    this.setupPeerEventListeners(pc, peerId, peerData);

    if (window.Logger) {
      window.Logger.log(
        `Created peer connection for ${peerId} (initiator: ${isInitiator})`,
        "connections",
      );
    }

    // Set up connection timeout (30 seconds)
    peerData.connectionTimeout = setTimeout(() => {
      if (
        pc.connectionState !== "connected" &&
        pc.connectionState !== "completed"
      ) {
        if (this.enableDiagnosticLogs)
          console.error(
            `[WEBRTC-DIAG] Peer ${peerId}: Connection timeout after 30s. State: ${pc.connectionState}, ICE: ${pc.iceConnectionState}`,
          );
        this.handlePeerDisconnection(peerId);
      }
    }, 30000);

    // Emit peer created event
    this.eventBus.emit("webrtc:peerCreated", {
      peerId,
      isInitiator,
      timestamp: Date.now(),
    });

    return pc;
  }

  /**
   * Set up event listeners for a peer connection
   * @private
   */
  setupPeerEventListeners(pc, peerId, peerData) {
    if (window.Logger) {
      window.Logger.log(
        `[WEBRTC-DEBUG] Inside setupPeerEventListeners for ${peerId}. Attaching listeners...`,
        "connections",
      );
    }
    if (this.enableDiagnosticLogs)
      console.log(
        `[WEBRTC-DEBUG] Inside setupPeerEventListeners for ${peerId}. Attaching listeners...`,
      );

    // ICE candidate handling
    pc.addEventListener("icecandidate", (event) => {
      if (event.candidate) {
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DIAG] Peer ${peerId}: Local ICE candidate gathered:`,
            event.candidate,
          );
        this.handleLocalIceCandidate(event.candidate, peerId);
      } else {
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DIAG] Peer ${peerId}: All local ICE candidates gathered (event.candidate is null).`,
          );
      }
    });

    // Signaling state changes
    pc.addEventListener("signalingstatechange", () => {
      if (this.enableDiagnosticLogs)
        console.log(
          `[WEBRTC-DIAG] Peer ${peerId}: SignalingState CHANGED to ${pc.signalingState}`,
        );
    });

    // Connection state changes
    pc.addEventListener("connectionstatechange", () => {
      // Defer to handler, but log here for immediacy
      if (this.enableDiagnosticLogs)
        console.log(
          `[WEBRTC-DIAG] Peer ${peerId}: connectionState CHANGED to ${pc.connectionState}`,
        );
      this.handleConnectionStateChange(pc, peerId);
    });

    // ICE connection state changes
    pc.addEventListener("iceconnectionstatechange", () => {
      // Defer to handler, but log here for immediacy
      if (this.enableDiagnosticLogs)
        console.log(
          `[WEBRTC-DIAG] Peer ${peerId}: iceConnectionState CHANGED to ${pc.iceConnectionState}`,
        );
      this.handleIceConnectionStateChange(pc, peerId);
    });

    // ICE gathering state changes
    pc.addEventListener("icegatheringstatechange", () => {
      const gatheringState = pc.iceGatheringState;
      console.log(`[ICE-GATHERING] ${peerId} state: ${gatheringState}`);

      if (gatheringState === "complete") {
        // Log statistics when gathering is complete
        pc.getStats().then((stats) => {
          let localCandidateCount = 0;
          let candidateTypes = new Set();

          stats.forEach((report) => {
            if (report.type === "local-candidate") {
              localCandidateCount++;
              candidateTypes.add(report.candidateType);
            }
          });

          console.log(
            `[ICE-GATHERING] ${peerId} complete with ${localCandidateCount} local candidates`,
          );
          console.log(
            `[ICE-GATHERING] ${peerId} candidate types: ${Array.from(candidateTypes).join(", ")}`,
          );
        });
      }

      if (this.enableDiagnosticLogs)
        console.log(
          `[WEBRTC-DIAG] Peer ${peerId}: iceGatheringState CHANGED to ${pc.iceGatheringState}`,
        );
    });

    // Data channel handling
    // Store the handler reference so we can remove it later if needed
    if (window.Logger) {
      window.Logger.log(
        `[WEBRTC-DIAG] Setting up datachannel event listener for ${peerId}`,
        "connections",
      );
    }
    console.log(
      `[WEBRTC-DIAG] About to add datachannel listener for ${peerId}`,
    );

    // Use direct assignment instead of addEventListener to ensure it's not overwritten
    pc.ondatachannel = (event) => {
      console.log(`[WEBRTC-CRITICAL] datachannel event FIRED for ${peerId}!`, {
        channelLabel: event.channel.label,
        channelId: event.channel.id,
        channelState: event.channel.readyState,
        channelOrdered: event.channel.ordered,
        channelProtocol: event.channel.protocol,
        timestamp: new Date().toISOString(),
      });

      if (window.Logger) {
        window.Logger.log(
          `[WEBRTC-DIAG] Peer ${peerId}: 'datachannel' event FIRED. Channel label: ${event.channel.label}, state: ${event.channel.readyState}`,
          "connections",
        );
      }
      if (this.enableDiagnosticLogs)
        console.log(
          `[WEBRTC-DIAG] Peer ${peerId}: 'datachannel' event FIRED. Channel label: ${event.channel.label}`,
          event,
        );
      this.handleDataChannel(event.channel, peerId, peerData);
    };
    console.log(
      `[WEBRTC-DIAG] datachannel listener added for ${peerId}. Total listeners: ${pc.listenerCount ? pc.listenerCount("datachannel") : "unknown"}`,
    );

    if (window.Logger) {
      window.Logger.log(
        `[WEBRTC-DEBUG] All event listeners attached for ${peerId}.`,
        "connections",
      );
    }
    if (this.enableDiagnosticLogs)
      console.log(`[WEBRTC-DEBUG] All event listeners attached for ${peerId}.`);
  }

  /**
   * Handle incoming WebSocket messages for WebRTC
   * @private
   */
  handleWebSocketMessage(message) {
    if (window.Logger) {
      window.Logger.log(
        `WebRTCManager.handleWebSocketMessage: type=${message.type}, source=${message.source}`,
        "messages",
      );
    }
    switch (message.type) {
      case "offer":
        if (window.Logger) {
          window.Logger.log(
            `WebRTCManager routing offer from ${message.source}`,
            "messages",
          );
        }
        this.handleOffer(message);
        break;
      case "answer":
        if (window.Logger) {
          window.Logger.log(
            `WebRTCManager routing answer from ${message.source}`,
            "messages",
          );
        }
        this.handleAnswer(message);
        break;
      case "ice":
        if (window.Logger) {
          window.Logger.log(
            `WebRTCManager routing ICE candidate from ${message.source}`,
            "messages",
          );
        }
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DIAG] Peer ${message.source}: Received remote ICE candidate via signaling:`,
            message.data,
          );
        this.handleRemoteIceCandidate(message);
        break;
      default:
        if (window.Logger) {
          window.Logger.log(
            `WebRTCManager ignoring non-WebRTC message type: ${message.type}`,
            "messages",
          );
        }
        // Not a WebRTC message
        break;
    }
  }

  /**
   * Handle incoming offer
   */
  async handleOffer(message) {
    const { source: peerId, data: offer } = message;
    
    // Check if WebRTC is ready
    if (!this.isReady) {
      if (window.Logger) {
        window.Logger.log(`WebRTC not ready, delaying offer handling for ${peerId}`, "connections");
      }
      // Retry after a short delay
      setTimeout(() => this.handleOffer(message), 500);
      return;
    }

    // Debug logging
    if (this.enableDiagnosticLogs)
      console.log("[WEBRTC-DEBUG] handleOffer called with message:", message);
    if (this.enableDiagnosticLogs)
      console.log(
        `[WEBRTC-DIAG] Peer ${peerId}: handleOffer started at ${new Date().toISOString()}. Offer SDP:`,
        offer.sdp,
      );

    if (window.Logger) {
      window.Logger.log(`Received offer from ${peerId}`, "connections");
    }

    // Check if we have an existing connection that might be stale
    if (this.peers.has(peerId)) {
      const existingPeerData = this.peers.get(peerId);
      const existingPc = existingPeerData.connection;

      // If we're receiving a new offer, it likely means the peer restarted
      // Close the old connection to ensure we create a fresh one
      if (this.enableDiagnosticLogs)
        console.log(
          `[WEBRTC-DIAG] Peer ${peerId}: Received new offer while existing connection in state: ${existingPc.connectionState}. Closing old connection.`,
        );

      this.handlePeerDisconnection(peerId);
      // Add a longer delay to ensure cleanup is complete, especially for remote connections
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    try {
      // Ensure we have fresh ICE servers before creating connection
      if (
        !SystemConfig.network.webrtc.iceServers ||
        SystemConfig.network.webrtc.iceServers.length === 0
      ) {
        if (this.enableDiagnosticLogs)
          console.warn(
            `[WEBRTC-DIAG] Peer ${peerId}: No ICE servers configured when handling offer. Attempting to fetch...`,
          );
        if (SystemConfig.fetchIceServers) {
          await SystemConfig.fetchIceServers();
        }
      }

      // Create peer connection if it doesn't exist
      const pc = this.createPeerConnection(peerId, false);
      const peerData = this.peers.get(peerId);
      if (peerData) {
        peerData.offerCreatedAt = Date.now();
      }

      // Check if we need ICE restart
      if (
        pc.iceConnectionState === "failed" ||
        pc.iceConnectionState === "disconnected"
      ) {
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DIAG] Peer ${peerId}: ICE in ${pc.iceConnectionState} state, will restart ICE with new offer`,
          );
      }

      if (this.enableDiagnosticLogs)
        console.log(
          `[WEBRTC-DIAG] Peer ${peerId}: In handleOffer, pc.signalingState BEFORE setRemoteDescription: ${pc.signalingState}`,
        );
      // Data channels will be created by the remote peer (synth) and handled by the 'datachannel' event listener.
      
      // Verify the datachannel listener is set before setting remote description
      if (!pc.ondatachannel) {
        console.error(`[WEBRTC-ERROR] No datachannel listener set for ${peerId}! This will cause datachannel events to be missed.`);
        if (window.Logger) {
          window.Logger.log(`[WEBRTC-ERROR] No datachannel listener set for ${peerId}`, "error");
        }
      }

      // Set remote description
      try {
        await pc.setRemoteDescription(offer); // Listener for 'datachannel' should be active before this
        console.log(
          `[WEBRTC-CRITICAL] setRemoteDescription completed for ${peerId}. Waiting for datachannel event...`,
        );
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DIAG] Peer ${peerId}: setRemoteDescription(offer) successful. pc.signalingState AFTER setRemoteDescription: ${pc.signalingState}`,
          );
        if (window.Logger) {
          window.Logger.log(
            `[WEBRTC-DEBUG] Remote description set successfully for ${peerId}`,
            "connections",
          );
        }
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DEBUG] Remote description set successfully for ${peerId}`,
          );
      } catch (e) {
        if (window.Logger) {
          window.Logger.log(
            `[WEBRTC-ERROR] Error setting remote description for ${peerId}: ${e}`,
            "error",
          );
        }
        console.error(
          `[WEBRTC-ERROR] Error setting remote description for ${peerId}:`,
          e,
        );
        this.handlePeerDisconnection(peerId);
        return;
      }

      // Create answer
      let answer;
      try {
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DIAG] Peer ${peerId}: pc.signalingState BEFORE createAnswer: ${pc.signalingState}`,
          );
        answer = await pc.createAnswer();

        // Log answer SDP for debugging
        console.log(`[SDP-DEBUG] Answer SDP for ${peerId}:`, answer.sdp);
        const answerHasDataChannel = answer.sdp.includes("m=application");
        const answerSctpLines = answer.sdp
          .split("\n")
          .filter((line) => line.includes("sctp"));
        console.log(`[SDP-DEBUG] Answer analysis:
          - Has data channel (m=application): ${answerHasDataChannel}
          - SCTP lines: ${answerSctpLines.length > 0 ? answerSctpLines.join("; ") : "NONE"}
        `);

        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DIAG] Peer ${peerId}: createAnswer() successful. Answer SDP:`,
            answer.sdp,
          );
        if (window.Logger) {
          window.Logger.log(
            `[WEBRTC-DEBUG] Answer created successfully for ${peerId}`,
            "connections",
          );
        }
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DEBUG] Answer created successfully for ${peerId}`,
          );
      } catch (e) {
        if (window.Logger) {
          window.Logger.log(
            `[WEBRTC-ERROR] Error creating answer for ${peerId}: ${e}`,
            "error",
          );
        }
        console.error(`[WEBRTC-ERROR] Error creating answer for ${peerId}:`, e);
        this.handlePeerDisconnection(peerId);
        return;
      }

      // Set local description
      try {
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DIAG] Peer ${peerId}: pc.signalingState BEFORE setLocalDescription(answer): ${pc.signalingState}`,
          );
        await pc.setLocalDescription(answer);
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DIAG] Peer ${peerId}: setLocalDescription(answer) successful. pc.signalingState AFTER setLocalDescription: ${pc.signalingState}`,
          );
        if (window.Logger) {
          window.Logger.log(
            `[WEBRTC-DEBUG] Local description set successfully for ${peerId}`,
            "connections",
          );
        }
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DEBUG] Local description set successfully for ${peerId}`,
          );
      } catch (e) {
        if (window.Logger) {
          window.Logger.log(
            `[WEBRTC-ERROR] Error setting local description for ${peerId}: ${e}`,
            "error",
          );
        }
        console.error(
          `[WEBRTC-ERROR] Error setting local description for ${peerId}:`,
          e,
        );
        this.handlePeerDisconnection(peerId);
        return;
      }

      // Add a small delay after setting the local description to allow the
      // ICE agent to start before the answer is sent. This can help prevent
      // race conditions on some platforms.
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Process any queued ICE candidates BEFORE sending answer (like cicada)
      await this.processIceCandidateQueue(peerId);

      // Send answer back via WebSocket
      // Send answer back to synth
      if (window.webSocketManager) {
        window.webSocketManager.send({
          type: "answer",
          target: peerId,
          source: this.clientId || window.webSocketManager.clientId,
          answer: answer,
        });

        if (window.Logger) {
          window.Logger.log(`Sent answer to ${peerId}`, "connections");
        }
      }

      // Emit offer handled event

      this.eventBus.emit("webrtc:offerHandled", {
        peerId,
        timestamp: Date.now(),
      });
    } catch (error) {
      if (window.Logger) {
        window.Logger.log(
          `[WEBRTC-ERROR] General error in handleOffer for ${peerId}: ${error}`,
          "error",
        );
      }
      console.error(
        `[WEBRTC-ERROR] General error in handleOffer for ${peerId}:`,
        error,
      );
      // Consider emitting an error event or specific cleanup
      this.handlePeerDisconnection(peerId);
    }
  }

  /**
   * Handle incoming answer
   */
  async handleAnswer(message) {
    const { source: peerId, data: answer } = message;

    if (window.Logger) {
      window.Logger.log(`Received answer from ${peerId}`, "connections");
    }

    try {
      const peerData = this.peers.get(peerId);
      if (!peerData) {
        throw new Error(`No peer connection found for ${peerId}`);
      }
      const pc = peerData.connection;
      if (this.enableDiagnosticLogs)
        console.log(
          `[WEBRTC-DIAG] Peer ${peerId}: handleAnswer started. Answer SDP:`,
          answer.sdp,
        );
      if (this.enableDiagnosticLogs)
        console.log(
          `[WEBRTC-DIAG] Peer ${peerId}: In handleAnswer, pc.signalingState BEFORE setRemoteDescription: ${pc.signalingState}`,
        );

      await pc.setRemoteDescription(answer);
      if (this.enableDiagnosticLogs)
        console.log(
          `[WEBRTC-DIAG] Peer ${peerId}: setRemoteDescription(answer) successful. pc.signalingState AFTER setRemoteDescription: ${pc.signalingState}`,
        );
      // Process any queued ICE candidates now that remote description is set
      await this.processIceCandidateQueue(peerId);

      if (window.Logger) {
        window.Logger.log(
          `Set remote description for ${peerId}`,
          "connections",
        );
      }

      // Emit answer handled event
      this.eventBus.emit("webrtc:answerHandled", {
        peerId,
        timestamp: Date.now(),
      });
    } catch (error) {
      if (window.Logger) {
        window.Logger.log(
          `Error handling answer from ${peerId}: ${error}`,
          "error",
        );
      }
    }
  }

  /**
   * Handle remote ICE candidate
   */
  async handleRemoteIceCandidate(message) {
    const { source: peerId, data: candidateData } = message; // candidateData is the ICE candidate object

    if (this.enableDiagnosticLogs)
      console.log(
        `[WEBRTC-DIAG] Peer ${peerId}: handleRemoteIceCandidate received candidateData:`,
        JSON.stringify(candidateData),
      );

    // Track remote candidate types
    if (candidateData && candidateData.candidate) {
      const candidateType = candidateData.candidate.includes("relay")
        ? "RELAY"
        : candidateData.candidate.includes("srflx")
          ? "SRFLX"
          : candidateData.candidate.includes("host")
            ? "HOST"
            : "OTHER";

      const peerData = this.peers.get(peerId);
      if (peerData && peerData.iceCandidateStats) {
        const stats = peerData.iceCandidateStats;
        stats.totalRemoteCandidates++;

        switch (candidateType) {
          case "RELAY":
            stats.remoteCandidates.relay++;
            stats.hasRemoteRelay = true;
            break;
          case "SRFLX":
            stats.remoteCandidates.srflx++;
            break;
          case "HOST":
            stats.remoteCandidates.host++;
            break;
          default:
            stats.remoteCandidates.other++;
        }

        if (window.Logger) {
          window.Logger.log(
            `Received ${candidateType} candidate from ${peerId} (#${stats.totalRemoteCandidates}, Remote RELAY: ${stats.hasRemoteRelay ? "YES" : "NO"})`,
            "connections",
          );
        }
      }
    }

    const peerData = this.peers.get(peerId);
    if (!peerData) {
      if (this.enableDiagnosticLogs)
        console.error(
          `[WEBRTC-DIAG] Peer ${peerId}: No peerData found in handleRemoteIceCandidate. Discarding candidate.`,
        );
      if (window.Logger) {
        window.Logger.log(
          `No peer connection for ICE candidate from ${peerId}`,
          "connections",
        );
      }
      return;
    }

    const pc = peerData.connection;

    // Critical: ICE candidates should only be added after setRemoteDescription has been called.
    // pc.remoteDescription will be non-null after a remote offer or answer has been successfully set.
    if (pc.remoteDescription && pc.remoteDescription.type) {
      if (this.enableDiagnosticLogs)
        console.log(
          `[WEBRTC-DIAG] Peer ${peerId}: remoteDescription is set (${pc.remoteDescription.type}). Adding ICE candidate directly. Current SignalingState: ${pc.signalingState}`,
        );
      try {
        // An RTCIceCandidate object. candidateData can be null for end-of-candidates.
        const rtcIceCandidate = candidateData
          ? new RTCIceCandidate(candidateData)
          : null;
        await pc.addIceCandidate(rtcIceCandidate);
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DIAG] Peer ${peerId}: Successfully added ICE candidate directly.`,
          );
        if (window.Logger) {
          window.Logger.log(
            `Added ICE candidate from ${peerId}: ${candidateData ? candidateData.candidate : "end-of-candidates"}`,
            "connections",
          );
        }
      } catch (error) {
        if (this.enableDiagnosticLogs)
          console.error(
            `[WEBRTC-DIAG] Peer ${peerId}: Error adding ICE candidate directly:`,
            error,
            "Candidate:",
            candidateData,
          );
        if (window.Logger) {
          window.Logger.log(
            `Error adding ICE candidate from ${peerId}: ${error.message}`,
            "error",
          );
        }
      }
    } else {
      // If remoteDescription is not set, queue the candidate.
      peerData.iceCandidateQueue.push(candidateData);
      if (this.enableDiagnosticLogs)
        console.log(
          `[WEBRTC-DIAG] Peer ${peerId}: remoteDescription NOT YET SET. Queued ICE candidate. Queue size: ${peerData.iceCandidateQueue.length}. Current SignalingState: ${pc.signalingState}`,
        );
      if (window.Logger) {
        window.Logger.log(
          `Queued ICE candidate from ${peerId}. Remote desc not set. Queue size: ${peerData.iceCandidateQueue.length}`,
          "connections",
        );
      }
    }
  }

  /**
   * Process any queued ICE candidates for a peer.
   * This should be called after setRemoteDescription is successfully applied.
   * @private
   */
  async processIceCandidateQueue(peerId) {
    const peerData = this.peers.get(peerId);
    if (!peerData) {
      if (this.enableDiagnosticLogs)
        console.warn(
          `[WEBRTC-DIAG] Peer ${peerId}: processIceCandidateQueue called but no peerData found.`,
        );
      return;
    }

    const pc = peerData.connection;
    const queue = peerData.iceCandidateQueue;

    if (queue.length === 0) {
      // This is normal if no candidates were queued
      if (this.enableDiagnosticLogs)
        console.log(
          `[WEBRTC-DIAG] Peer ${peerId}: ICE candidate queue is empty. Nothing to process.`,
        );
      return;
    }

    // Double-check remoteDescription, though this function is called after it should be set.
    if (!pc.remoteDescription || !pc.remoteDescription.type) {
      if (this.enableDiagnosticLogs)
        console.warn(
          `[WEBRTC-DIAG] Peer ${peerId}: processIceCandidateQueue called, but remoteDescription is NOT YET SET. Candidates will remain queued. This should not happen if called correctly. SignalingState: ${pc.signalingState}`,
        );
      return;
    }

    if (this.enableDiagnosticLogs)
      console.log(
        `[WEBRTC-DIAG] Peer ${peerId}: Processing ${queue.length} queued ICE candidate(s) at ${new Date().toISOString()}. SignalingState: ${pc.signalingState}`,
      );

    // Process a copy and clear the original queue *before* attempting to add them
    const candidatesToProcess = [...queue];
    peerData.iceCandidateQueue = [];

    for (const candidateData of candidatesToProcess) {
      try {
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DIAG] Peer ${peerId}: Attempting to add queued ICE candidate:`,
            JSON.stringify(candidateData),
          );

        // Add small delay between candidates to avoid overwhelming the ICE agent
        if (candidatesToProcess.indexOf(candidateData) > 0) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        const rtcIceCandidate = candidateData
          ? new RTCIceCandidate(candidateData)
          : null;
        await pc.addIceCandidate(rtcIceCandidate);
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DIAG] Peer ${peerId}: Successfully added queued ICE candidate.`,
          );
        if (window.Logger) {
          window.Logger.log(
            `Added queued ICE candidate from ${peerId}: ${candidateData ? candidateData.candidate : "end-of-candidates"}`,
            "connections",
          );
        }
      } catch (error) {
        if (this.enableDiagnosticLogs)
          console.error(
            `[WEBRTC-DIAG] Peer ${peerId}: Error adding QUEUED ICE candidate:`,
            error,
            "Candidate:",
            candidateData,
          );
        if (window.Logger) {
          window.Logger.log(
            `Error adding queued ICE candidate from ${peerId}: ${error.message}`,
            "error",
          );
        }
        // Decide if you want to re-queue on certain errors, for now, it's discarded.
      }
    }
    if (this.enableDiagnosticLogs)
      console.log(
        `[WEBRTC-DIAG] Peer ${peerId}: Finished processing ICE candidate queue. Remaining queue size: ${peerData.iceCandidateQueue.length}`,
      );
  }

  /**
   * Handle local ICE candidate
   * @private
   */
  handleLocalIceCandidate(candidate, peerId) {
    // Log candidate type for diagnostics
    const candidateType = candidate.candidate.includes("relay")
      ? "RELAY"
      : candidate.candidate.includes("srflx")
        ? "SRFLX"
        : candidate.candidate.includes("host")
          ? "HOST"
          : "OTHER";

    // Update ICE candidate statistics
    const peerData = this.peers.get(peerId);
    if (peerData && peerData.iceCandidateStats) {
      const stats = peerData.iceCandidateStats;
      stats.totalLocalCandidates++;

      switch (candidateType) {
        case "RELAY":
          stats.localCandidates.relay++;
          stats.hasLocalRelay = true;
          break;
        case "SRFLX":
          stats.localCandidates.srflx++;
          break;
        case "HOST":
          stats.localCandidates.host++;
          break;
        default:
          stats.localCandidates.other++;
      }

      // Emit event for UI updates
      this.eventBus.emit("webrtc:iceCandidateGenerated", {
        peerId,
        candidateType,
        hasRelay: stats.hasLocalRelay,
        totalCandidates: stats.totalLocalCandidates,
      });

      if (window.Logger) {
        window.Logger.log(
          `Generated ${candidateType} candidate for ${peerId} (#${stats.totalLocalCandidates}, RELAY: ${stats.hasLocalRelay ? "YES" : "NO"})`,
          "connections",
        );
      }
    } else if (window.Logger) {
      window.Logger.log(
        `Generated ${candidateType} candidate for ${peerId}`,
        "connections",
      );
    }

    // Send ICE candidate via WebSocket
    if (window.webSocketManager) {
      const message = {
        type: "ice",
        target: peerId,
        source: this.clientId || window.webSocketManager.clientId,
        candidate: candidate,
      };

      console.log(
        `[ICE-EXCHANGE] Sending ${candidateType} candidate to ${peerId}:`,
        {
          candidate: candidate.candidate,
          sdpMLineIndex: candidate.sdpMLineIndex,
          sdpMid: candidate.sdpMid,
          timestamp: new Date().toISOString(),
        },
      );

      window.webSocketManager.send(message);

      if (window.Logger) {
        window.Logger.log(
          `Sent ${candidateType} candidate to ${peerId}`,
          "connections",
        );
      }
    }
  }

  /**
   * Handle connection state change
   * @private
   */
  handleConnectionStateChange(pc, peerId) {
    const state = pc.connectionState;
    // This state is already logged by the direct event listener, this function primarily handles logic.
    if (this.enableDiagnosticLogs)
      console.log(
        `[WEBRTC-DIAG] Peer ${peerId}: handleConnectionStateChange. New state: ${state}`,
      );

    if (window.Logger) {
      window.Logger.log(
        `Connection state for ${peerId} changed to: ${state}`,
        "connections",
      );
    }

    // Update peer data
    const peerData = this.peers.get(peerId);
    if (peerData) {
      peerData.connectionState = state;
    }

    // Emit state change event
    this.eventBus.emit("webrtc:connectionStateChanged", {
      peerId,
      state,
      timestamp: Date.now(),
    });

    // Handle connection success
    if (state === "connected") {
      // Clear connection timeout
      if (peerData && peerData.connectionTimeout) {
        clearTimeout(peerData.connectionTimeout);
        peerData.connectionTimeout = null;
      }

      // Check if param channel is also ready
      if (
        peerData &&
        peerData.paramChannel &&
        peerData.paramChannel.readyState === "open"
      ) {
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DIAG] Peer ${peerId}: Connection established and param channel open - emitting connected event`,
          );
        this.eventBus.emit("webrtc:connected", {
          peerId,
          timestamp: Date.now(),
        });
      } else {
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DIAG] Peer ${peerId}: Connection established but waiting for param channel to open`,
          );
      }
    }

    // Handle disconnection
    if (state === "disconnected" || state === "failed" || state === "closed") {
      this.handlePeerDisconnection(peerId);
    }
  }

  /**
   * Handle ICE connection state changes
   * @private
   */
  handleIceConnectionStateChange(pc, peerId, peerData) {
    const state = pc.iceConnectionState;
    const connectionState = pc.connectionState;

    if (window.Logger) {
      window.Logger.log(
        `[WEBRTC-DEBUG] ICE state for ${peerId}: ${state}, Connection state: ${connectionState}`,
        "connections",
      );
    }

    // Log detailed ICE state for debugging
    console.log(`[ICE-DEBUG] ${peerId} ICE state change:
      - iceConnectionState: ${state}
      - connectionState: ${connectionState}
      - signalingState: ${pc.signalingState}
      - iceGatheringState: ${pc.iceGatheringState}
    `);

    // Log detailed stats on connection attempts
    if (state === "checking") {
      console.log(`[ICE-DEBUG] ${peerId} starting connectivity checks...`);

      // Monitor connection progress
      setTimeout(() => {
        if (pc.iceConnectionState === "checking") {
          console.log(
            `[ICE-DEBUG] ${peerId} still checking after 5 seconds - possible connectivity issue`,
          );

          pc.getStats().then((stats) => {
            let candidatePairs = [];
            stats.forEach((report) => {
              if (report.type === "candidate-pair") {
                candidatePairs.push({
                  state: report.state,
                  nominated: report.nominated,
                  priority: report.priority,
                  bytesSent: report.bytesSent,
                  bytesReceived: report.bytesReceived,
                  requestsSent: report.requestsSent,
                  responsesReceived: report.responsesReceived,
                });
              }
            });

            console.log(
              `[ICE-DEBUG] ${peerId} candidate pairs:`,
              candidatePairs,
            );
          });
        }
      }, 5000);
    }

    // Log ICE state details
    if (this.enableDiagnosticLogs)
      console.log(
        `[WEBRTC-DIAG] Peer ${peerId}: ICE state change:
      - New state: ${state}
      - Local candidates gathered: ${pc.iceGatheringState}
      - Remote candidates in queue: ${peerData ? peerData.iceCandidateQueue.length : "N/A"}`,
      );

    switch (state) {
      case "checking":
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DIAG] Peer ${peerId}: ICE checking started. Monitoring for stuck state...`,
          );
        // Set a timeout to detect stuck ICE checking
        if (peerData && !peerData.iceCheckTimeout) {
          peerData.iceCheckTimeout = setTimeout(() => {
            if (pc.iceConnectionState === "checking") {
              if (this.enableDiagnosticLogs)
                console.error(
                  `[WEBRTC-DIAG] Peer ${peerId}: ICE stuck in 'checking' state for 10s. Getting stats...`,
                );
              this.getICECandidatePairStats(pc, peerId);
            }
          }, 10000);
        }
        break;
      case "connected":
      case "completed":
        // Clear all timeouts on successful connection
        if (peerData) {
          if (peerData.iceCheckTimeout) {
            clearTimeout(peerData.iceCheckTimeout);
            peerData.iceCheckTimeout = null;
          }
          if (peerData.disconnectTimeout) {
            clearTimeout(peerData.disconnectTimeout);
            peerData.disconnectTimeout = null;
          }
          if (peerData.connectionTimeout) {
            clearTimeout(peerData.connectionTimeout);
            peerData.connectionTimeout = null;
          }
        }
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DIAG] Peer ${peerId}: ICE successfully ${state}`,
          );
        // Log successful connection details
        this.getICECandidatePairStats(pc, peerId);

        // Force check if datachannel is ready
        if (state === "connected" && peerData) {
          if (this.enableDiagnosticLogs)
            console.log(
              `[WEBRTC-DIAG] Peer ${peerId}: ICE connected, checking data channels...`,
            );
          // Give a small delay for data channels to stabilize
          setTimeout(() => {
            if (
              peerData.paramChannel &&
              peerData.paramChannel.readyState === "open"
            ) {
              if (this.enableDiagnosticLogs)
                console.log(
                  `[WEBRTC-DIAG] Peer ${peerId}: ICE connected and param channel open - emitting connected event`,
                );
              this.eventBus.emit("webrtc:connected", {
                peerId,
                timestamp: Date.now(),
              });
            } else {
              if (this.enableDiagnosticLogs)
                console.warn(
                  `[WEBRTC-DIAG] Peer ${peerId}: ICE connected but param channel not open. Channel state: ${peerData.paramChannel?.readyState}`,
                );
            }
          }, 100);
        }
        break;
      case "failed":
        if (this.enableDiagnosticLogs)
          console.error(
            `[WEBRTC-DIAG] Peer ${peerId}: ICE FAILED. Getting candidate pair stats...`,
          );

        // Log ICE candidate statistics on failure
        if (peerData && peerData.iceCandidateStats) {
          const stats = peerData.iceCandidateStats;
          console.error(`[WEBRTC-DIAG] Peer ${peerId}: ICE Candidate Summary:
            Local candidates: ${stats.totalLocalCandidates} (HOST: ${stats.localCandidates.host}, SRFLX: ${stats.localCandidates.srflx}, RELAY: ${stats.localCandidates.relay}, OTHER: ${stats.localCandidates.other})
            Remote candidates: ${stats.totalRemoteCandidates} (HOST: ${stats.remoteCandidates.host}, SRFLX: ${stats.remoteCandidates.srflx}, RELAY: ${stats.remoteCandidates.relay}, OTHER: ${stats.remoteCandidates.other})
            Has local RELAY: ${stats.hasLocalRelay}
            Has remote RELAY: ${stats.hasRemoteRelay}`);

          if (!stats.hasLocalRelay) {
            console.error(
              `[WEBRTC-DIAG] Peer ${peerId}: WARNING - No local RELAY candidates generated. Check ICE server configuration.`,
            );
          }
          if (!stats.hasRemoteRelay) {
            console.error(
              `[WEBRTC-DIAG] Peer ${peerId}: WARNING - No remote RELAY candidates received. Remote peer may have ICE configuration issues.`,
            );
          }
        }
        // Clear any pending timeouts
        if (peerData && peerData.iceCheckTimeout) {
          clearTimeout(peerData.iceCheckTimeout);
          peerData.iceCheckTimeout = null;
        }
        this.getICECandidatePairStats(pc, peerId);
        this.handlePeerDisconnection(peerId);
        break;
      case "disconnected":
        if (this.enableDiagnosticLogs)
          console.warn(
            `[WEBRTC-DIAG] Peer ${peerId}: ICE disconnected. Will attempt to reconnect...`,
          );
        // Give it some time to reconnect before considering it failed
        if (peerData && !peerData.disconnectTimeout) {
          peerData.disconnectTimeout = setTimeout(() => {
            if (pc.iceConnectionState === "disconnected") {
              if (this.enableDiagnosticLogs)
                console.error(
                  `[WEBRTC-DIAG] Peer ${peerId}: ICE failed to reconnect after 5s`,
                );
              this.handlePeerDisconnection(peerId);
            }
          }, 5000);
        }
        break;
    }

    // Emit ICE state change event
    this.eventBus.emit("webrtc:iceConnectionStateChanged", {
      peerId,
      state,
      timestamp: Date.now(),
    });
  }

  /**
   * Get detailed ICE candidate pair statistics
   * @private
   */
  async getICECandidatePairStats(pc, peerId) {
    try {
      const stats = await pc.getStats();
      if (this.enableDiagnosticLogs)
        console.log(`[WEBRTC-DIAG] Peer ${peerId}: ICE Candidate Pair Stats:`);

      let candidatePairs = [];
      let localCandidates = new Map();
      let remoteCandidates = new Map();

      // First pass: collect candidates
      stats.forEach((report) => {
        if (report.type === "local-candidate") {
          localCandidates.set(report.id, report);
        } else if (report.type === "remote-candidate") {
          remoteCandidates.set(report.id, report);
        }
      });

      // Second pass: collect candidate pairs
      stats.forEach((report) => {
        if (report.type === "candidate-pair") {
          const local = localCandidates.get(report.localCandidateId);
          const remote = remoteCandidates.get(report.remoteCandidateId);

          candidatePairs.push({
            state: report.state,
            nominated: report.nominated,
            priority: report.priority,
            local: local
              ? `${local.candidateType}/${local.protocol}/${local.address}:${local.port}`
              : "unknown",
            remote: remote
              ? `${remote.candidateType}/${remote.protocol}/${remote.address}:${remote.port}`
              : "unknown",
            bytesReceived: report.bytesReceived,
            bytesSent: report.bytesSent,
            requestsReceived: report.requestsReceived,
            requestsSent: report.requestsSent,
            responsesReceived: report.responsesReceived,
            responsesSent: report.responsesSent,
            lastPacketReceivedTimestamp: report.lastPacketReceivedTimestamp,
            lastPacketSentTimestamp: report.lastPacketSentTimestamp,
          });
        }
      });

      // Log candidate pairs
      candidatePairs.forEach((pair, index) => {
        if (this.enableDiagnosticLogs)
          console.log(`[WEBRTC-DIAG] Candidate Pair ${index + 1}:
          State: ${pair.state}
          Nominated: ${pair.nominated}
          Local: ${pair.local}
          Remote: ${pair.remote}
          Bytes Sent/Received: ${pair.bytesSent}/${pair.bytesReceived}
          Requests Sent/Received: ${pair.requestsSent}/${pair.requestsReceived}
          Responses Sent/Received: ${pair.responsesSent}/${pair.responsesReceived}`);
      });

      // Check for succeeded but not nominated pairs
      const succeededButNotNominated = candidatePairs.filter(
        (p) => p.state === "succeeded" && !p.nominated,
      );
      if (succeededButNotNominated.length > 0) {
        if (this.enableDiagnosticLogs)
          console.warn(
            `[WEBRTC-DIAG] Peer ${peerId}: ${succeededButNotNominated.length} candidate pair(s) succeeded but not nominated! This may indicate ICE negotiation issues.`,
          );
      }

      // Check for active candidate pair
      const activePair = candidatePairs.find(
        (p) => p.state === "succeeded" || p.nominated,
      );
      if (!activePair) {
        if (this.enableDiagnosticLogs)
          console.error(
            `[WEBRTC-DIAG] Peer ${peerId}: No active candidate pair found!`,
          );
      }
    } catch (error) {
      if (this.enableDiagnosticLogs)
        console.error(
          `[WEBRTC-DIAG] Peer ${peerId}: Error getting stats:`,
          error,
        );
    }
  }

  /**
   * Handle incoming data channel
   * @private
   */
  handleDataChannel(channel, peerId, peerData) {
    const channelName = channel.label;

    // Enhanced logging
    console.log(`[WEBRTC-CRITICAL] handleDataChannel called:`, {
      channelName,
      peerId,
      readyState: channel.readyState,
      id: channel.id,
      ordered: channel.ordered,
      maxRetransmits: channel.maxRetransmits,
      protocol: channel.protocol,
      timestamp: new Date().toISOString(),
    });

    if (this.enableDiagnosticLogs)
      console.log(
        `[WEBRTC-DEBUG] handleDataChannel called for channel: ${channelName}, peer: ${peerId}, readyState: ${channel.readyState}`,
        channel,
      );

    if (window.Logger) {
      window.Logger.log(
        `Received data channel '${channelName}' from ${peerId}, state: ${channel.readyState}`,
        "connections",
      );
      window.Logger.log(
        `handleDataChannel: channel.label=${channel.label}, channel.readyState=${channel.readyState}`,
        "connections",
      );
    }

    // Handle single "data" channel or legacy channels
    if (
      channelName === "data" ||
      channelName === "main" ||
      channelName === "params"
    ) {
      if (window.Logger) {
        window.Logger.log(
          `handleDataChannel: Setting up ${channelName.toUpperCase()} channel for ${peerId}`,
          "connections",
        );
      }
      this.setupDataChannel(channel, peerId, peerData);
    } else if (channelName === "commands") {
      // Legacy support - store command channel but prefer data channel
      if (window.Logger) {
        window.Logger.log(
          `handleDataChannel: Received legacy COMMANDS channel from ${peerId}`,
          "connections",
        );
      }
      peerData.commandChannel = channel;
      this.setupLegacyCommandChannel(channel, peerId, peerData);
    } else {
      if (window.Logger) {
        window.Logger.log(
          `Unknown data channel '${channelName}' from ${peerId}`,
          "warning",
        );
      }
    }
  }

  /**
   * Setup unified data channel
   */
  setupDataChannel(channel, peerId, peerData) {
    if (this.enableDiagnosticLogs)
      console.log(
        `[WEBRTC-DEBUG] Setting up data channel for ${peerId}, current readyState: ${channel.readyState}`,
      );
    peerData.dataChannel = channel;
    // Keep legacy references for backward compatibility
    peerData.paramChannel = channel;

    // Debug what's stored
    if (this.enableDiagnosticLogs)
      console.log(
        `[WEBRTC-DEBUG] Peer ${peerId} now has dataChannel: ${!!peerData.dataChannel}, paramChannel: ${!!peerData.paramChannel}`,
      );

    channel.addEventListener("open", () => {
      if (this.enableDiagnosticLogs)
        console.log(
          `[WEBRTC-DIAG] Peer ${peerId}: Data channel opened. ReadyState: ${channel.readyState}`,
        );

      // Re-check what's stored when channel opens
      if (this.enableDiagnosticLogs)
        console.log(
          `[WEBRTC-DEBUG] On open - Peer ${peerId} has dataChannel: ${!!peerData.dataChannel}, paramChannel: ${!!peerData.paramChannel}`,
        );

      if (window.Logger) {
        window.Logger.log(`Data channel open to ${peerId}`, "connections");
      }

      // Check if connection is also ready
      const pc = peerData.connection;
      if (
        pc &&
        (pc.connectionState === "connected" ||
          pc.iceConnectionState === "connected" ||
          pc.iceConnectionState === "completed")
      ) {
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DIAG] Peer ${peerId}: Both connection and param channel are ready - emitting connected event`,
          );
        this.eventBus.emit("webrtc:connected", {
          peerId,
          timestamp: Date.now(),
        });
      }

      // Emit both new and legacy events for compatibility
      // Emitting dataChannelOpen
      this.eventBus.emit("webrtc:dataChannelOpen", {
        peerId,
        channel,
        timestamp: Date.now(),
      });
      this.eventBus.emit("webrtc:paramChannelOpen", {
        peerId,
        channel,
        timestamp: Date.now(),
      });
    });

    channel.addEventListener("close", () => {
      if (window.Logger) {
        window.Logger.log(`Param channel closed to ${peerId}`, "connections");
      }

      this.eventBus.emit("webrtc:paramChannelClosed", {
        peerId,
        timestamp: Date.now(),
      });
    });

    channel.addEventListener("message", (event) => {
      this.handleDataChannelMessage(event, peerId, peerData);
    });
  }

  /**
   * Setup legacy command channel (for backward compatibility)
   */
  setupLegacyCommandChannel(channel, peerId, peerData) {
    peerData.commandChannel = channel;

    channel.addEventListener("open", () => {
      if (window.Logger) {
        window.Logger.log(`Command channel open to ${peerId}`, "connections");
      }

      this.eventBus.emit("webrtc:commandChannelOpen", {
        peerId,
        channel,
        timestamp: Date.now(),
      });
    });

    channel.addEventListener("close", () => {
      if (window.Logger) {
        window.Logger.log(`Command channel closed to ${peerId}`, "connections");
      }

      this.eventBus.emit("webrtc:commandChannelClosed", {
        peerId,
        timestamp: Date.now(),
      });
    });

    channel.addEventListener("message", (event) => {
      this.handleCommandChannelMessage(event, peerId, peerData);
    });
  }

  /**
   * Handle unified data channel messages
   * @private
   */
  handleDataChannelMessage(event, peerId, peerData) {
    try {
      const data = JSON.parse(event.data);

      if (window.Logger) {
        window.Logger.log(
          `Data message from ${peerId}: ${data.type}`,
          "messages",
        );
      }

      // Handle pong messages for latency calculation
      if (data.type === MessageTypes.PONG) {
        peerData.latency = Date.now() - data.timestamp;
        peerData.state = data.state || null;
        peerData.lastPing = Date.now();

        if (window.Logger) {
          window.Logger.log(
            `Pong from ${peerId}, latency: ${peerData.latency}ms`,
            "performance",
          );
        }
      }

      // Emit unified data message event
      this.eventBus.emit("webrtc:dataMessage", {
        peerId,
        data,
        peerData,
        timestamp: Date.now(),
      });

      // Also emit legacy events based on message type for compatibility
      if (
        data.type === MessageTypes.COMMAND ||
        data.type === MessageTypes.SAVE_TO_BANK ||
        data.type === MessageTypes.LOAD_FROM_BANK
      ) {
        this.eventBus.emit("webrtc:commandMessage", {
          peerId,
          data,
          peerData,
          timestamp: Date.now(),
        });
      } else {
        this.eventBus.emit("webrtc:paramMessage", {
          peerId,
          data,
          peerData,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      if (window.Logger) {
        window.Logger.log(
          `Error parsing data message from ${peerId}: ${error}`,
          "error",
        );
      }
    }
  }

  /**
   * Handle parameter channel messages (legacy)
   * @private
   */
  handleParamChannelMessage(event, peerId, peerData) {
    try {
      const data = JSON.parse(event.data);

      if (window.Logger) {
        window.Logger.log(
          `Param message from ${peerId}: ${data.type}`,
          "messages",
        );
      }

      // Handle pong messages for latency calculation
      if (data.type === MessageTypes.PONG) {
        peerData.latency = Date.now() - data.timestamp;
        peerData.state = data.state || null;
        peerData.lastPing = Date.now();

        if (window.Logger) {
          window.Logger.log(
            `Pong from ${peerId}, latency: ${peerData.latency}ms`,
            "performance",
          );
        }
      }

      // Emit parameter message event
      this.eventBus.emit("webrtc:paramMessage", {
        peerId,
        data,
        peerData,
        timestamp: Date.now(),
      });
    } catch (error) {
      if (window.Logger) {
        window.Logger.log(
          `Error parsing param message from ${peerId}: ${error}`,
          "error",
        );
      }
    }
  }

  /**
   * Handle command channel messages
   * @private
   */
  handleCommandChannelMessage(event, peerId, peerData) {
    try {
      const data = JSON.parse(event.data);

      if (window.Logger) {
        window.Logger.log(
          `Command message from ${peerId}: ${data.type}`,
          "messages",
        );
      }

      // Emit command message event
      this.eventBus.emit("webrtc:commandMessage", {
        peerId,
        data,
        peerData,
        timestamp: Date.now(),
      });
    } catch (error) {
      if (window.Logger) {
        window.Logger.log(
          `Error parsing command message from ${peerId}: ${error}`,
          "error",
        );
      }
    }
  }

  /**
   * Handle peer disconnection
   * @private
   */
  handlePeerDisconnection(peerId) {
    if (this.enableDiagnosticLogs)
      console.log(
        `[WEBRTC-DIAG] Peer ${peerId}: Starting cleanup for disconnection`,
      );
    const peerData = this.peers.get(peerId);
    if (peerData) {
      // Clear all timeouts
      if (peerData.connectionTimeout) {
        clearTimeout(peerData.connectionTimeout);
        peerData.connectionTimeout = null;
      }
      if (peerData.iceCheckTimeout) {
        clearTimeout(peerData.iceCheckTimeout);
        peerData.iceCheckTimeout = null;
      }
      if (peerData.disconnectTimeout) {
        clearTimeout(peerData.disconnectTimeout);
        peerData.disconnectTimeout = null;
      }

      // Close data channels
      if (peerData.dataChannel) {
        try {
          peerData.dataChannel.close();
        } catch (e) {
          if (this.enableDiagnosticLogs)
            console.warn(
              `[WEBRTC-DIAG] Peer ${peerId}: Error closing data channel:`,
              e,
            );
        }
      }
      // Also close legacy channels if they exist
      if (
        peerData.paramChannel &&
        peerData.paramChannel !== peerData.dataChannel
      ) {
        try {
          peerData.paramChannel.close();
        } catch (e) {
          if (this.enableDiagnosticLogs)
            console.warn(
              `[WEBRTC-DIAG] Peer ${peerId}: Error closing param channel:`,
              e,
            );
        }
      }
      if (peerData.commandChannel) {
        try {
          peerData.commandChannel.close();
        } catch (e) {
          if (this.enableDiagnosticLogs)
            console.warn(
              `[WEBRTC-DIAG] Peer ${peerId}: Error closing command channel:`,
              e,
            );
        }
      }

      // Close connection
      if (peerData.connection) {
        const connectionState = peerData.connection.connectionState;
        const iceState = peerData.connection.iceConnectionState;
        if (this.enableDiagnosticLogs)
          console.log(
            `[WEBRTC-DIAG] Peer ${peerId}: Closing connection. Final states - Connection: ${connectionState}, ICE: ${iceState}`,
          );

        try {
          peerData.connection.close();
        } catch (e) {
          if (this.enableDiagnosticLogs)
            console.warn(
              `[WEBRTC-DIAG] Peer ${peerId}: Error closing connection:`,
              e,
            );
        }
      }

      // Remove from peers map
      this.peers.delete(peerId);

      if (window.Logger) {
        window.Logger.log(`Disconnected from ${peerId}`, "connections");
      }

      if (this.enableDiagnosticLogs)
        console.log(`[WEBRTC-DIAG] Peer ${peerId}: Cleanup completed`);

      // Emit disconnected event
      this.eventBus.emit("webrtc:disconnected", {
        peerId,
        timestamp: Date.now(),
      });
    } else {
      if (this.enableDiagnosticLogs)
        console.warn(
          `[WEBRTC-DIAG] Peer ${peerId}: No peer data found during disconnection`,
        );
    }
  }

  /**
   * Send ping to all connected peers
   */
  pingAllPeers() {
    this.peers.forEach((peerData, peerId) => {
      if (
        peerData.paramChannel &&
        peerData.paramChannel.readyState === "open"
      ) {
        const pingMessage = {
          type: MessageTypes.PING,
          timestamp: Date.now(),
        };
        this.sendParamMessage(peerId, pingMessage);
      }
    });
  }

  /**
   * Send message to peer via data channel
   * @param {string} peerId - Target peer ID
   * @param {Object} message - Message to send
   * @returns {boolean} Success status
   */
  sendDataMessage(peerId, message) {
    const peerData = this.peers.get(peerId);
    const channel = peerData?.dataChannel || peerData?.paramChannel;

    // Debug logging commented out - too verbose
    // console.log(`[WebRTC] sendDataMessage to ${peerId}:`, {
    //   hasPeerData: !!peerData,
    //   hasDataChannel: !!peerData?.dataChannel,
    //   hasParamChannel: !!peerData?.paramChannel,
    //   dataChannelState: peerData?.dataChannel?.readyState,
    //   paramChannelState: peerData?.paramChannel?.readyState,
    //   messageType: message.type
    // });

    if (!channel || channel.readyState !== "open") {
      if (window.Logger) {
        window.Logger.log(
          `Cannot send data message to ${peerId} - channel not ready (dataChannel: ${!!peerData?.dataChannel}, paramChannel: ${!!peerData?.paramChannel}, readyState: ${channel?.readyState})`,
          "error",
        );
      }
      return false;
    }

    try {
      const messageStr = JSON.stringify(message);
      channel.send(messageStr);

      if (window.Logger) {
        window.Logger.log(
          `Sent data message to ${peerId}: ${message.type}${message.name ? ` (${message.name})` : ""}`,
          "messages",
        );
      }

      return true;
    } catch (error) {
      if (window.Logger) {
        window.Logger.log(
          `Failed to send data message to ${peerId}: ${error}`,
          "error",
        );
      }
      return false;
    }
  }

  /**
   * Send message to peer via parameter channel (legacy)
   * @param {string} peerId - Target peer ID
   * @param {Object} message - Message to send
   * @returns {boolean} Success status
   */
  sendParamMessage(peerId, message) {
    return this.sendDataMessage(peerId, message);
  }

  /**
   * Send message to peer via command channel (legacy)
   * @param {string} peerId - Target peer ID
   * @param {Object} message - Message to send
   * @returns {boolean} Success status
   */
  sendCommandMessage(peerId, message) {
    // Try to use command channel first for backward compatibility,
    // fall back to data channel
    const peerData = this.peers.get(peerId);
    if (peerData?.commandChannel?.readyState === "open") {
      try {
        peerData.commandChannel.send(JSON.stringify(message));
        if (window.Logger) {
          window.Logger.log(
            `Sent command via legacy channel to ${peerId}: ${message.type}`,
            "messages",
          );
        }
        return true;
      } catch (error) {
        // Fall through to use data channel
      }
    }

    // Use unified data channel
    return this.sendDataMessage(peerId, message);
  }

  /**
   * Send command message to a specific peer (legacy)
   * @param {string} peerId - Target peer ID
   * @param {Object} message - Message to send
   * @returns {boolean} Whether send was successful
   */
  sendCommandMessage(peerId, message) {
    const peerData = this.peers.get(peerId);
    if (!peerData) {
      if (window.Logger) {
        window.Logger.log(
          `Cannot send command to ${peerId} - peer not found`,
          "error",
        );
      }
      return false;
    }

    // Try legacy command channel first
    if (
      peerData.commandChannel &&
      peerData.commandChannel.readyState === "open"
    ) {
      try {
        peerData.commandChannel.send(JSON.stringify(message));
        if (window.Logger) {
          window.Logger.log(
            `Sent command via legacy channel to ${peerId}`,
            "messages",
          );
        }
        return true;
      } catch (error) {
        // Fall through to use data channel
      }
    }

    // Use unified data channel
    return this.sendDataMessage(peerId, message);
  }

  /**
   * Periodically ping all connected peers
   */
  pingAllPeers() {
    const pingMessage = {
      type: MessageTypes.PING,
      timestamp: Date.now(),
    };

    this.peers.forEach((peerData, peerId) => {
      // Only ping if we have an open channel
      const channel = peerData?.dataChannel || peerData?.paramChannel;
      if (channel && channel.readyState === "open") {
        this.sendDataMessage(peerId, pingMessage);
      }
    });
  }

  /**
   * Get peer connection information
   * @param {string} peerId - Peer ID
   * @returns {Object|null} Peer information
   */
  getPeerInfo(peerId) {
    const peerData = this.peers.get(peerId);
    if (!peerData) return null;

    return {
      peerId,
      connectionState: peerData.connection.connectionState,
      iceConnectionState: peerData.connection.iceConnectionState,
      latency: peerData.latency,
      lastPing: peerData.lastPing,
      state: peerData.state,
      hasDataChannel: peerData.dataChannel?.readyState === "open",
      hasParamChannel: peerData.paramChannel?.readyState === "open",
      hasCommandChannel: peerData.commandChannel?.readyState === "open",
      dataChannelState: peerData.dataChannel?.readyState || "no channel",
      paramChannelState: peerData.paramChannel?.readyState || "no channel",
      createdAt: peerData.createdAt,
    };
  }

  /**
   * Get all connected peers
   * @returns {Array} Array of peer information objects
   */
  getAllPeers() {
    return Array.from(this.peers.keys()).map((peerId) =>
      this.getPeerInfo(peerId),
    );
  }

  /**
   * Debug method to check peer status
   */
  debugPeerStatus() {
    if (this.enableDiagnosticLogs)
      console.log("[WEBRTC-DEBUG] Current peer status:");
    this.peers.forEach((peerData, peerId) => {
      if (this.enableDiagnosticLogs)
        console.log(`[WEBRTC-DEBUG] ${peerId}:`, {
          hasDataChannel: !!peerData.dataChannel,
          hasParamChannel: !!peerData.paramChannel,
          dataChannelState: peerData.dataChannel?.readyState || "no channel",
          paramChannelState: peerData.paramChannel?.readyState || "no channel",
          connectionState:
            peerData.connection?.connectionState || "no connection",
        });
    });
  }

  /**
   * Close all peer connections
   */
  closeAllConnections() {
    if (window.Logger) {
      window.Logger.log(
        `Closing ${this.peers.size} peer connections`,
        "connections",
      );
    }

    this.peers.forEach((peerData, peerId) => {
      this.handlePeerDisconnection(peerId);
    });

    this.peers.clear();
  }

  /**
   * Add event listener for WebRTC events
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    return this.eventBus.on(`webrtc:${event}`, handler);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  off(event, handler) {
    this.eventBus.off(`webrtc:${event}`, handler);
  }

  /**
   * Diagnostic function to test different ICE configurations
   * @param {string} peerId - Peer ID to test with
   * @param {string} mode - Test mode: 'stun-only', 'turn-only', 'all'
   */
  async testICEConfiguration(peerId, mode = "all") {
    if (this.enableDiagnosticLogs)
      console.log(
        `[WEBRTC-DIAG] Starting ICE configuration test for ${peerId} in ${mode} mode`,
      );

    // Close existing connection if any
    if (this.peers.has(peerId)) {
      if (this.enableDiagnosticLogs)
        console.log(`[WEBRTC-DIAG] Closing existing connection for ${peerId}`);
      this.handlePeerDisconnection(peerId);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Prepare test configurations
    const testConfigs = {
      "stun-only": {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:global.stun.twilio.com:3478" },
        ],
        iceTransportPolicy: "all",
      },
      "turn-only": {
        iceServers: SystemConfig.network.webrtc.iceServers.filter(
          (server) => server.urls && server.urls.includes("turn:"),
        ),
        iceTransportPolicy: "relay",
      },
      all: {
        iceServers: SystemConfig.network.webrtc.iceServers,
        iceTransportPolicy: "all",
      },
    };

    const testConfig = testConfigs[mode];
    if (!testConfig) {
      if (this.enableDiagnosticLogs)
        console.error(`[WEBRTC-DIAG] Invalid test mode: ${mode}`);
      return;
    }

    if (this.enableDiagnosticLogs)
      console.log(
        `[WEBRTC-DIAG] Test configuration:`,
        JSON.stringify(testConfig, null, 2),
      );

    // Create test peer connection
    const pc = new RTCPeerConnection(testConfig);

    // Monitor ICE gathering
    pc.addEventListener("icegatheringstatechange", () => {
      if (this.enableDiagnosticLogs)
        console.log(
          `[WEBRTC-DIAG-TEST] ICE gathering state: ${pc.iceGatheringState}`,
        );
    });

    pc.addEventListener("icecandidate", (event) => {
      if (event.candidate) {
        if (this.enableDiagnosticLogs)
          console.log(`[WEBRTC-DIAG-TEST] Candidate gathered:`, {
            type: event.candidate.type,
            protocol: event.candidate.protocol,
            address: event.candidate.address,
            port: event.candidate.port,
          });
      }
    });

    // Create a data channel to trigger ICE gathering
    const testChannel = pc.createDataChannel("test");

    // Create an offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    if (this.enableDiagnosticLogs)
      console.log(
        `[WEBRTC-DIAG-TEST] Test offer created. Waiting for ICE gathering...`,
      );

    // Wait for gathering to complete
    await new Promise((resolve) => {
      if (pc.iceGatheringState === "complete") {
        resolve();
      } else {
        pc.addEventListener("icegatheringstatechange", () => {
          if (pc.iceGatheringState === "complete") {
            resolve();
          }
        });
      }
    });

    // Get stats
    const stats = await pc.getStats();
    let candidates = [];
    stats.forEach((report) => {
      if (report.type === "local-candidate") {
        candidates.push({
          type: report.candidateType,
          protocol: report.protocol,
          address: report.address,
          port: report.port,
        });
      }
    });

    if (this.enableDiagnosticLogs)
      console.log(
        `[WEBRTC-DIAG-TEST] Test complete. Gathered ${candidates.length} candidates:`,
        candidates,
      );

    // Clean up
    testChannel.close();
    pc.close();

    return {
      mode,
      candidatesGathered: candidates.length,
      candidates,
    };
  }
}

// Create global instance
export const webRTCManager = new WebRTCManager();

// Make available globally for backward compatibility
if (typeof window !== "undefined") {
  window.WebRTCManager = WebRTCManager;
  window.webRTCManager = webRTCManager;

  // Add debug helper
  window.debugWebRTC = () => webRTCManager.debugPeerStatus();
}
