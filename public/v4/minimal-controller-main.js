// V4 Minimal Controller - Main Entry Point
// This version uses WebRTCManager to handle WebRTC connections

import { Logger } from '../js/modules/core/Logger.js';
import { eventBus } from '../js/modules/core/EventBus.js';
import { SystemConfig } from '../js/config/system.config.js';
// Import WebSocketManager to ensure it's loaded and creates global instance
import '../js/modules/network/WebSocketManager.js';
// Import WebRTCManager to handle connections
import { WebRTCManager } from '../js/modules/network/WebRTCManager.js';

// Enable logging for debugging
Logger.enable('connections');
Logger.enable('messages');
Logger.enable('errors');
Logger.enable('lifecycle');

// State management
let clientId = null;
let wsManager = null;
let webRTCManager = null;
let remoteSynthId = null;
let iceServers = null;
let isReady = false; // Ready state flag

// DOM elements
const elements = {
    startBtn: document.getElementById('start-btn'),
    myIdEl: document.getElementById('my-id'),
    wsStateEl: document.getElementById('ws-state'),
    connectionStateEl: document.getElementById('connection-state'),
    iceStateEl: document.getElementById('ice-state'),
    datachannelStateEl: document.getElementById('datachannel-state'),
    eventLog: document.getElementById('event-log'),
    messagesLog: document.getElementById('messages')
};

// Logging functions
function log(message, ...args) {
    const timestamp = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.innerHTML = `<strong>${timestamp}</strong>: ${message} ${args.length > 0 ? `<pre>${JSON.stringify(args, null, 2)}</pre>` : ''}`;
    elements.eventLog.insertBefore(entry, elements.eventLog.firstChild);
    
    // Also log to Logger with V4 prefix
    Logger.log(`[V4-CTRL] ${message}`, 'lifecycle');
}

function logMessage(message, direction = 'received') {
    const timestamp = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.innerHTML = `<strong>${timestamp}</strong> [${direction.toUpperCase()}]: ${JSON.stringify(message, null, 2)}`;
    elements.messagesLog.insertBefore(entry, elements.messagesLog.firstChild);
}

// Initialize WebSocket connection
async function initializeWebSocket() {
    try {
        // Generate client ID
        clientId = 'ctrl-' + Math.random().toString(36).substr(2, 9);
        elements.myIdEl.textContent = clientId;
        
        // Use the main app's WebSocketManager
        if (window.webSocketManager) {
            wsManager = window.webSocketManager;
        } else {
            throw new Error('Main app WebSocketManager not available');
        }
        
        // Set up WebSocket event listeners on shared EventBus
        eventBus.on('websocket:connected', handleWebSocketConnected);
        eventBus.on('websocket:disconnected', handleWebSocketDisconnected);
        eventBus.on('websocket:message', handleWebSocketMessage);
        eventBus.on('websocket:error', handleWebSocketError);
        
        // Connect
        elements.wsStateEl.textContent = 'CONNECTING';
        const connected = await wsManager.connect(clientId);
        
        if (!connected) {
            throw new Error('Failed to connect to WebSocket');
        }
        
    } catch (error) {
        log(`❌ WebSocket initialization failed: ${error.message}`);
        elements.wsStateEl.textContent = 'OFFLINE';
        elements.startBtn.disabled = false;
    }
}

// WebSocket event handlers
function handleWebSocketConnected() {
    log('✅ WebSocket connected');
    elements.wsStateEl.textContent = 'CONNECTED';
    elements.startBtn.disabled = true;
    
    // Initialize WebRTC capabilities before registering
    initializeWebRTCCapabilities();
}

