// V4 Minimal Synth - Main Entry Point
// This version connects to a controller that uses NetworkCoordinator

import { Logger } from '../js/modules/core/Logger.js';
import { eventBus } from '../js/modules/core/EventBus.js';
import { webSocketManager } from '../js/modules/network/WebSocketManager.js';
import { webRTCManager } from '../js/modules/network/WebRTCManager.js';
import { SystemConfig } from '../js/config/system.config.js';

// Enable logging for debugging
Logger.enable('connections');
Logger.enable('messages');
Logger.enable('errors');
Logger.enable('lifecycle');

// State management
let clientId = null;
let connectedController = null;

// DOM elements
const elements = {
    wsStatus: document.getElementById('ws-status'),
    wsState: document.getElementById('ws-state'),
    rtcStatus: document.getElementById('rtc-status'),
    rtcState: document.getElementById('rtc-state'),
    iceStatus: document.getElementById('ice-status'),
    iceState: document.getElementById('ice-state'),
    dcStatus: document.getElementById('dc-status'),
    dcState: document.getElementById('dc-state'),
    clientIdDiv: document.getElementById('client-id'),
    controllerList: document.getElementById('controller-list'),
    messageInput: document.getElementById('message-input'),
    sendBtn: document.getElementById('send-btn'),
    clearLogBtn: document.getElementById('clear-log-btn'),
    refreshControllersBtn: document.getElementById('refresh-controllers-btn'),
    logDiv: document.getElementById('log')
};

