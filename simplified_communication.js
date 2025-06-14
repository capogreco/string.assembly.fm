// simplified_communication.js
// Single-channel WebRTC communication for distributed bowed string synthesis

class SimplifiedComm {
    constructor(nodeType, nodeId) {
        this.nodeType = nodeType // 'controller' or 'synth'
        this.nodeId = nodeId
        this.peers = new Map()
        this.ws = null
        this.onMessage = null // callback for received messages
        this.onPeerConnected = null // callback when peer connects
        this.onPeerDisconnected = null // callback when peer disconnects
        
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        }
    }

    // Initialize WebSocket connection
    connect(wsUrl) {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
        this.ws = new WebSocket(`${protocol}//${window.location.host}/ws`)
        
        this.ws.addEventListener('open', () => {
            console.log(`${this.nodeType} ${this.nodeId} connected to server`)
            
            // Register with server
            this.sendToServer({
                type: 'register',
                client_id: this.nodeId
            })
            
            // Request peer list
            this.sendToServer({
                type: this.nodeType === 'controller' ? 'request-synths' : 'request-controllers',
                source: this.nodeId
            })
        })
        
        this.ws.addEventListener('message', async (event) => {
            const message = JSON.parse(event.data)
            await this.handleServerMessage(message)
        })
        
        this.ws.addEventListener('close', () => {
            console.log(`${this.nodeType} disconnected - reconnecting...`)
            setTimeout(() => this.connect(), 2000)
        })
    }

    // Send message to signaling server
    sendToServer(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message))
        }
    }

    // Handle signaling server messages
    async handleServerMessage(message) {
        const peerType = this.nodeType === 'controller' ? 'synth' : 'controller'
        
        switch (message.type) {
            case `${peerType}s-list`:
                for (const peerId of message[`${peerType}s`]) {
                    if (!this.peers.has(peerId)) {
                        await this.connectToPeer(peerId)
                    }
                }
                break
                
            case `${peerType}-joined`:
                if (!this.peers.has(message[`${peerType}_id`])) {
                    await this.connectToPeer(message[`${peerType}_id`])
                }
                break
                
            case `${peerType}-left`:
                this.disconnectPeer(message[`${peerType}_id`])
                break
                
            case 'offer':
                await this.handleOffer(message)
                break
                
            case 'answer':
                await this.handleAnswer(message)
                break
                
            case 'ice':
                await this.handleIceCandidate(message)
                break
        }
    }

    // Initiate connection to peer (controller->synth or synth->controller)
    async connectToPeer(peerId) {
        console.log(`Connecting to ${peerId}`)
        
        const pc = new RTCPeerConnection(this.rtcConfig)
        const peer = {
            id: peerId,
            connection: pc,
            channel: null,
            connected: false,
            iceQueue: []
        }
        
        this.peers.set(peerId, peer)
        
        // Create single reliable data channel
        const channel = pc.createDataChannel('data', {
            ordered: true,
            maxRetransmits: 3
        })
        
        peer.channel = channel
        this.setupChannelHandlers(peer)
        this.setupConnectionHandlers(peer)
        
        // Create and send offer
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        
        this.sendToServer({
            type: 'offer',
            source: this.nodeId,
            target: peerId,
            data: offer
        })
    }

    // Handle incoming WebRTC offer
    async handleOffer(message) {
        const peerId = message.source
        console.log(`Received offer from ${peerId}`)
        
        const pc = new RTCPeerConnection(this.rtcConfig)
        const peer = {
            id: peerId,
            connection: pc,
            channel: null,
            connected: false,
            iceQueue: []
        }
        
        this.peers.set(peerId, peer)
        this.setupConnectionHandlers(peer)
        
        // Handle incoming data channel
        pc.addEventListener('datachannel', (event) => {
            peer.channel = event.channel
            this.setupChannelHandlers(peer)
        })
        
        // Set remote description and create answer
        await pc.setRemoteDescription(message.data)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        
        this.sendToServer({
            type: 'answer',
            source: this.nodeId,
            target: peerId,
            data: answer
        })
    }

    // Handle WebRTC answer
    async handleAnswer(message) {
        const peer = this.peers.get(message.source)
        if (peer && peer.connection) {
            await peer.connection.setRemoteDescription(message.data)
            
            // Process queued ICE candidates
            for (const candidate of peer.iceQueue) {
                await peer.connection.addIceCandidate(candidate)
            }
            peer.iceQueue = []
        }
    }

    // Handle ICE candidate
    async handleIceCandidate(message) {
        const peer = this.peers.get(message.source)
        if (peer && peer.connection) {
            if (peer.connection.remoteDescription) {
                await peer.connection.addIceCandidate(message.data)
            } else {
                peer.iceQueue.push(message.data)
            }
        }
    }

    // Set up WebRTC connection event handlers
    setupConnectionHandlers(peer) {
        peer.connection.addEventListener('icecandidate', (event) => {
            if (event.candidate) {
                this.sendToServer({
                    type: 'ice',
                    source: this.nodeId,
                    target: peer.id,
                    data: event.candidate
                })
            }
        })
        
        peer.connection.addEventListener('connectionstatechange', () => {
            if (peer.connection.connectionState === 'failed' || 
                peer.connection.connectionState === 'closed') {
                this.disconnectPeer(peer.id)
            }
        })
    }

    // Set up data channel event handlers
    setupChannelHandlers(peer) {
        peer.channel.addEventListener('open', () => {
            console.log(`Data channel open to ${peer.id}`)
            peer.connected = true
            if (this.onPeerConnected) {
                this.onPeerConnected(peer.id)
            }
        })
        
        peer.channel.addEventListener('close', () => {
            console.log(`Data channel closed to ${peer.id}`)
            peer.connected = false
            if (this.onPeerDisconnected) {
                this.onPeerDisconnected(peer.id)
            }
        })
        
        peer.channel.addEventListener('message', (event) => {
            const message = JSON.parse(event.data)
            if (this.onMessage) {
                this.onMessage(peer.id, message)
            }
        })
    }

    // Send message to specific peer
    sendToPeer(peerId, message) {
        const peer = this.peers.get(peerId)
        if (peer && peer.channel && peer.channel.readyState === 'open') {
            peer.channel.send(JSON.stringify(message))
            return true
        }
        return false
    }

    // Broadcast message to all connected peers
    broadcast(message) {
        let sent = 0
        for (const [peerId, peer] of this.peers) {
            if (this.sendToPeer(peerId, message)) {
                sent++
            }
        }
        return sent
    }

    // Get list of connected peer IDs
    getConnectedPeers() {
        return Array.from(this.peers.entries())
            .filter(([id, peer]) => peer.connected)
            .map(([id, peer]) => id)
    }

    // Check if specific peer is connected
    isPeerConnected(peerId) {
        const peer = this.peers.get(peerId)
        return peer && peer.connected
    }

    // Disconnect from specific peer
    disconnectPeer(peerId) {
        const peer = this.peers.get(peerId)
        if (peer) {
            if (peer.connection) {
                peer.connection.close()
            }
            this.peers.delete(peerId)
            if (this.onPeerDisconnected) {
                this.onPeerDisconnected(peerId)
            }
        }
    }

    // Clean shutdown
    disconnect() {
        for (const [peerId, peer] of this.peers) {
            this.disconnectPeer(peerId)
        }
        if (this.ws) {
            this.ws.close()
        }
    }
}

// Convenience functions for common message types
class MessageBuilder {
    static program(parameters) {
        return {
            type: 'program',
            parameters: parameters,
            timestamp: Date.now()
        }
    }
    
    static command(name, value) {
        return {
            type: 'command',
            name: name,
            value: value,
            timestamp: Date.now()
        }
    }
    
    static status(state) {
        return {
            type: 'status',
            state: state,
            timestamp: Date.now()
        }
    }
    
    static ping() {
        return {
            type: 'ping',
            timestamp: Date.now()
        }
    }
    
    static pong(pingTimestamp, additionalData = {}) {
        return {
            type: 'pong',
            pingTimestamp: pingTimestamp,
            latency: Date.now() - pingTimestamp,
            timestamp: Date.now(),
            ...additionalData
        }
    }
}

// Export for use in both controller and synth
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SimplifiedComm, MessageBuilder }
} else {
    window.SimplifiedComm = SimplifiedComm
    window.MessageBuilder = MessageBuilder
}