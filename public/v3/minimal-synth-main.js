// V3 Minimal Synth - Main Entry Point
// This version uses WebRTCManager instead of manual RTCPeerConnection logic

import { Logger } from '../js/modules/core/Logger.js';
import { eventBus } from '../js/modules/core/EventBus.js';
import { WebSocketManager } from '../js/modules/network/WebSocketManager.js';
import { WebRTCManager } from '../js/modules/network/WebRTCManager.js';
import { SystemConfig } from '../js/config/system.config.js';

// Enable logging for debugging
Logger.enable('connections');
Logger.enable('messages');
Logger.enable('errors');
Logger.enable('lifecycle');

// State management
let clientId = null;
let wsManager = null;
let webRTCManager = null;
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

// Initialize WebSocket connection
async function initializeWebSocket() {
    try {
        // Generate client ID
        clientId = 'synth-' + Math.random().toString(36).substr(2, 9);
        elements.clientIdDiv.textContent = clientId;
        
        // Create WebSocketManager instance
        const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${SystemConfig.network.websocket.path}`;
        wsManager = new WebSocketManager(wsUrl, eventBus);
        
        // Set up WebSocket event listeners
        eventBus.on('websocket:connected', handleWebSocketConnected);
        eventBus.on('websocket:disconnected', handleWebSocketDisconnected);
        eventBus.on('websocket:message', handleWebSocketMessage);
        eventBus.on('websocket:error', handleWebSocketError);
        
        // Connect
        updateStatus('ws', 'Connecting...', 'connecting');
        const connected = await wsManager.connect(clientId);
        
        if (!connected) {
            throw new Error('Failed to connect to WebSocket');
        }
        
    } catch (error) {
        log(`WebSocket initialization failed: ${error.message}`, 'error');
        updateStatus('ws', 'Failed', 'disconnected');
    }
}

// Initialize WebRTC Manager
function initializeWebRTCManager() {
    log('Initializing WebRTCManager', 'info');
    
    // Create WebRTCManager instance
    webRTCManager = new WebRTCManager(wsManager, eventBus, clientId);
    webRTCManager.initialize();
    
    // Set up WebRTC event listeners
    eventBus.on('webrtc:peerCreated', handlePeerCreated);
    eventBus.on('webrtc:connected', handleWebRTCConnected);
    eventBus.on('webrtc:disconnected', handleWebRTCDisconnected);
    eventBus.on('webrtc:connectionStateChanged', handleConnectionStateChanged);
    eventBus.on('webrtc:iceConnectionStateChanged', handleIceStateChanged);
    eventBus.on('webrtc:dataChannelOpen', handleDataChannelOpen);
    eventBus.on('webrtc:dataMessage', handleDataMessage);
    
    log('WebRTCManager initialized', 'success');
}

// WebSocket event handlers
function handleWebSocketConnected() {
    log('WebSocket connected', 'success');
    updateStatus('ws', 'Connected', 'connected');
    
    // Register as synth
    wsManager.send({
        type: 'register',
        role: 'synth',
        id: clientId
    });
    
    log(`Registered as synth with ID: ${clientId}`, 'info');
    
    // Initialize WebRTC Manager after WebSocket is connected
    initializeWebRTCManager();
    
    // Request controller list
    requestControllers();
}

function handleWebSocketDisconnected() {
    log('WebSocket disconnected', 'error');
    updateStatus('ws', 'Disconnected', 'disconnected');
    
    // Clean up WebRTC connections
    if (webRTCManager) {
        webRTCManager.closeAllConnections();
    }
}

function handleWebSocketMessage(data) {
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
}

function handleWebSocketError(error) {
    log(`WebSocket error: ${error.message || error}`, 'error');
}

// Request available controllers
function requestControllers() {
    log('Requesting controller list', 'info');
    wsManager.send({
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
        if (!webRTCManager) {
            log('WebRTCManager not initialized', 'error');
            return;
        }
        
        log(`Initiating connection to controller: ${controllerId}`, 'info');
        connectedController = controllerId;
        
        // Create peer connection and offer
        // The WebRTCManager will handle creating the peer connection when needed
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
        wsManager.send({
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

// WebRTC event handlers
function handlePeerCreated(data) {
    log(`Peer connection created for: ${data.peerId}`, 'info');
}

function handleWebRTCConnected(data) {
    log(`WebRTC connected to: ${data.peerId}`, 'success');
    updateStatus('rtc', 'Connected', 'connected');
    
    // Send initial message when connected
    setTimeout(() => {
        if (webRTCManager && connectedController) {
            webRTCManager.sendDataMessage(connectedController, 'Hello from synth!');
            log('Sent: Hello from synth!', 'data');
        }
    }, 100);
}

function handleWebRTCDisconnected(data) {
    log(`WebRTC disconnected from: ${data.peerId}`, 'error');
    if (data.peerId === connectedController) {
        connectedController = null;
    }
    updateStatus('rtc', 'Disconnected', 'disconnected');
    updateStatus('ice', 'Disconnected', 'disconnected');
    updateStatus('dc', 'Closed', 'disconnected');
    elements.messageInput.disabled = true;
    elements.sendBtn.disabled = true;
}

function handleConnectionStateChanged(data) {
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
}

function handleIceStateChanged(data) {
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
}

function handleDataChannelOpen(data) {
    log(`Data channel opened with: ${data.peerId}`, 'success');
    updateStatus('dc', 'Open', 'connected');
    elements.messageInput.disabled = false;
    elements.sendBtn.disabled = false;
}

function handleDataMessage(data) {
    // Filter out system messages (ping/pong)
    if (data.message.type === 'PING' || data.message.type === 'PONG') {
        return;
    }
    
    const messageText = typeof data.message === 'string' ? 
        data.message : 
        JSON.stringify(data.message);
    
    log(`Received: ${messageText}`, 'data');
}

// Send message through data channel
function sendMessage() {
    const message = elements.messageInput.value.trim();
    if (message && connectedController && webRTCManager) {
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
    log('V3 Minimal Synth starting...', 'info');
    log('Using WebRTCManager for all WebRTC operations', 'info');
    
    // Set up UI event listeners
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    elements.clearLogBtn.addEventListener('click', clearLog);
    elements.refreshControllersBtn.addEventListener('click', requestControllers);
    
    // Initialize WebSocket connection
    await initializeWebSocket();
}

// Start the application
initialize().catch(error => {
    log(`Initialization error: ${error.message}`, 'error');
    Logger.log(`Fatal initialization error: ${error.stack}`, 'errors');
});