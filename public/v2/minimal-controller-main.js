// V2 Minimal Controller - Main Entry Point
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
let remoteSynthId = null;
let iceServers = null;

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
    
    // Also log to Logger
    Logger.log(message, 'lifecycle');
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
        
        // Create WebSocketManager instance
        const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${SystemConfig.network.websocket.path}`;
        wsManager = new WebSocketManager(wsUrl, eventBus);
        
        // Set up WebSocket event listeners
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
    
    // Register as controller
    wsManager.send({
        type: 'register',
        role: 'controller',
        id: clientId
    });
    
    log(`Registered as controller with ID: ${clientId}`);
}

function handleWebSocketDisconnected() {
    log('❌ WebSocket disconnected');
    elements.wsStateEl.textContent = 'OFFLINE';
    elements.startBtn.disabled = false;
    
    // Clean up any active connections
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
}

function handleWebSocketMessage(data) {
    const message = data.message;
    logMessage(message, 'received');
    
    switch (message.type) {
        case 'offer':
            handleOffer(message);
            break;
        case 'ice':
        case 'ice-candidate':
            handleIceCandidate(message);
            break;
        default:
            log(`Unknown message type: ${message.type}`);
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

// WebRTC handlers
async function handleOffer(message) {
    try {
        // Use source field (set by server) instead of from field
        const senderId = message.source || message.from || message.sender_id;
        log(`📨 Received offer from ${senderId}`);
        remoteSynthId = senderId;
        
        // Create peer connection
        const servers = await fetchIceServers();
        peerConnection = new RTCPeerConnection({ iceServers: servers });
        
        elements.connectionStateEl.textContent = 'CONNECTING';
        elements.iceStateEl.textContent = 'GATHERING';
        
        // Set up peer connection event handlers
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                log('📤 Sending ICE candidate');
                wsManager.send({
                    type: 'ice',
                    target: remoteSynthId,
                    source: clientId,
                    candidate: event.candidate
                });
            }
        };
        
        peerConnection.oniceconnectionstatechange = () => {
            const state = peerConnection.iceConnectionState;
            log(`🧊 ICE connection state: ${state}`);
            elements.iceStateEl.textContent = state.toUpperCase();
        };
        
        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState;
            log(`🔗 Connection state: ${state}`);
            elements.connectionStateEl.textContent = state.toUpperCase();
        };
        
        peerConnection.ondatachannel = (event) => {
            log('📺 Data channel received');
            dataChannel = event.channel;
            setupDataChannel();
        };
        
        // Extract the offer - it might be in message.offer or message.data
        const offerData = message.offer || message.data;
        if (!offerData) {
            throw new Error('No offer data found in message');
        }
        
        // Set remote description
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offerData));
        log('✅ Set remote description');
        
        // Create answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        log('✅ Created and set local description');
        
        // Send answer
        wsManager.send({
            type: 'answer',
            target: remoteSynthId,
            source: clientId,
            answer: answer
        });
        log('📤 Sent answer');
        
    } catch (error) {
        log(`❌ Error handling offer: ${error.message}`);
        elements.connectionStateEl.textContent = 'FAILED';
    }
}

async function handleIceCandidate(message) {
    try {
        if (peerConnection && message.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
            log('✅ Added ICE candidate');
        }
    } catch (error) {
        log(`❌ Error adding ICE candidate: ${error.message}`);
    }
}

// Data channel setup
function setupDataChannel() {
    dataChannel.onopen = () => {
        log('📺 Data channel opened');
        elements.datachannelStateEl.textContent = 'OPEN';
    };
    
    dataChannel.onclose = () => {
        log('📺 Data channel closed');
        elements.datachannelStateEl.textContent = 'CLOSED';
    };
    
    dataChannel.onmessage = (event) => {
        log(`📨 Received: ${event.data}`);
    };
    
    dataChannel.onerror = (error) => {
        log(`❌ Data channel error: ${error}`);
    };
}

// Initialize the application
async function initialize() {
    log('V2 Minimal Controller starting...');
    log('Using application modules: Logger, EventBus, WebSocketManager');
    
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