/**
 * WebSocketManager Module for String Assembly FM
 * Handles WebSocket connections, messaging, and reconnection logic
 */

import { eventBus } from "../core/EventBus.js";
import { Config } from "../core/Config.js";

export class WebSocketManager {
  constructor(url = Config.WS_URL, eventBusInstance = eventBus) {
    this.url = url;
    this.eventBus = eventBusInstance;
    this.ws = null;
    this.heartbeatInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = Config.NETWORK.MAX_RECONNECT_ATTEMPTS;
    this.reconnectDelay = Config.NETWORK.RECONNECT_DELAY;
    this.messageQueue = [];
    this.isConnected = false;
    this.isConnecting = false;
    this.clientId = null;
    this.clientType = "controller";
  }

  /**
   * Establish WebSocket connection
   * @param {string} clientId - Unique client identifier
   * @returns {Promise<boolean>} Connection success status
   */
  async connect(clientId = null) {
    if (this.isConnecting || this.isConnected) {
      if (window.Logger) {
        window.Logger.log(
          "WebSocket connection already in progress or established",
          "connections",
        );
      }
      return this.isConnected;
    }

    this.isConnecting = true;
    this.clientId =
      clientId || `ctrl-${Math.random().toString(36).substr(2, 9)}`;

    try {
      if (window.Logger) {
        window.Logger.log(
          `Connecting to WebSocket: ${this.url}`,
          "connections",
        );
      }

      this.ws = new WebSocket(this.url);
      this.setupEventListeners();

      // Return promise that resolves when connection is established
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("WebSocket connection timeout"));
        }, Config.NETWORK.CONNECTION_TIMEOUT);

        this.eventBus.once("websocket:connected", () => {
          clearTimeout(timeout);
          resolve(true);
        });

        this.eventBus.once("websocket:error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      this.isConnecting = false;
      if (window.Logger) {
        window.Logger.log(
          `Failed to create WebSocket connection: ${error}`,
          "error",
        );
      }
      throw error;
    }
  }

  /**
   * Close WebSocket connection
   */
  disconnect() {
    if (this.ws) {
      if (window.Logger) {
        window.Logger.log("Disconnecting WebSocket...", "connections");
      }

      this.clearHeartbeat();
      this.ws.close(1000, "Client disconnecting");
      this.ws = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
  }

  /**
   * Send message through WebSocket
   * @param {Object} message - Message object to send
   * @returns {boolean} Success status
   */
  send(message) {
    if (
      !this.isConnected ||
      !this.ws ||
      this.ws.readyState !== 1 // WebSocket.OPEN = 1
    ) {
      // Queue message for later if not connected
      if (this.messageQueue.length < Config.NETWORK.MESSAGE_QUEUE_SIZE) {
        this.messageQueue.push(message);
        if (window.Logger) {
          window.Logger.log("Message queued (WebSocket not ready)", "messages");
          // Debug why message is queued
          window.Logger.log(
            `WebSocket state debug: isConnected=${this.isConnected}, ws exists=${!!this.ws}, readyState=${this.ws?.readyState} (OPEN=1)`,
            "messages",
          );
        }
      } else {
        if (window.Logger) {
          window.Logger.log("Message queue full, dropping message", "error");
        }
      }
      return false;
    }

    try {
      // Always ensure sender_id is included
      const messageToSend = {
        ...message,
        sender_id: message.sender_id || this.clientId,
        source: message.source || this.clientId,
      };
      const messageStr = JSON.stringify(messageToSend);
      this.ws.send(messageStr);

      if (window.Logger) {
        window.Logger.log(`Sent message: ${message.type}`, "messages");
      }

      // Emit message sent event
      this.eventBus.emit("websocket:messageSent", {
        message: messageToSend,
        timestamp: Date.now(),
      });

      return true;
    } catch (error) {
      if (window.Logger) {
        window.Logger.log(`Failed to send message: ${error}`, "error");
      }
      return false;
    }
  }

  /**
   * Get connection status
   * @returns {Object} Connection status information
   */
  getStatus() {
    return {
      connected: this.isConnected,
      connecting: this.isConnecting,
      readyState: this.ws?.readyState,
      url: this.url,
      clientId: this.clientId,
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length,
    };
  }

  /**
   * Setup WebSocket event listeners
   * @private
   */
  setupEventListeners() {
    if (!this.ws) return;

    this.ws.addEventListener("open", () => {
      this.handleOpen();
    });

    this.ws.addEventListener("message", (event) => {
      this.handleMessage(event);
    });

    this.ws.addEventListener("close", (event) => {
      this.handleClose(event);
    });

    this.ws.addEventListener("error", (event) => {
      this.handleError(event);
    });
  }

  /**
   * Handle WebSocket open event
   * @private
   */
  handleOpen() {
    this.isConnected = true;
    this.isConnecting = false;
    this.reconnectAttempts = 0;


    // Emit connection event immediately
    this.eventBus.emit("websocket:connected", {
      clientId: this.clientId,
      timestamp: Date.now(),
    });

    // Send registration message
    this.send({
      type: "register",
      client_id: this.clientId,
      client_type: this.clientType,
    });

    // Start heartbeat
    this.startHeartbeat();

    // Send queued messages
    this.flushMessageQueue();
  }

  /**
   * Handle WebSocket message event
   * @private
   */
  handleMessage(event) {
    // console.log("[WEBSOCKET-MANAGER] Raw message received:", event.data);
    try {
      const message = JSON.parse(event.data);

      // Add comprehensive debug logging
      // console.log("[WEBSOCKET-DEBUG] WebSocket received:", message);

      // Unconditional logging for ALL messages to debug offer reception
      // console.log(
      //   `[WEBSOCKET-ALL-MESSAGES] type: ${message.type}, source: ${message.source}, target: ${message.target}`,
      // );

      // Log timestamp to track message order
      // console.log(
      //   `[WEBSOCKET-TIMING] Message received at: ${new Date().toISOString()}, type: ${message.type}`,
      // );
      // if (message.type === "offer") {
      //   console.log(
      //     "[WEBSOCKET-OFFER-RECEIVED] Offer message detected!",
      //     message,
      //   );
      // }

      if (window.Logger) {
        window.Logger.log(`Received message: ${message.type}`, "messages");
        // Log full message details for debugging
        if (message.type === "offer" || message.type === "answer") {
          window.Logger.log(
            `${message.type} details - source: ${message.source}, target: ${message.target}`,
            "messages",
          );
        }
      }

      // Handle internal message types
      switch (message.type) {
        case "pong":
          this.handlePong(message);
          break;
        case "controller_list":
          this.handleControllerList(message);
          break;
        case "kicked":
          this.handleKicked(message);
          break;
        default:
          // Emit generic message event for other handlers
          if (window.Logger) {
            window.Logger.log(
              `WebSocketManager emitting websocket:message for type: ${message.type} from ${message.source}`,
              "messages",
            );
          }
          this.eventBus.emit("websocket:message", {
            message,
            timestamp: Date.now(),
          });
      }

      // Always emit raw message event
      this.eventBus.emit("websocket:rawMessage", {
        data: event.data,
        message,
        timestamp: Date.now(),
      });
    } catch (error) {
      if (window.Logger) {
        window.Logger.log(
          `Failed to parse WebSocket message: ${error}`,
          "error",
        );
      }
    }
  }

  /**
   * Handle WebSocket close event
   * @private
   */
  handleClose(event) {
    this.isConnected = false;
    this.isConnecting = false;
    this.clearHeartbeat();

    if (window.Logger) {
      window.Logger.log(
        `WebSocket disconnected (code: ${event.code})`,
        "connections",
      );
    }

    // Emit disconnection event
    this.eventBus.emit("websocket:disconnected", {
      code: event.code,
      reason: event.reason,
      timestamp: Date.now(),
    });

    // Attempt reconnection if not intentional
    if (
      event.code !== 1000 &&
      this.reconnectAttempts < this.maxReconnectAttempts
    ) {
      this.scheduleReconnect();
    }
  }

  /**
   * Handle WebSocket error event
   * @private
   */
  handleError(event) {
    if (window.Logger) {
      window.Logger.log(
        `WebSocket error: ${event.error || "Unknown error"}`,
        "error",
      );
    }

    this.eventBus.emit("websocket:error", {
      error: event.error,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle pong message for latency calculation
   * @private
   */
  handlePong(message) {
    if (message.timestamp) {
      const latency = Date.now() - message.timestamp;
      if (window.Logger) {
        window.Logger.log(`WebSocket latency: ${latency}ms`, "performance");
      }

      this.eventBus.emit("websocket:latency", {
        latency,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle controller list update
   * @private
   */
  handleControllerList(message) {
    if (window.Logger) {
      window.Logger.log(
        `Controller list updated: ${message.controllers?.length || 0} controllers`,
        "connections",
      );
    }

    this.eventBus.emit("websocket:controllerList", {
      controllers: message.controllers || [],
      timestamp: Date.now(),
    });
  }

  /**
   * Handle kicked message
   * @private
   */
  handleKicked(message) {
    if (window.Logger) {
      window.Logger.log(
        "Controller was kicked by another controller",
        "connections",
      );
    }

    this.eventBus.emit("websocket:kicked", {
      reason: message.reason,
      timestamp: Date.now(),
    });

    // Don't reconnect if kicked
    this.maxReconnectAttempts = 0;
    this.disconnect();
  }

  /**
   * Start heartbeat mechanism
   * @private
   */
  startHeartbeat() {
    this.clearHeartbeat();

    // Send the first ping immediately
    if (this.isConnected) {
      this.send({
        type: "ping",
        timestamp: Date.now(),
        target: "server",
      });
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        this.send({
          type: "ping",
          timestamp: Date.now(),
          target: "server",
        });
      }
    }, Config.NETWORK.PING_INTERVAL);
  }

  /**
   * Clear heartbeat interval
   * @private
   */
  clearHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Schedule reconnection attempt
   * @private
   */
  scheduleReconnect() {
    this.reconnectAttempts++;
    const delay =
      this.reconnectDelay *
      Math.pow(Config.NETWORK.RECONNECT_BACKOFF, this.reconnectAttempts - 1);

    if (window.Logger) {
      window.Logger.log(
        `Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`,
        "connections",
      );
    }

    setTimeout(() => {
      if (
        !this.isConnected &&
        this.reconnectAttempts <= this.maxReconnectAttempts
      ) {
        this.connect(this.clientId);
      }
    }, delay);
  }

  /**
   * Send queued messages
   * @private
   */
  flushMessageQueue() {
    if (this.messageQueue.length > 0) {
      if (window.Logger) {
        window.Logger.log(
          `Sending ${this.messageQueue.length} queued messages`,
          "messages",
        );
      }

      const queue = [...this.messageQueue];
      this.messageQueue = [];

      queue.forEach((message) => {
        this.send(message);
      });
    }
  }

  /**
   * Add event listener for WebSocket events
   * @param {string} event - Event name (connected, disconnected, message, etc.)
   * @param {Function} handler - Event handler
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    return this.eventBus.on(`websocket:${event}`, handler);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  off(event, handler) {
    this.eventBus.off(`websocket:${event}`, handler);
  }

  /**
   * Send kick command to other controllers
   * @param {string} targetId - Target controller ID to kick
   */
  kickController(targetId) {
    this.send({
      type: "kick_controller",
      target_id: targetId,
    });

    if (window.Logger) {
      window.Logger.log(
        `Sent kick command for controller: ${targetId}`,
        "messages",
      );
    }
  }

  /**
   * Request current controller list
   */
  requestControllerList() {
    this.send({
      type: "get_controllers",
    });
  }
}

// Create global instance
export const webSocketManager = new WebSocketManager();

// Make available globally for backward compatibility
if (typeof window !== "undefined") {
  window.WebSocketManager = WebSocketManager;
  window.webSocketManager = webSocketManager;
}
