// mock-websocket.js
// Mock WebSocket and WebRTC integration for multi-synth test client

class MockWebSocket {
    constructor(url) {
        this.url = url;
        this.readyState = WebSocket.CONNECTING;
        this.onopen = null;
        this.onmessage = null;
        this.onclose = null;
        this.onerror = null;
        
        // Connect to global mock server
        this.mockServer = window.mockWebSocketServer || new MockWebSocketServer();
        
        // Simulate connection delay
        setTimeout(() => {
            this.readyState = WebSocket.OPEN;
            if (this.onopen) {
                this.onopen(new Event('open'));
            }
            this.mockServer.registerClient(this);
        }, 100);
    }
    
    send(data) {
        if (this.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket is not open');
        }
        
        // Route through mock server
        setTimeout(() => {
            this.mockServer.handleMessage(this, data);
        }, 5);
    }
    
    close() {
        this.readyState = WebSocket.CLOSED;
        this.mockServer.unregisterClient(this);
        if (this.onclose) {
            this.onclose(new Event('close'));
        }
    }
    
    // Internal method for receiving messages
    _receive(data) {
        if (this.onmessage) {
            this.onmessage({ data: data });
        }
    }
}

// Mock WebSocket Server that routes messages between controller and synths
class MockWebSocketServer {
    constructor() {
        this.clients = new Map();
        this.controllers = new Set();
        this.synths = new Set();
        
        // Make globally available
        window.mockWebSocketServer = this;
    }
    
    registerClient(ws) {
        this.clients.set(ws, {
            id: null,
            type: null,
            ws: ws
        });
    }
    
    unregisterClient(ws) {
        const client = this.clients.get(ws);
        if (client) {
            if (client.type === 'controller') {
                this.controllers.delete(client.id);
            } else if (client.type === 'synth') {
                this.synths.delete(client.id);
                
                // Notify controllers that synth left
                this.broadcast({
                    type: 'synth-left',
                    synth_id: client.id
                }, 'controller');
            }
            this.clients.delete(ws);
        }
    }
    
    handleMessage(ws, data) {
        const message = JSON.parse(data);
        const client = this.clients.get(ws);
        
        switch (message.type) {
            case 'register':
                this.handleRegister(ws, client, message);
                break;
                
            case 'request-synths':
                this.handleRequestSynths(ws);
                break;
                
            case 'request-controllers':
                this.handleRequestControllers(ws);
                break;
                
            case 'offer':
            case 'answer':
            case 'ice':
                this.handleWebRTCSignaling(ws, message);
                break;
                
            default:
                console.log('Mock server received:', message);
        }
    }
    
    handleRegister(ws, client, message) {
        client.id = message.client_id;
        
        // Determine type based on ID pattern
        if (message.client_id.includes('ctrl')) {
            client.type = 'controller';
            this.controllers.add(message.client_id);
            console.log(`Mock: Controller ${message.client_id} registered`);
        } else if (message.client_id.includes('synth') || message.client_id.includes('test-synth')) {
            client.type = 'synth';
            this.synths.add(message.client_id);
            console.log(`Mock: Synth ${message.client_id} registered`);
            
            // Notify controllers of new synth
            this.broadcast({
                type: 'synth-joined',
                synth_id: message.client_id
            }, 'controller');
        }
    }
    
    handleRequestSynths(ws) {
        ws._receive(JSON.stringify({
            type: 'synths-list',
            synths: Array.from(this.synths)
        }));
    }
    
    handleRequestControllers(ws) {
        ws._receive(JSON.stringify({
            type: 'controllers-list',
            controllers: Array.from(this.controllers)
        }));
    }
    
    handleWebRTCSignaling(ws, message) {
        // For mock, we'll create direct connections instead of real WebRTC
        const client = this.clients.get(ws);
        
        if (message.type === 'offer') {
            // Controller → Synth offer
            const targetClient = this.findClientById(message.target);
            if (targetClient) {
                // Forward offer
                targetClient.ws._receive(JSON.stringify(message));
                
                // Simulate immediate answer
                setTimeout(() => {
                    const answer = {
                        type: 'answer',
                        source: message.target,
                        target: message.source,
                        data: { type: 'answer', sdp: 'mock-answer-sdp' }
                    };
                    ws._receive(JSON.stringify(answer));
                    
                    // Create mock data channels
                    this.createMockDataChannels(message.source, message.target);
                }, 50);
            }
        }
    }
    
