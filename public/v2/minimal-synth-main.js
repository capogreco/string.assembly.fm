// V2 Minimal Synth - Main Entry Point
// This version uses the application's core modules instead of inline code

import { Logger } from '../js/modules/core/Logger.js';
import { eventBus } from '../js/modules/core/EventBus.js';
import { WebSocketManager } from '../js/modules/network/WebSocketManager.js';
import { SystemConfig } from '../js/config/system.config.js';

// Enable logging for debugging
Logger.enable('connections');
Logger.enable('messages');
Logger.enable('errors');
Logger.enable('lifecycle');

// State management
let clientId = null;
let peerConnection = null;
let dataChannel = null;
let wsManager = null;
let connectedController = null;
let iceServers = null;

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
    
    // Request controller list
    requestControllers();
}

function handleWebSocketDisconnected() {
    log('WebSocket disconnected', 'error');
    updateStatus('ws', 'Disconnected', 'disconnected');
    
    // Clean up any active connections
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
}

function handleWebSocketMessage(data) {
    const message = data.message;
    
    switch (message.type) {
        case 'controllers-list':
            handleControllersList(message);
            break;
        case 'answer':
            handleAnswer(message);
            break;
        case 'ice':
        case 'ice-candidate':
            handleIceCandidate(message);
            break;
        default:
            log(`Unknown message type: ${message.type}`, 'info');
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

// Fetch ICE servers
async function fetchIceServers() {
    if (iceServers) return iceServers;
    
    try {
        const response = await fetch('/ice-servers');
        if (response.ok) {
            iceServers = await response.json();
            log('Fetched ICE servers from server', 'info');
        } else {
            throw new Error('Failed to fetch ICE servers');
        }
    } catch (error) {
        log('Using fallback STUN server', 'info');
        iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    }
    
    return iceServers;
}

// Connect to a controller
async function connectToController(controllerId) {
    try {
        if (peerConnection) {
            log('Closing existing connection', 'info');
            peerConnection.close();
            peerConnection = null;
        }
        
        log(`Connecting to controller: ${controllerId}`, 'info');
        connectedController = controllerId;
        
        // Create peer connection
        const servers = await fetchIceServers();
        peerConnection = new RTCPeerConnection({ iceServers: servers });
        
        updateStatus('rtc', 'Connecting...', 'connecting');
        updateStatus('ice', 'Gathering...', 'connecting');
        
        // Create data channel
        dataChannel = peerConnection.createDataChannel('main', {
            ordered: true
        });
        setupDataChannel();
        updateStatus('dc', 'Creating...', 'connecting');
        
        // Set up peer connection event handlers
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                log('Sending ICE candidate', 'info');
                wsManager.send({
                    type: 'ice',
                    to: controllerId,
                    from: clientId,
                    candidate: event.candidate
                });
            }
        };
        
        peerConnection.oniceconnectionstatechange = () => {
            const state = peerConnection.iceConnectionState;
            log(`ICE connection state: ${state}`, 'info');
            
            switch (state) {
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
                    updateStatus('ice', state, 'connecting');
            }
        };
        
        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState;
            log(`Connection state: ${state}`, 'info');
            
            switch (state) {
                case 'connected':
                    updateStatus('rtc', 'Connected', 'connected');
                    break;
                case 'disconnected':
                case 'failed':
                case 'closed':
                    updateStatus('rtc', 'Disconnected', 'disconnected');
                    break;
                default:
                    updateStatus('rtc', state, 'connecting');
            }
        };
        
        // Create offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        log('Created and set local description', 'info');
        
        // Send offer
        wsManager.send({
            type: 'offer',
            to: controllerId,
            from: clientId,
            offer: offer
        });
        log('Sent offer', 'info');
        
    } catch (error) {
        log(`Error connecting to controller: ${error.message}`, 'error');
        updateStatus('rtc', 'Failed', 'disconnected');
    }
}

// WebRTC handlers
async function handleAnswer(message) {
    try {
        log('Received answer', 'info');
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
        log('Set remote description', 'info');
    } catch (error) {
        log(`Error handling answer: ${error.message}`, 'error');
    }
}

async function handleIceCandidate(message) {
    try {
        if (peerConnection && message.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
            log('Added ICE candidate', 'info');
        }
    } catch (error) {
        log(`Error adding ICE candidate: ${error.message}`, 'error');
    }
}

// Data channel setup
function setupDataChannel() {
    dataChannel.onopen = () => {
        log('Data channel opened', 'success');
        updateStatus('dc', 'Open', 'connected');
        elements.messageInput.disabled = false;
        elements.sendBtn.disabled = false;
        
        // Send initial message
        dataChannel.send('Hello from synth!');
        log('Sent: Hello from synth!', 'data');
    };
    
    dataChannel.onclose = () => {
        log('Data channel closed', 'error');
        updateStatus('dc', 'Closed', 'disconnected');
        elements.messageInput.disabled = true;
        elements.sendBtn.disabled = true;
    };
    
    dataChannel.onmessage = (event) => {
        log(`Received: ${event.data}`, 'data');
    };
    
    dataChannel.onerror = (error) => {
        log(`Data channel error: ${error}`, 'error');
    };
}

// Send message through data channel
function sendMessage() {
    const message = elements.messageInput.value.trim();
    if (message && dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(message);
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
    log('V2 Minimal Synth starting...', 'info');
    log('Using application modules: Logger, EventBus, WebSocketManager', 'info');
    
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