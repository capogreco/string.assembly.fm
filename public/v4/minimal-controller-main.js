// V4 Minimal Controller - Main Entry Point
// This version uses NetworkCoordinator to manage all network operations

import { Logger } from '../js/modules/core/Logger.js';
import { eventBus } from '../js/modules/core/EventBus.js';
import { networkCoordinator } from '../js/modules/network/NetworkCoordinator.js';

// Enable logging for debugging
Logger.enable('connections');
Logger.enable('messages');
Logger.enable('errors');
Logger.enable('lifecycle');

// State management
let clientId = null;
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

// Set up event listeners for NetworkCoordinator events
function setupEventListeners() {
    // WebSocket events
    eventBus.on('websocket:connected', () => {
        log('WebSocket connected', 'success');
        updateStatus('ws', 'Connected', 'connected');
    });
    
    eventBus.on('websocket:disconnected', () => {
        log('WebSocket disconnected', 'error');
        updateStatus('ws', 'Disconnected', 'disconnected');
    });
    
    eventBus.on('websocket:error', (error) => {
        log(`WebSocket error: ${error.message || error}`, 'error');
    });
    
    // WebRTC events
    eventBus.on('webrtc:peerCreated', (data) => {
        log(`Peer connection created for: ${data.peerId}`, 'info');
        updateStatus('rtc', 'Connecting...', 'connecting');
        updateStatus('ice', 'Gathering...', 'connecting');
    });
    
    eventBus.on('webrtc:connected', (data) => {
        log(`WebRTC connected to: ${data.peerId}`, 'success');
        updateStatus('rtc', 'Connected', 'connected');
    });
    
    eventBus.on('webrtc:disconnected', (data) => {
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
    
    // NetworkCoordinator specific events
    eventBus.on('network:synthConnected', (data) => {
        log(`Synth connected via NetworkCoordinator: ${data.synthId}`, 'success');
        remoteSynthId = data.synthId;
        elements.remoteSynthDiv.textContent = remoteSynthId;
    });
    
    eventBus.on('network:statusUpdate', (status) => {
        log(`Network status update: ${JSON.stringify(status)}`, 'info');
    });
}

// Send message through NetworkCoordinator
function sendMessage() {
    const message = elements.messageInput.value.trim();
    if (message && remoteSynthId) {
        // Send as a simple data message
        const sent = networkCoordinator.webRTC.sendDataMessage(remoteSynthId, message);
        if (sent) {
            log(`Sent: ${message}`, 'data');
            elements.messageInput.value = '';
        } else {
            log(`Failed to send message`, 'error');
        }
    }
}

// Clear log
function clearLog() {
    elements.logDiv.innerHTML = '';
    log('Log cleared', 'info');
}

// Initialize the application
async function initialize() {
    log('V4 Minimal Controller starting...', 'info');
    log('Using NetworkCoordinator to manage all network operations', 'info');
    
    // Generate client ID
    clientId = 'ctrl-' + Math.random().toString(36).substr(2, 9);
    elements.clientIdDiv.textContent = clientId;
    
    // Set up event listeners first
    setupEventListeners();
    
    // Set up UI event listeners
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    elements.clearLogBtn.addEventListener('click', clearLog);
    
    try {
        // Initialize NetworkCoordinator
        updateStatus('ws', 'Initializing...', 'connecting');
        await networkCoordinator.initialize(clientId);
        log('NetworkCoordinator initialized', 'success');
        
        // Connect via NetworkCoordinator
        updateStatus('ws', 'Connecting...', 'connecting');
        const connected = await networkCoordinator.connect();
        
        if (!connected) {
            throw new Error('Failed to connect via NetworkCoordinator');
        }
        
        log('Successfully connected via NetworkCoordinator', 'success');
        
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