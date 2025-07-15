// V3 Minimal Controller - Main Entry Point
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
let remoteSynthId = null;

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
    remoteSynthDiv: document.getElementById('remote-synth'),
    messageInput: document.getElementById('message-input'),
    sendBtn: document.getElementById('send-btn'),
    clearLogBtn: document.getElementById('clear-log-btn'),
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
        clientId = 'ctrl-' + Math.random().toString(36).substr(2, 9);
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
    eventBus.on('webrtc:offerHandled', handleOfferHandled);
    
    log('WebRTCManager initialized', 'success');
}

// WebSocket event handlers
function handleWebSocketConnected() {
    log('WebSocket connected', 'success');
    updateStatus('ws', 'Connected', 'connected');
    
    // Register as controller
    wsManager.send({
        type: 'register',
        role: 'controller',
        id: clientId
    });
    
    log(`Registered as controller with ID: ${clientId}`, 'info');
    
    // Initialize WebRTC Manager after WebSocket is connected
    initializeWebRTCManager();
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
    
    // Let WebRTCManager handle offer/answer/ice messages
    if (message.type === 'offer' || message.type === 'answer' || 
        message.type === 'ice' || message.type === 'ice-candidate') {
        // WebRTCManager will handle these automatically via its own WebSocket listeners
        return;
    }
    
    log(`Received message type: ${message.type}`, 'info');
}

function handleWebSocketError(error) {
    log(`WebSocket error: ${error.message || error}`, 'error');
}

// WebRTC event handlers
function handlePeerCreated(data) {
    log(`Peer connection created for: ${data.peerId}`, 'info');
    updateStatus('rtc', 'Connecting...', 'connecting');
    updateStatus('ice', 'Gathering...', 'connecting');
}

function handleWebRTCConnected(data) {
    log(`WebRTC connected to: ${data.peerId}`, 'success');
    remoteSynthId = data.peerId;
    elements.remoteSynthDiv.textContent = remoteSynthId;
    updateStatus('rtc', 'Connected', 'connected');
}

function handleWebRTCDisconnected(data) {
    log(`WebRTC disconnected from: ${data.peerId}`, 'error');
    if (data.peerId === remoteSynthId) {
        elements.remoteSynthDiv.textContent = 'None connected';
        remoteSynthId = null;
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

function handleOfferHandled(data) {
    log(`Successfully handled offer from: ${data.peerId}`, 'success');
    remoteSynthId = data.peerId;
    elements.remoteSynthDiv.textContent = remoteSynthId;
}

// Send message through data channel
function sendMessage() {
    const message = elements.messageInput.value.trim();
    if (message && remoteSynthId && webRTCManager) {
        webRTCManager.sendDataMessage(remoteSynthId, message);
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
    log('V3 Minimal Controller starting...', 'info');
    log('Using WebRTCManager for all WebRTC operations', 'info');
    
    // Set up UI event listeners
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    elements.clearLogBtn.addEventListener('click', clearLog);
    
    // Initialize WebSocket connection
    await initializeWebSocket();
}

// Start the application
initialize().catch(error => {
    log(`Initialization error: ${error.message}`, 'error');
    Logger.log(`Fatal initialization error: ${error.stack}`, 'errors');
});