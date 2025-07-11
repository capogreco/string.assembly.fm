/**
 * ArcManager Module for String Assembly FM
 * Handles Monome Arc connection and communication via Web Serial API
 * Uses Lua commands for Arc control (norns/crow-style firmware)
 */

import { eventBus } from "../core/EventBus.js";
import { Logger } from "../core/Logger.js";

class ArcManager {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.isConnected = false;
    this.autoConnectEnabled = true;
    
    // Arc state
    this.encoderPositions = [0, 0, 0, 0];
    this.parameterValues = [0.5, 0.5, 0.0, 0.0]; // Volume, Brightness, Detune, Reverb
    
    // LED update throttling
    this.ledUpdatePending = [false, false, false, false];
    this.ledUpdateTimer = null;
    this.lastLedUpdate = [0, 0, 0, 0];
    this.lastLedValues = [0, 0, 0, 0];
    
    // Text buffer for incoming messages
    this.textBuffer = '';
    
    // Auto-connect will be triggered after initialization
  }

  /**
   * Initialize the Arc manager
   */
  async initialize() {
    if (!this.checkSerialSupport()) {
      Logger.log("Web Serial API not supported in this browser", "error");
      return false;
    }

    // Set up event listeners
    this.setupEventListeners();
    
    // ArcManager initialized
    
    // Auto-connect after initialization if enabled
    if (this.autoConnectEnabled) {
      setTimeout(() => this.autoConnect(), 1000);
    }
    
    return true;
  }

  /**
   * Check if Web Serial API is supported
   */
  checkSerialSupport() {
    return "serial" in navigator;
  }

  /**
   * Auto-connect to Arc if permission was previously granted
   */
  async autoConnect() {
    if (!this.checkSerialSupport()) return;
    
    if (this.isConnected || this.port) {
      // Arc already connected or connecting
      return;
    }
    
    try {
      const ports = await navigator.serial.getPorts();
      
      if (ports.length > 0) {
        // Found previously authorized serial port
        
        const port = ports[0];
        if (port.readable || port.writable) {
          try {
            await port.close();
          } catch (e) {
            // Ignore close errors
          }
        }
        
        this.port = port;
        this.isAutoConnecting = true;
        await this.openPort();
        this.isAutoConnecting = false;
      } else {
        Logger.log("No previously authorized Arc found. Click to connect.", "hardware");
      }
    } catch (error) {
      Logger.log(`Auto-connect failed: ${error.message}`, "error");
    }
  }

  /**
   * Connect to Arc device
   */
  async connect() {
    if (this.isConnected) {
      Logger.log("Arc already connected", "hardware");
      return true;
    }

    try {
      // First try to use an already authorized port
      const existingPorts = await navigator.serial.getPorts();
      
      if (existingPorts.length > 0) {
        Logger.log("Using previously authorized port", "hardware");
        this.port = existingPorts[0];
        
        // Close port if it's already open
        if (this.port.readable || this.port.writable) {
          try {
            await this.port.close();
          } catch (e) {
            // Ignore close errors
          }
        }
      } else {
        // Request new port access
        Logger.log("Requesting new port access", "hardware");
        this.port = await navigator.serial.requestPort();
      }

      await this.openPort();
      return true;
    } catch (error) {
      if (error.name === 'NotFoundError') {
        Logger.log("No Arc selected or user cancelled", "hardware");
      } else {
        Logger.log(`Failed to connect to Arc: ${error.message}`, "error");
      }
      eventBus.emit("arc:connectionError", { error: error.message });
      return false;
    }
  }

  /**
   * Open the serial port
   */
  async openPort() {
    try {
      await this.port.open({ baudRate: 115200 });
      
      this.writer = this.port.writable.getWriter();
      this.reader = this.port.readable.getReader();
      
      this.isConnected = true;
      // Arc connected successfully
      
      // Start reading data
      this.readLoop();
      
      // Take control after a short delay
      setTimeout(() => {
        this.takeControl();
      }, 500);
      
      // Emit connection event
      eventBus.emit("arc:connected", { 
        timestamp: Date.now(),
        parameterValues: this.parameterValues,
        autoConnect: this.isAutoConnecting || false 
      });
      
    } catch (error) {
      Logger.log(`Failed to open Arc port: ${error.message}`, "error");
      throw error;
    }
  }

  /**
   * Take control of the Arc using Lua commands
   */
  async takeControl() {
    // Taking control of Arc...
    
    const commands = [
      // Stop any running metros and functions
      'metro.allstop()',
      'old_tick = tick; tick = function() end',
      'old_redraw = redraw; redraw = function() end',
      
      // Initialize parameter tracking
      'params = {0.5, 0.5, 0.0, 0.0}',
      
      // Function to update ring LEDs based on parameter value
      'function update_ring(n) ' +
        'local val = params[n]; ' +
        'local num_leds = math.floor(val * 64); ' +
        'arc_led_all(n, 0); ' +
        'for i=1,num_leds do ' +
          'local pos = ((32 + i - 2) % 64) + 1; ' +  // Start from bottom (LED 33)
          'arc_led(n, pos, 15); ' +
        'end; ' +
        'arc_refresh() ' +
      'end',
      
      // Set up encoder handler
      'arc = function(n, d) ' +
        'params[n] = math.max(0, math.min(1, params[n] + (d * 0.01))); ' +
        'update_ring(n); ' +
        'print(string.format("ENC:%d:%d:%.3f", n, d, params[n])) ' +
      'end',
      
      // Initialize LED rings with current values
      `params = {${this.parameterValues.join(', ')}}`,
      'for i=1,4 do update_ring(i) end',
      
      // Confirm control
      'print("Arc controlled")'
    ];
    
    for (const cmd of commands) {
      await this.sendCommand(cmd);
      await new Promise(r => setTimeout(r, 100));
    }
    
    // Arc control active
    
    // Initialize LEDs after control is established
    setTimeout(() => {
      this.initializeLEDs();
    }, 500);
  }

  /**
   * Initialize LED rings with current parameter values
   */
  async initializeLEDs() {
    // Initializing Arc LEDs...
    
    for (let ring = 0; ring < 4; ring++) {
      await this.updateLEDRing(ring, this.parameterValues[ring]);
      await new Promise(r => setTimeout(r, 50));
    }
    
    // Arc LEDs initialized
  }

  /**
   * Send Lua command to Arc
   */
  async sendCommand(cmd) {
    if (!this.writer) return;
    
    try {
      const bytes = new TextEncoder().encode(cmd + '\r\n');
      await this.writer.write(bytes);
    } catch (error) {
      Logger.log(`Failed to send command: ${error.message}`, "error");
      this.handleDisconnection();
    }
  }

  /**
   * Disconnect from Arc
   */
  async disconnect() {
    this.isConnected = false;

    try {
      if (this.reader) {
        try {
          await this.reader.cancel();
        } catch (e) {
          // Ignore errors during cancel
        }
        try {
          this.reader.releaseLock();
        } catch (e) {
          // Ignore if already released
        }
        this.reader = null;
      }

      if (this.writer) {
        try {
          this.writer.releaseLock();
        } catch (e) {
          // Ignore if already released
        }
        this.writer = null;
      }

      if (this.port) {
        try {
          await this.port.close();
        } catch (e) {
          Logger.log(`Error closing port: ${e.message}`, "error");
        }
        this.port = null;
      }

      Logger.log("Arc disconnected", "hardware");
      eventBus.emit("arc:disconnected", { timestamp: Date.now() });
      
    } catch (error) {
      Logger.log(`Error disconnecting Arc: ${error.message}`, "error");
    }
  }

  /**
   * Read data from Arc continuously
   */
  async readLoop() {
    try {
      while (this.isConnected && this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        
        this.processIncomingData(value);
      }
    } catch (error) {
      if (this.isConnected) {
        Logger.log(`Arc read error: ${error.message}`, "error");
        this.handleDisconnection();
      }
    }
  }

  /**
   * Process incoming data from Arc
   */
  processIncomingData(data) {
    // Convert to text and add to buffer
    const text = new TextDecoder().decode(data);
    this.textBuffer += text;
    
    // Process complete lines
    const lines = this.textBuffer.split('\n');
    this.textBuffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Handle encoder messages with value
      if (trimmed.startsWith('ENC:')) {
        const match = trimmed.match(/ENC:(\d+):(-?\d+):([\d.]+)/);
        if (match) {
          const encoder = parseInt(match[1]) - 1; // Convert from 1-based to 0-based
          const delta = parseInt(match[2]);
          const value = parseFloat(match[3]);
          
          if (encoder >= 0 && encoder < 4) {
            this.handleEncoderUpdate(encoder, delta, value);
          }
        }
      } else {
        // Log other messages
        // Arc message: trimmed
      }
    }
  }

  /**
   * Handle encoder update from Arc
   */
  handleEncoderUpdate(encoder, delta, value) {
    // Update internal state
    this.encoderPositions[encoder] += delta;
    this.parameterValues[encoder] = value;
    
    // Emit parameter change event
    const parameterNames = ['volume', 'brightness', 'detune', 'reverb'];
    eventBus.emit("arc:parameterChanged", {
      parameter: parameterNames[encoder],
      value: value,
      encoder: encoder,
      delta: delta * 0.01
    });
    
    Logger.log(`Arc ${parameterNames[encoder]}: ${value.toFixed(2)}`, "hardware");
  }

  /**
   * Update LED ring to show parameter value
   */
  async updateLEDRing(ring, value) {
    if (!this.isConnected || !this.writer) return;
    
    // Skip if value hasn't changed significantly
    const threshold = 0.02;
    if (Math.abs(value - this.lastLedValues[ring]) < threshold) {
      return;
    }
    
    // Rate limit per ring
    const now = Date.now();
    if (now - this.lastLedUpdate[ring] < 50) {
      this.ledUpdatePending[ring] = true;
      
      if (!this.ledUpdateTimer) {
        this.ledUpdateTimer = setTimeout(() => {
          this.ledUpdateTimer = null;
          this.sendPendingLEDUpdates();
        }, 50);
      }
      return;
    }
    
    this.lastLedValues[ring] = value;
    this.lastLedUpdate[ring] = now;
    
    // Send Lua command to update the ring
    const cmd = `params[${ring + 1}] = ${value}; update_ring(${ring + 1})`;
    await this.sendCommand(cmd);
  }

  /**
   * Send pending LED updates
   */
  async sendPendingLEDUpdates() {
    const now = Date.now();
    for (let ring = 0; ring < 4; ring++) {
      if (this.ledUpdatePending[ring] && (now - this.lastLedUpdate[ring] >= 50)) {
        await this.updateLEDRing(ring, this.parameterValues[ring]);
        this.ledUpdatePending[ring] = false;
        this.lastLedUpdate[ring] = now;
        this.lastLedValues[ring] = this.parameterValues[ring];
      }
    }
  }

  /**
   * Set parameter value programmatically
   */
  setParameterValue(parameter, value) {
    const paramMap = {
      'volume': 0,
      'brightness': 1,
      'detune': 2,
      'reverb': 3
    };
    
    const encoder = paramMap[parameter];
    if (encoder === undefined) return;
    
    const clampedValue = Math.max(0, Math.min(1, value));
    this.parameterValues[encoder] = clampedValue;
    this.updateLEDRing(encoder, clampedValue);
  }

  /**
   * Handle Arc disconnection
   */
  handleDisconnection() {
    this.disconnect();
    
    // Attempt to reconnect after a delay
    if (this.autoConnectEnabled) {
      setTimeout(() => {
        Logger.log("Attempting to reconnect to Arc...", "hardware");
        this.autoConnect();
      }, 3000);
    }
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Listen for manual connect requests
    eventBus.on("arc:requestConnect", () => {
      this.connect();
    });
    
    // Listen for disconnect requests
    eventBus.on("arc:requestDisconnect", () => {
      this.disconnect();
    });
    
    // Listen for parameter updates from UI
    eventBus.on("ui:arcParameterChanged", (data) => {
      this.setParameterValue(data.parameter, data.value);
    });
  }

  /**
   * Get current parameter values
   */
  getParameterValues() {
    return {
      volume: this.parameterValues[0],
      brightness: this.parameterValues[1],
      detune: this.parameterValues[2],
      reverb: this.parameterValues[3]
    };
  }

  /**
   * Check if Arc is connected
   */
  get connected() {
    return this.isConnected;
  }
}

// Export singleton instance
export const arcManager = new ArcManager();