// Logging functions
function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${timestamp}] ${message}`;
    elements.logDiv.appendChild(entry);
    elements.logDiv.scrollTop = elements.logDiv.scrollHeight;
    
    // Also log to Logger
    const category = type === 'error' ? 'errors' : 
                    type === 'data' ? 'messages' : 
                    type === 'success' ? 'connections' : 'lifecycle';
    Logger.log(message, category);
}

// Update UI status
function updateStatus(type, state, className) {
    const statusEl = elements[`${type}Status`];
    const stateEl = elements[`${type}State`];
    
    statusEl.className = `status ${className}`;
    stateEl.textContent = state;
}

// Set up event listeners
function setupEventListeners() {
    // WebSocket events
    eventBus.on('websocket:connected', () => {
        log('WebSocket connected', 'success');
        updateStatus('ws', 'Connected', 'connected');
        
        // Register as synth
        webSocketManager.send({
            type: 'register',
            role: 'synth',
            id: clientId
        });
        
        log(`Registered as synth with ID: ${clientId}`, 'info');
        
        // Request controller list
        requestControllers();
    });
    
    eventBus.on('websocket:disconnected', () => {
        log('WebSocket disconnected', 'error');
        updateStatus('ws', 'Disconnected', 'disconnected');
        
        // Clean up WebRTC connections
        webRTCManager.closeAllConnections();
    });
    
    eventBus.on('websocket:message', (data) => {
        const message = data.message;
        
        switch (message.type) {
            case 'controllers-list':
                handleControllersList(message);
                break;
            default:
                // Let WebRTCManager handle offer/answer/ice messages
                if (message.type !== 'offer' && message.type !== 'answer' && 
                    message.type !== 'ice' && message.type !== 'ice-candidate') {
                    log(`Received message type: ${message.type}`, 'info');
                }
        }
    });
    
    eventBus.on('websocket:error', (error) => {
        log(`WebSocket error: ${error.message || error}`, 'error');
    });
    
    // WebRTC events
    eventBus.on('webrtc:peerCreated', (data) => {
        log(`Peer connection created for: ${data.peerId}`, 'info');
    });
    
    eventBus.on('webrtc:connected', (data) => {
        log(`WebRTC connected to: ${data.peerId}`, 'success');
        updateStatus('rtc', 'Connected', 'connected');
        
        // Send initial message when connected
        setTimeout(() => {
            webRTCManager.sendDataMessage(connectedController, 'Hello from synth!');
            log('Sent: Hello from synth!', 'data');
        }, 100);
    });
    
    eventBus.on('webrtc:disconnected', (data) => {
        log(`WebRTC disconnected from: ${data.peerId}`, 'error');
        if (data.peerId === connectedController) {
            connectedController = null;
        }
        updateStatus('rtc', 'Disconnected', 'disconnected');
        updateStatus('ice', 'Disconnected', 'disconnected');
        updateStatus('dc', 'Closed', 'disconnected');
        elements.messageInput.disabled = true;
        elements.sendBtn.disabled = true;
    });
    
    eventBus.on('webrtc:connectionStateChanged', (data) => {
        log(`Connection state changed: ${data.state}`, 'info');
        
        switch (data.state) {
            case 'connected':
                updateStatus('rtc', 'Connected', 'connected');
                break;
            case 'disconnected':
            case 'failed':
            case 'closed':
                updateStatus('rtc', 'Disconnected', 'disconnected');
                break;
            default:
                updateStatus('rtc', data.state, 'connecting');
        }
    });
    
    eventBus.on('webrtc:iceConnectionStateChanged', (data) => {
        log(`ICE state changed: ${data.state}`, 'info');
        
        switch (data.state) {
            case 'connected':
            case 'completed':
                updateStatus('ice', 'Connected', 'connected');
                break;
            case 'disconnected':
                updateStatus('ice', 'Disconnected', 'disconnected');
                break;
            case 'failed':
                updateStatus('ice', 'Failed', 'disconnected');
                break;
            default:
                updateStatus('ice', data.state, 'connecting');
        }
    });
    
    eventBus.on('webrtc:dataChannelOpen', (data) => {
        log(`Data channel opened with: ${data.peerId}`, 'success');
        updateStatus('dc', 'Open', 'connected');
        elements.messageInput.disabled = false;
        elements.sendBtn.disabled = false;
    });
    
    eventBus.on('webrtc:dataMessage', (data) => {
        // Filter out system messages (ping/pong)
        if (data.message.type === 'PING' || data.message.type === 'PONG') {
            return;
        }
        
        const messageText = typeof data.message === 'string' ? 
            data.message : 
            JSON.stringify(data.message);
        
        log(`Received: ${messageText}`, 'data');
    });
}

// Request available controllers
function requestControllers() {
    log('Requesting controller list', 'info');
    webSocketManager.send({
        type: 'request-controllers',
        from: clientId
    });
}

// Handle controllers list
function handleControllersList(message) {
    const controllers = message.controllers || [];
    log(`Received ${controllers.length} controllers`, 'info');
    
    elements.controllerList.innerHTML = '';
    
    if (controllers.length === 0) {
        elements.controllerList.innerHTML = '<div>No controllers found</div>';
    } else {
        controllers.forEach(controller => {
            const item = document.createElement('div');
            item.className = 'controller-item';
            item.textContent = controller;
            item.onclick = () => connectToController(controller);
            elements.controllerList.appendChild(item);
        });
        
        // Auto-connect to first controller
        if (!connectedController) {
            connectToController(controllers[0]);
        }
    }
}

// Connect to a controller
async function connectToController(controllerId) {
    try {
        log(`Initiating connection to controller: ${controllerId}`, 'info');
        connectedController = controllerId;
        
        // Create peer connection and offer
        const peerConnection = webRTCManager.createPeerConnection(controllerId, true);
        
        if (!peerConnection) {
            throw new Error('Failed to create peer connection');
        }
        
        updateStatus('rtc', 'Connecting...', 'connecting');
        updateStatus('ice', 'Gathering...', 'connecting');
        updateStatus('dc', 'Creating...', 'connecting');
        
        // Create data channel first (before creating offer)
        const dataChannel = peerConnection.createDataChannel('data', {
            ordered: true
        });
        
        // Create offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // Send offer via WebSocket
        webSocketManager.send({
            type: 'offer',
            to: controllerId,
            from: clientId,
            offer: offer
        });
        
        log('Sent offer to controller', 'info');
        
    } catch (error) {
        log(`Error connecting to controller: ${error.message}`, 'error');
        updateStatus('rtc', 'Failed', 'disconnected');
    }
}

// Send message through data channel
function sendMessage() {
    const message = elements.messageInput.value.trim();
    if (message && connectedController) {
        webRTCManager.sendDataMessage(connectedController, message);
        log(`Sent: ${message}`, 'data');
        elements.messageInput.value = '';
    }
}

// Clear log
function clearLog() {
    elements.logDiv.innerHTML = '';
    log('Log cleared', 'info');
}

// Initialize the application
async function initialize() {
    log('V4 Minimal Synth starting...', 'info');
    log('Connecting to controller that uses NetworkCoordinator', 'info');
    
    // Generate client ID
    clientId = 'synth-' + Math.random().toString(36).substr(2, 9);
    elements.clientIdDiv.textContent = clientId;
    
    // Set up event listeners
    setupEventListeners();
    
    // Set up UI event listeners
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    elements.clearLogBtn.addEventListener('click', clearLog);
    elements.refreshControllersBtn.addEventListener('click', requestControllers);
    
    try {
        // Initialize WebRTC Manager
        webRTCManager.initialize();
        log('WebRTCManager initialized', 'success');
        
        // Connect WebSocket
        updateStatus('ws', 'Connecting...', 'connecting');
        const connected = await webSocketManager.connect(clientId);
        
        if (!connected) {
            throw new Error('Failed to connect to WebSocket');
        }
        
    } catch (error) {
        log(`Initialization error: ${error.message}`, 'error');
        updateStatus('ws', 'Failed', 'disconnected');
    }
}

// Start the application
initialize().catch(error => {
    log(`Fatal initialization error: ${error.message}`, 'error');
    Logger.log(`Fatal initialization error: ${error.stack}`, 'errors');
});