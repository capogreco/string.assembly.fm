// synth.js - Unified synthesizer module for distributed bowed string synthesis

import { SynthCore } from './synth-core.js'

export class Synth {
    constructor(options = {}) {
        this.id = options.id || `synth-${Math.random().toString(36).substr(2, 9)}`
        this.onStatusChange = options.onStatusChange || (() => {})
        this.onProgramReceived = options.onProgramReceived || (() => {})
        
        // Core components
        this.synthCore = null
        this.ws = null
        this.controllers = new Map()
        
        // State
        this.isConnected = false
        this.currentPart = null
        this.currentProgram = null
        this.synthIndex = null // Will be determined by connection order
        
        // Configuration
        this.rtcConfig = {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        }
    }
    
    async start() {
        try {
            // Initialize audio
            await this.initAudio()
            
            // Connect to signaling server
            await this.connectWebSocket()
            
            this.onStatusChange({
                type: 'ready',
                id: this.id
            })
        } catch (error) {
            console.error(`[${this.id}] Failed to start:`, error)
            this.onStatusChange({
                type: 'error',
                error: error.message
            })
        }
    }
    
    async initAudio() {
        this.synthCore = new SynthCore()
        await this.synthCore.initialize()
        console.log(`[${this.id}] Audio initialized`)
    }
    
    async connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${protocol}//${window.location.host}/ws`
        
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(wsUrl)
            
            this.ws.addEventListener('open', () => {
                console.log(`[${this.id}] WebSocket connected`)
                this.isConnected = true
                
                // Register as synth
                this.sendToServer({
                    type: 'register',
                    client_id: this.id
                })
                
                // Request list of controllers
                this.sendToServer({
                    type: 'request_controllers',
                    source: this.id
                })
                
                resolve()
            })
            
            this.ws.addEventListener('message', async (event) => {
                const message = JSON.parse(event.data)
                await this.handleServerMessage(message)
            })
            
            this.ws.addEventListener('close', () => {
                console.log(`[${this.id}] WebSocket disconnected`)
                this.isConnected = false
                this.onStatusChange({ type: 'disconnected' })
                
                // Reconnect after delay
                setTimeout(() => this.connectWebSocket(), 2000)
            })
            
            this.ws.addEventListener('error', (error) => {
                reject(error)
            })
            