    createMockDataChannels(controllerId, synthId) {
        console.log(`Mock: Creating data channels between ${controllerId} and ${synthId}`);
        
        // Find the controller in the test ensemble
        if (window.mockDataChannelRouter) {
            window.mockDataChannelRouter.connectControllerToSynth(controllerId, synthId);
        }
    }
    
    broadcast(message, targetType) {
        this.clients.forEach((client, ws) => {
            if (client.type === targetType) {
                ws._receive(JSON.stringify(message));
            }
        });
    }
    
    findClientById(id) {
        for (const [ws, client] of this.clients) {
            if (client.id === id) {
                return client;
            }
        }
        return null;
    }
}

// Mock RTCPeerConnection for test ensemble
class MockRTCPeerConnection {
    constructor(config) {
        this.localDescription = null;
        this.remoteDescription = null;
        this.connectionState = 'new';
        this.iceConnectionState = 'new';
        this.onicecandidate = null;
        this.ondatachannel = null;
        this.onconnectionstatechange = null;
        this.dataChannels = new Map();
        
        // Simulate connection establishment
        setTimeout(() => {
            this.connectionState = 'connected';
            this.iceConnectionState = 'connected';
            if (this.onconnectionstatechange) {
                this.onconnectionstatechange();
            }
        }, 100);
    }
    
    async createOffer() {
        return { type: 'offer', sdp: 'mock-offer-sdp' };
    }
    
    async createAnswer() {
        return { type: 'answer', sdp: 'mock-answer-sdp' };
    }
    
    async setLocalDescription(desc) {
        this.localDescription = desc;
    }
    
    async setRemoteDescription(desc) {
        this.remoteDescription = desc;
    }
    
    createDataChannel(label, options) {
        const channel = new MockRTCDataChannel(label, this);
        this.dataChannels.set(label, channel);
        
        // Simulate channel opening
        setTimeout(() => {
            channel._open();
        }, 50);
        
        return channel;
    }
    
    close() {
        this.connectionState = 'closed';
        this.dataChannels.forEach(channel => channel.close());
    }
    
    addEventListener(event, handler) {
        this[`on${event}`] = handler;
    }
}

// Mock RTCDataChannel
class MockRTCDataChannel {
    constructor(label, pc) {
        this.label = label;
        this.pc = pc;
        this.readyState = 'connecting';
        this.onopen = null;
        this.onclose = null;
        this.onmessage = null;
        
        // Register with global router
        if (window.mockDataChannelRouter) {
            window.mockDataChannelRouter.registerChannel(this);
        }
    }
    
    _open() {
        this.readyState = 'open';
        if (this.onopen) {
            this.onopen(new Event('open'));
        }
    }
    
    send(data) {
        if (this.readyState !== 'open') {
            throw new Error('DataChannel is not open');
        }
        
        // Route through mock data channel router
        if (window.mockDataChannelRouter) {
            window.mockDataChannelRouter.routeMessage(this, data);
        }
    }
    
    close() {
        this.readyState = 'closed';
        if (this.onclose) {
            this.onclose(new Event('close'));
        }
    }
    
    addEventListener(event, handler) {
        this[`on${event}`] = handler;
    }
}

// Global mock data channel router
class MockDataChannelRouter {
    constructor() {
        this.controllerChannels = new Map();
        this.synthChannels = new Map();
        window.mockDataChannelRouter = this;
    }
    
    registerChannel(channel) {
        // Channels will be registered when they're connected
    }
    
    connectControllerToSynth(controllerId, synthId) {
        // This will be called when mock WebRTC "connects"
        // The actual routing happens in the test ensemble
        console.log(`Mock router: Connecting ${controllerId} to ${synthId}`);
    }
    
    routeMessage(channel, data) {
        // Route messages between controller and synths
        // This integrates with the test ensemble's mock router
        if (window.mockRouter) {
            const parsedData = JSON.parse(data);
            
            // Determine if this is from controller or synth based on channel
            if (channel.label === 'params' || channel.label === 'commands') {
                // Route to appropriate handler
                window.mockRouter.routeToSynth(parsedData.target || 'test-synth-0', data);
            }
        }
    }
}

// Initialize global routers
new MockDataChannelRouter();

// Override WebSocket and RTCPeerConnection if in test mode or test ensemble
if (window.location.search.includes('mock=true') || window.location.pathname.includes('test-ensemble')) {
    window.WebSocket = MockWebSocket;
    window.RTCPeerConnection = MockRTCPeerConnection;
    console.log('Mock WebSocket and WebRTC enabled');
}

// Export for use in test files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MockWebSocket,
        MockRTCPeerConnection,
        MockWebSocketServer,
        MockDataChannelRouter
    };
}