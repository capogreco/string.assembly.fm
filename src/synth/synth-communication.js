// synth-communication.js
// WebRTC communication and message handling for synths

export class SynthCommunication {
    constructor(synthId, options = {}) {
        this.synthId = synthId;
        this.options = {
            enableLogging: true,
            heartbeatInterval: 30000,
            reconnectDelay: 5000,
            maxReconnectAttempts: 5,
            ...options
        };
        
        // WebSocket connection to signaling server
        this.ws = null;
        this.wsUrl = null;
        
        // WebRTC connections to controllers
        this.controllers = new Map();
        this.pendingConnections = new Map();
        
        // Connection state
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.heartbeatTimer = null;
        
        // Event handlers
        this.eventHandlers = {
            'message': [],
            'program': [],
            'command': [],
            'ping': [],
            'connected': [],
            'disconnected': [],
            'error': []
        };
        
        // WebRTC configuration
        this.rtcConfig = {
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" }
            ]
        };
        
        // Message builders
        this.MessageBuilder = {
            register: () => ({
                type: 'register',
                role: 'synth',
                synth_id: this.synthId,
                timestamp: Date.now()
            }),
            
            pong: (originalTimestamp, status = {}) => ({
                type: 'pong',
                timestamp: originalTimestamp,
                response_time: Date.now(),
                status: {
                    audioEnabled: false,
                    mode: 'synthesis',
                    powered: true,
                    ...status
                }
            }),
            
            offer: (controllerId, offer) => ({
                type: 'offer',
                from: this.synthId,
                to: controllerId,
                offer: offer
            }),
            
            answer: (controllerId, answer) => ({
                type: 'answer',
                from: this.synthId,
                to: controllerId,
                answer: answer
            }),
            
            ice_candidate: (controllerId, candidate) => ({
                type: 'ice_candidate',
                from: this.synthId,
                to: controllerId,
                candidate: candidate
            })
        };
    }
    
    // Add event listener
    on(event, handler) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].push(handler);
        }
    }
    
    // Remove event listener
    off(event, handler) {
        if (this.eventHandlers[event]) {
            const index = this.eventHandlers[event].indexOf(handler);
            if (index > -1) {
                this.eventHandlers[event].splice(index, 1);
            }
        }
    }
    
    // Emit event to handlers
    emit(event, ...args) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(handler => {
                try {
                    handler(...args);
                } catch (error) {
                    this.log(`Error in ${event} handler: ${error.message}`, 'error');
                }
            });
        }
    }
    
    // Connect to signaling server
    async connect(wsUrl = null) {
        this.wsUrl = wsUrl || this.wsUrl || `ws://${window.location.host}/ws`;
        
        try {
            // Fetch ICE servers if available
            await this.fetchIceServers();
            
            // Connect WebSocket
            this.connectWebSocket();
            
        } catch (error) {
            this.log(`Failed to connect: ${error.message}`, 'error');
            this.emit('error', error);
            throw error;
        }
    }
    
    // Fetch ICE servers from server
    async fetchIceServers() {
        try {
            const response = await fetch('/api/ice-servers');
            if (response.ok) {
                const iceServers = await response.json();
                this.rtcConfig.iceServers = iceServers;
                this.log('Updated ICE servers from server');
            }
        } catch (error) {
            this.log('Using default ICE servers', 'warn');
        }
    }
    
    // Connect WebSocket to signaling server
    connectWebSocket() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }
        
        this.log(`Connecting to signaling server: ${this.wsUrl}`);
        
        this.ws = new WebSocket(this.wsUrl);
        
        this.ws.onopen = () => {
            this.log('Connected to signaling server');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            // Register as synth
            this.sendMessage(this.MessageBuilder.register());
            
            // Start heartbeat
            this.startHeartbeat();
            
            this.emit('connected');
        };
        
        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleSignalingMessage(message);
            } catch (error) {
                this.log(`Failed to parse signaling message: ${error.message}`, 'error');
            }
        };
        
        this.ws.onclose = () => {
            this.log('Disconnected from signaling server');
            this.isConnected = false;
            this.stopHeartbeat();
            this.emit('disconnected');
            
            // Attempt reconnection
            this.scheduleReconnect();
        };
        
        this.ws.onerror = (error) => {
            this.log(`WebSocket error: ${error}`, 'error');
            this.emit('error', error);
        };
    }
    
    // Handle signaling messages
    async handleSignalingMessage(message) {
        this.emit('message', message);
        
        switch (message.type) {
            case 'offer':
                await this.handleOffer(message);
                break;
                
            case 'answer':
                await this.handleAnswer(message);
                break;
                
            case 'ice_candidate':
                await this.handleIceCandidate(message);
                break;
                
            case 'ping':
                this.handlePing(message);
                break;
                
            default:
                this.log(`Unknown signaling message type: ${message.type}`, 'warn');
        }
    }
    
    // Handle WebRTC offer from controller
    async handleOffer(message) {
        const controllerId = message.from;
        this.log(`Received offer from controller ${controllerId}`);
        
        try {
            // Create peer connection
            const peerConnection = new RTCPeerConnection(this.rtcConfig);
            this.setupPeerConnection(peerConnection, controllerId);
            
            // Set remote description
            await peerConnection.setRemoteDescription(message.offer);
            
            // Create answer
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            // Send answer
            this.sendMessage(this.MessageBuilder.answer(controllerId, answer));
            
            // Store connection
            this.pendingConnections.set(controllerId, peerConnection);
            
        } catch (error) {
            this.log(`Failed to handle offer from ${controllerId}: ${error.message}`, 'error');
        }
    }
    
    // Handle WebRTC answer from controller
    async handleAnswer(message) {
        const controllerId = message.from;
        const peerConnection = this.pendingConnections.get(controllerId);
        
        if (!peerConnection) {
            this.log(`No pending connection for controller ${controllerId}`, 'warn');
            return;
        }
        
        try {
            await peerConnection.setRemoteDescription(message.answer);
            this.log(`Set remote description for controller ${controllerId}`);
        } catch (error) {
            this.log(`Failed to set remote description for ${controllerId}: ${error.message}`, 'error');
        }
    }
    
    // Handle ICE candidate
    async handleIceCandidate(message) {
        const controllerId = message.from;
        const peerConnection = this.pendingConnections.get(controllerId) || 
                               this.controllers.get(controllerId)?.peerConnection;
        
        if (!peerConnection) {
            this.log(`No connection for ICE candidate from ${controllerId}`, 'warn');
            return;
        }
        
        try {
            await peerConnection.addIceCandidate(message.candidate);
        } catch (error) {
            this.log(`Failed to add ICE candidate from ${controllerId}: ${error.message}`, 'error');
        }
    }
    
    // Handle ping from controller
    handlePing(message) {
        const controllerId = message.from;
        
        // Send pong response
        const pongMessage = this.MessageBuilder.pong(message.timestamp, {
            audioEnabled: true, // Will be set by the synth
            mode: 'synthesis',
            powered: true
        });
        
        this.sendToPeer(controllerId, pongMessage);
        this.emit('ping', controllerId, message);
    }
    
    // Setup peer connection event handlers
    setupPeerConnection(peerConnection, controllerId) {
        // ICE candidate handling
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendMessage(this.MessageBuilder.ice_candidate(controllerId, event.candidate));
            }
        };
        
        // Connection state changes
        peerConnection.onconnectionstatechange = () => {
            this.log(`Connection state with ${controllerId}: ${peerConnection.connectionState}`);
            
            if (peerConnection.connectionState === 'connected') {
                // Move from pending to active connections
                if (this.pendingConnections.has(controllerId)) {
                    this.pendingConnections.delete(controllerId);
                }
            } else if (peerConnection.connectionState === 'failed' || 
                      peerConnection.connectionState === 'disconnected') {
                this.cleanupController(controllerId);
            }
        };
        
        // Data channel handling
        peerConnection.ondatachannel = (event) => {
            const channel = event.channel;
            this.log(`Received data channel: ${channel.label} from ${controllerId}`);
            
            channel.onopen = () => {
                this.log(`Data channel ${channel.label} opened with ${controllerId}`);
                
                // Store controller connection info
                if (!this.controllers.has(controllerId)) {
                    this.controllers.set(controllerId, {
                        peerConnection: peerConnection,
                        channels: {}
                    });
                }
                
                this.controllers.get(controllerId).channels[channel.label] = channel;
                
                // Setup message handling for this channel
                this.setupDataChannel(channel, controllerId);
            };
        };
    }
    
    // Setup data channel message handling
    setupDataChannel(channel, controllerId) {
        channel.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handlePeerMessage(controllerId, message, channel.label);
            } catch (error) {
                this.log(`Failed to parse message from ${controllerId}: ${error.message}`, 'error');
            }
        };
        
        channel.onclose = () => {
            this.log(`Data channel ${channel.label} closed with ${controllerId}`);
        };
        
        channel.onerror = (error) => {
            this.log(`Data channel error with ${controllerId}: ${error}`, 'error');
        };
    }
    
    // Handle messages from peer controllers
    handlePeerMessage(controllerId, message, channelLabel) {
        this.emit('message', message, controllerId, channelLabel);
        
        switch (message.type) {
            case 'program':
                this.emit('program', message, controllerId);
                break;
                
            case 'command':
                this.emit('command', message, controllerId);
                break;
                
            case 'ping':
                this.handlePing({ ...message, from: controllerId });
                break;
                
            default:
                this.log(`Unknown peer message type: ${message.type}`, 'warn');
        }
    }
    
    // Send message to signaling server
    sendMessage(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            this.log('Cannot send message: not connected to signaling server', 'warn');
        }
    }
    
    // Send message to specific peer controller
    sendToPeer(controllerId, message, channelLabel = 'param') {
        const controller = this.controllers.get(controllerId);
        if (!controller || !controller.channels[channelLabel]) {
            this.log(`Cannot send to ${controllerId}: no ${channelLabel} channel`, 'warn');
            return false;
        }
        
        const channel = controller.channels[channelLabel];
        if (channel.readyState === 'open') {
            channel.send(JSON.stringify(message));
            return true;
        } else {
            this.log(`Cannot send to ${controllerId}: ${channelLabel} channel not open`, 'warn');
            return false;
        }
    }
    
    // Broadcast message to all connected controllers
    broadcast(message, channelLabel = 'param') {
        let sent = 0;
        this.controllers.forEach((controller, controllerId) => {
            if (this.sendToPeer(controllerId, message, channelLabel)) {
                sent++;
            }
        });
        return sent;
    }
    
    // Get list of connected controllers
    getConnectedControllers() {
        return Array.from(this.controllers.keys());
    }
    
    // Check if connected to specific controller
    isConnectedTo(controllerId) {
        const controller = this.controllers.get(controllerId);
        return controller && 
               controller.peerConnection.connectionState === 'connected' &&
               controller.channels.param?.readyState === 'open';
    }
    
    // Clean up controller connection
    cleanupController(controllerId) {
        const controller = this.controllers.get(controllerId);
        if (controller) {
            // Close all channels
            Object.values(controller.channels).forEach(channel => {
                if (channel.readyState === 'open') {
                    channel.close();
                }
            });
            
            // Close peer connection
            controller.peerConnection.close();
            
            // Remove from maps
            this.controllers.delete(controllerId);
            this.pendingConnections.delete(controllerId);
            
            this.log(`Cleaned up connection to controller ${controllerId}`);
        }
    }
    
    // Start heartbeat timer
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.sendMessage({ type: 'heartbeat', synth_id: this.synthId });
            }
        }, this.options.heartbeatInterval);
    }
    
    // Stop heartbeat timer
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
    
    // Schedule reconnection attempt
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
            this.log('Max reconnection attempts reached', 'error');
            return;
        }
        
        this.reconnectAttempts++;
        const delay = this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        
        setTimeout(() => {
            if (!this.isConnected) {
                this.connectWebSocket();
            }
        }, delay);
    }
    
    // Disconnect from all connections
    disconnect() {
        this.log('Disconnecting from all connections');
        
        // Close WebSocket
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        // Clean up all controller connections
        this.controllers.forEach((_, controllerId) => {
            this.cleanupController(controllerId);
        });
        
        // Clean up pending connections
        this.pendingConnections.forEach((peerConnection, controllerId) => {
            peerConnection.close();
        });
        this.pendingConnections.clear();
        
        // Stop heartbeat
        this.stopHeartbeat();
        
        this.isConnected = false;
        this.emit('disconnected');
    }
    
    // Get connection statistics
    getStats() {
        return {
            connected: this.isConnected,
            controllers: this.controllers.size,
            pendingConnections: this.pendingConnections.size,
            reconnectAttempts: this.reconnectAttempts
        };
    }
    
    // Logging utility
    log(message, level = 'info') {
        if (!this.options.enableLogging) return;
        
        const timestamp = new Date().toISOString().substr(11, 12);
        const prefix = `[${timestamp}] [${this.synthId}] [COMM]`;
        
        switch (level) {
            case 'error':
                console.error(`${prefix} ${message}`);
                break;
            case 'warn':
                console.warn(`${prefix} ${message}`);
                break;
            case 'info':
            default:
                console.log(`${prefix} ${message}`);
                break;
        }
    }
}

// Export message type constants
export const MessageTypes = {
    PROGRAM: 'program',
    COMMAND: 'command',
    PING: 'ping',
    PONG: 'pong',
    OFFER: 'offer',
    ANSWER: 'answer',
    ICE_CANDIDATE: 'ice_candidate',
    REGISTER: 'register',
    HEARTBEAT: 'heartbeat'
};

// Export command types
export const CommandTypes = {
    POWER: 'power',
    SAVE: 'save',
    LOAD: 'load',
    CALIBRATE: 'calibrate'
};