            // Timeout connection attempt
            setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000)
        })
    }
    
    sendToServer(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message))
        }
    }
    
    async handleServerMessage(message) {
        switch (message.type) {
            case 'active_controllers':
                // Start WebRTC connections to controllers
                for (const ctrl_id of message.data) {
                    if (!this.controllers.has(ctrl_id)) {
                        await this.connectToController(ctrl_id)
                    }
                }
                break
                
            case 'new_controller':
                // Controller joined - connect to it
                if (!this.controllers.has(message.client_id)) {
                    await this.connectToController(message.client_id)
                }
                break
                
            case 'controller_disconnected':
                // Clean up controller connection
                const controller = this.controllers.get(message.client_id)
                if (controller) {
                    if (controller.connection) {
                        controller.connection.close()
                    }
                    this.controllers.delete(message.client_id)
                    console.log(`[${this.id}] Controller ${message.client_id} disconnected`)
                }
                break
                
            case 'answer':
                await this.handleAnswer(message)
                break
                
            case 'ice':
                await this.handleIceCandidate(message)
                break
        }
    }
    
    async connectToController(controllerId) {
        console.log(`[${this.id}] Creating offer for controller ${controllerId}`)
        
        const pc = new RTCPeerConnection(this.rtcConfig)
        const controller = {
            id: controllerId,
            connection: pc,
            channel: null
        }
        
        this.controllers.set(controllerId, controller)
        
        // Create data channel
        const channel = pc.createDataChannel('params', {
            ordered: true,
            maxRetransmits: 3
        })
        
        controller.channel = channel
        
        channel.addEventListener('open', () => {
            console.log(`[${this.id}] Channel open to controller ${controllerId}`)
            this.onStatusChange({ 
                type: 'connected',
                controllerId: controllerId
            })
            
            // Determine synth index based on connection order
            if (this.synthIndex === null) {
                this.synthIndex = this.controllers.size - 1
            }
        })
        
        channel.addEventListener('message', (event) => {
            const data = JSON.parse(event.data)
            this.handleControllerMessage(controllerId, data)
        })
        
        channel.addEventListener('close', () => {
            console.log(`[${this.id}] Channel closed to controller ${controllerId}`)
        })
        
        // Handle ICE candidates
        pc.addEventListener('icecandidate', (event) => {
            if (event.candidate) {
                this.sendToServer({
                    type: 'ice',
                    source: this.id,
                    target: controllerId,
                    data: event.candidate
                })
            }
        })
        
        // Create and send offer
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        
        this.sendToServer({
            type: 'offer',
            source: this.id,
            target: controllerId,
            data: offer
        })
    }
    
    async handleAnswer(message) {
        const controller = this.controllers.get(message.source)
        if (controller && controller.connection) {
            await controller.connection.setRemoteDescription(message.data)
        }
    }
    
    async handleIceCandidate(message) {
        const controller = this.controllers.get(message.source)
        if (controller && controller.connection) {
            await controller.connection.addIceCandidate(message.data)
        }
    }
    
    handleControllerMessage(controllerId, data) {
        switch (data.type) {
            case 'program':
                this.handleProgram(data.program)
                break
                
            case 'ping':
                // Respond with pong
                const controller = this.controllers.get(controllerId)
                if (controller && controller.channel) {
                    controller.channel.send(JSON.stringify({
                        type: 'pong',
                        timestamp: data.timestamp,
                        state: {
                            audio_enabled: true,
                            has_program: !!this.currentProgram,
                            current_part: this.currentPart?.id || null
                        }
                    }))
                }
                break
        }
    }
    
    handleProgram(program) {
        console.log(`[${this.id}] Received program with ${program.parts.length} parts`)
        this.currentProgram = program
        
        // Select which part this synth should play
        const part = this.selectPart(program.parts)
        this.currentPart = part
        
        // Create complete synth program
        const synthProgram = {
            // Global parameters
            ...program.global,
            
            // Part-specific parameters
            fundamentalFrequency: part.pitch,
            
            // Expression parameters
            ...this.resolveExpression(part.expression)
        }
        
        // Apply to synth core
        this.synthCore.applyProgram(synthProgram)
        
        // Notify UI
        this.onProgramReceived({
            part: part,
            program: synthProgram
        })
        
        console.log(`[${this.id}] Playing part ${part.id}: ${part.pitch.toFixed(1)}Hz, ${part.expression.type}`)
    }
    
    selectPart(parts) {
        // Equal distribution with round-robin based on synth index
        // This ensures consistent part assignment across synths
        const partIndex = (this.synthIndex || 0) % parts.length
        return parts[partIndex]
    }
    
    resolveExpression(expression) {
        const params = {
            vibratoEnabled: false,
            tremoloEnabled: false,
            trillEnabled: false
        }
        
        switch (expression.type) {
            case 'vibrato':
                params.vibratoEnabled = true
                params.vibratoRate = expression.speed || 5
                params.vibratoDepth = expression.depth || 0.01
                break
                
            case 'tremolo':
                params.tremoloEnabled = true
                params.tremoloSpeed = expression.speed || 10
                params.tremoloDepth = expression.depth || 0.3
                params.tremoloArticulation = expression.articulation || 0.8
                break
                
            case 'trill':
                params.trillEnabled = true
                params.trillInterval = expression.interval || 2
                params.trillSpeed = expression.speed || 8
                params.trillArticulation = expression.articulation || 0.7
                break
                
            case 'none':
                // All disabled by default
                break
        }
        
        return params
    }
    
    // Public methods
    setPower(on) {
        if (this.synthCore) {
            this.synthCore.setPower(on)
        }
    }
    
    setVolume(volume) {
        if (this.synthCore && this.currentProgram) {
            this.currentProgram.global.volume = volume
            this.handleProgram(this.currentProgram)
        }
    }
    
    getAudioLevel() {
        return this.synthCore ? this.synthCore.getAudioLevel() : 0
    }
    
    async startCalibrationNoise(volume = 0.2) {
        if (this.synthCore) {
            return this.synthCore.startCalibrationNoise(volume)
        }
        return false
    }
    
    stopCalibrationNoise() {
        if (this.synthCore) {
            this.synthCore.stopCalibrationNoise()
        }
    }
    
    destroy() {
        // Clean up connections
        this.controllers.forEach(controller => {
            if (controller.connection) {
                controller.connection.close()
            }
        })
        this.controllers.clear()
        
        // Close WebSocket
        if (this.ws) {
            this.ws.close()
        }
        
        // Destroy audio
        if (this.synthCore) {
            this.synthCore.destroy()
        }
    }
}