// Initialize WebRTC capabilities
async function initializeWebRTCCapabilities() {
    try {
        log('🔧 Initializing WebRTC capabilities...');
        
        // Pre-fetch ICE servers
        await fetchIceServers();
        log('✅ ICE servers ready');
        
        // Initialize WebRTCManager
        webRTCManager = new WebRTCManager(SystemConfig.network.webrtc, eventBus);
        webRTCManager.initialize();
        
        // Set up WebRTC event listeners
        eventBus.on('webrtc:peerCreated', (data) => {
            log(`🔗 Peer connection created for ${data.peerId}`);
            elements.connectionStateEl.textContent = 'CONNECTING';
        });
        
        eventBus.on('webrtc:dataChannelOpen', (data) => {
            log(`📺 Data channel opened for ${data.peerId}`);
            elements.datachannelStateEl.textContent = 'OPEN';
        });
        
        eventBus.on('webrtc:dataChannelClosed', (data) => {
            log(`📺 Data channel closed for ${data.peerId}`);
            elements.datachannelStateEl.textContent = 'CLOSED';
        });
        
        eventBus.on('webrtc:connectionStateChanged', (data) => {
            log(`🔗 Connection state: ${data.state} for ${data.peerId}`);
            elements.connectionStateEl.textContent = data.state.toUpperCase();
        });
        
        eventBus.on('webrtc:iceConnectionStateChanged', (data) => {
            log(`🧊 ICE state: ${data.state} for ${data.peerId}`);
            elements.iceStateEl.textContent = data.state.toUpperCase();
        });
        
        // Set ready state
        isReady = true;
        log('✅ Controller ready for WebRTC connections');
        
        // Now register as controller
        wsManager.send({
            type: 'register',
            role: 'controller',
            id: clientId
        });
        
        log(`📋 Registered as controller with ID: ${clientId}`);
        
    } catch (error) {
        log(`❌ Failed to initialize WebRTC capabilities: ${error.message}`);
        elements.wsStateEl.textContent = 'READY_FAILED';
        elements.startBtn.disabled = false;
    }
}

function handleWebSocketDisconnected() {
    log('❌ WebSocket disconnected');
    elements.wsStateEl.textContent = 'OFFLINE';
    elements.startBtn.disabled = false;
    
    // Reset ready state
    isReady = false;
    
    // WebRTCManager will handle connection cleanup automatically
}

function handleWebSocketMessage(data) {
    const message = data.message;
    logMessage(message, 'received');
    
    // WebRTCManager will handle WebRTC messages automatically via eventBus
    // Just log what we receive for debugging
    log(`📨 Received WebSocket message: ${message.type}`);
    
    // Handle non-WebRTC messages if needed
    switch (message.type) {
        case 'offer':
        case 'answer':
        case 'ice':
        case 'ice-candidate':
            log(`🔀 WebRTC message ${message.type} will be handled by WebRTCManager`);
            break;
        default:
            log(`❓ Unknown message type: ${message.type}`);
    }
}

function handleWebSocketError(error) {
    log(`❌ WebSocket error: ${error.message || error}`);
}

// Fetch ICE servers
async function fetchIceServers() {
    if (iceServers) return iceServers;
    
    try {
        log('🔍 Fetching ICE servers...');
        const response = await fetch('/ice-servers');
        if (response.ok) {
            const data = await response.json();
            iceServers = data.ice_servers || [{ urls: 'stun:stun.l.google.com:19302' }];
            log('✅ Successfully fetched ICE servers');
        } else {
            throw new Error(`Failed to fetch ICE servers: ${response.status} ${response.statusText}`);
        }
    } catch (error) {
        log(`⚠️ ICE server fetch failed: ${error.message}`);
        log('Using fallback STUN server');
        iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    }
    
    return iceServers;
}

// WebRTC handling is now done by WebRTCManager
// Manual handlers removed - WebRTCManager handles offers, ICE candidates, and data channels automatically

// Initialize the application
async function initialize() {
    log('V4 Minimal Controller starting...');
    log('Using WebRTCManager for WebRTC handling');
    
    // Set up UI event listeners
    elements.startBtn.addEventListener('click', async () => {
        elements.startBtn.disabled = true;
        await initializeWebSocket();
    });
}

// Start the application
initialize().catch(error => {
    log(`❌ Initialization error: ${error.message}`);
    Logger.log(`Fatal initialization error: ${error.stack}`, 'errors');
});