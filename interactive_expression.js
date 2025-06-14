// interactive_expression.js
// Interactive expression control system with click-and-drag gestures

class InteractiveExpression {
    constructor(container, noteFrequencies) {
        this.container = container
        this.notes = noteFrequencies // Array of {note: 'C4', freq: 261.63}
        this.expressions = new Map() // noteId -> expression data
        
        // Gesture tracking
        this.isDragging = false
        this.dragStartNote = null
        this.dragStartPos = null
        this.currentDragPos = null
        
        // Visual elements
        this.canvas = null
        this.ctx = null
        this.noteElements = new Map()
        
        // Gesture thresholds
        this.DRAG_THRESHOLD = 10 // pixels before drag is recognized
        this.VIBRATO_THRESHOLD = -20 // pixels up for vibrato (negative because up is negative)
        this.TREMOLO_THRESHOLD = 20 // pixels down for tremolo
        
        // Expression colors
        this.EXPRESSION_COLORS = {
            none: '#667eea',
            trill: '#3498db',
            vibrato: '#e74c3c',
            tremolo: '#f39c12'
        }
        
        this.init()
    }
    
    init() {
        // Create canvas overlay for visual feedback
        this.createCanvas()
        
        // Set up note elements
        this.setupNoteElements()
        
        // Bind event handlers
        this.bindEvents()
        
        // Initial render
        this.render()
    }
    
    createCanvas() {
        // Create canvas for drawing expression indicators
        this.canvas = document.createElement('canvas')
        this.canvas.style.position = 'absolute'
        this.canvas.style.top = '0'
        this.canvas.style.left = '0'
        this.canvas.style.pointerEvents = 'none'
        this.canvas.style.zIndex = '10'
        
        // Ensure container has relative positioning
        if (window.getComputedStyle(this.container).position === 'static') {
            this.container.style.position = 'relative'
        }
        
        // Size canvas to container
        const rect = this.container.getBoundingClientRect()
        this.canvas.width = rect.width
        this.canvas.height = rect.height
        
        this.container.appendChild(this.canvas)
        
        this.ctx = this.canvas.getContext('2d')
        console.log('Canvas created:', this.canvas.width, 'x', this.canvas.height)
    }
    
    setupNoteElements() {
        // Find all piano keys and map them to note data
        const keys = this.container.querySelectorAll('.piano-key')
        keys.forEach((key, index) => {
            if (this.notes[index]) {
                const noteData = this.notes[index]
                this.noteElements.set(noteData.note, {
                    element: key,
                    note: noteData.note,
                    freq: noteData.freq,
                    index: index,
                    bounds: null // Will be updated on render
                })
                
                // Add note identifier to element
                key.dataset.note = noteData.note
                key.dataset.freq = noteData.freq
            }
        })
    }
    
    bindEvents() {
        // Mouse events
        this.container.addEventListener('mousedown', this.handleMouseDown.bind(this))
        window.addEventListener('mousemove', this.handleMouseMove.bind(this))
        window.addEventListener('mouseup', this.handleMouseUp.bind(this))
        
        // Touch events
        this.container.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false })
        window.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false })
        window.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false })
        
        // Window resize
        window.addEventListener('resize', this.handleResize.bind(this))
    }
    
    handleMouseDown(e) {
        const note = this.getNoteFromEvent(e)
        if (!note) return
        
        this.startDrag(note, e.clientX, e.clientY)
        e.preventDefault()
    }
    
    handleMouseMove(e) {
        if (!this.isDragging) return
        
        this.updateDrag(e.clientX, e.clientY)
        e.preventDefault()
    }
    
    handleMouseUp(e) {
        if (!this.isDragging) return
        
        this.endDrag(e.clientX, e.clientY)
        e.preventDefault()
    }
    
    handleTouchStart(e) {
        if (e.touches.length !== 1) return
        
        const touch = e.touches[0]
        const note = this.getNoteFromEvent(touch)
        if (!note) return
        
        this.startDrag(note, touch.clientX, touch.clientY)
        e.preventDefault()
    }
    
    handleTouchMove(e) {
        if (!this.isDragging || e.touches.length !== 1) return
        
        const touch = e.touches[0]
        this.updateDrag(touch.clientX, touch.clientY)
        e.preventDefault()
    }
    
    handleTouchEnd(e) {
        if (!this.isDragging) return
        
        // Use last known position for touch end
        this.endDrag(this.currentDragPos.x, this.currentDragPos.y)
        e.preventDefault()
    }
    
    handleResize() {
        // Update canvas size
        const rect = this.container.getBoundingClientRect()
        this.canvas.width = rect.width
        this.canvas.height = rect.height
        
        // Update note bounds
        this.updateNoteBounds()
        
        // Redraw
        this.render()
    }
    
    getNoteFromEvent(e) {
        const element = e.target
        if (!element.classList.contains('piano-key')) {
            console.log('Not a piano key:', element)
            return null
        }
        
        const note = element.dataset.note
        console.log('Note from event:', note)
        return note
    }
    
    getNoteFromPosition(x, y) {
        // Find which note is at the given position
        console.log('Getting note from position:', x, y)
        for (const [note, data] of this.noteElements) {
            if (data.bounds && this.isPointInBounds(x, y, data.bounds)) {
                console.log('Found note at position:', note)
                return note
            }
        }
        console.log('No note found at position')
        return null
    }
    
    isPointInBounds(x, y, bounds) {
        return x >= bounds.left && x <= bounds.right &&
               y >= bounds.top && y <= bounds.bottom
    }
    
    startDrag(note, x, y) {
        console.log('Starting drag:', note, x, y)
        this.isDragging = true
        this.dragStartNote = note
        this.dragStartPos = { x, y }
        this.currentDragPos = { x, y }
        
        // Update note bounds for accurate hit testing
        this.updateNoteBounds()
        
        // Visual feedback
        this.highlightNote(note, true)
        this.render()
    }
    
    updateDrag(x, y) {
        this.currentDragPos = { x, y }
        const dx = x - this.dragStartPos.x
        const dy = y - this.dragStartPos.y
        console.log('Drag update:', dx, dy)
        this.render()
    }
    
    endDrag(x, y) {
        const startNote = this.dragStartNote
        const dx = x - this.dragStartPos.x
        const dy = y - this.dragStartPos.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        console.log('End drag:', {
            startNote,
            dx,
            dy,
            distance,
            thresholds: {
                drag: this.DRAG_THRESHOLD,
                vibrato: this.VIBRATO_THRESHOLD,
                tremolo: this.TREMOLO_THRESHOLD
            }
        })
        
        // Determine expression type based on drag
        let expression = null
        
        if (distance < this.DRAG_THRESHOLD) {
            // Simple click - clear expression
            console.log('Simple click - clearing expression')
            expression = { type: 'none' }
        } else if (dy < this.VIBRATO_THRESHOLD) {
            // Dragged up - vibrato (negative dy means up)
            console.log('Vibrato detected')
            expression = {
                type: 'vibrato',
                depth: Math.min(1, Math.abs(dy) / 100),
                rate: 4
            }
        } else if (dy > this.TREMOLO_THRESHOLD) {
            // Dragged down - tremolo
            console.log('Tremolo detected')
            expression = {
                type: 'tremolo',
                depth: Math.min(1, dy / 100),
                speed: 10
            }
        } else {
            // Horizontal drag - check for trill target
            const targetNote = this.getNoteFromPosition(x, y)
            console.log('Checking for trill target:', targetNote)
            if (targetNote && targetNote !== startNote) {
                const startData = this.noteElements.get(startNote)
                const targetData = this.noteElements.get(targetNote)
                
                expression = {
                    type: 'trill',
                    targetNote: targetNote,
                    targetFreq: targetData.freq,
                    interval: Math.abs(targetData.index - startData.index),
                    speed: 8
                }
                console.log('Trill detected:', expression)
            }
        }
        
        // Apply expression
        if (expression) {
            this.setExpression(startNote, expression)
        }
        
        // Clean up
        this.isDragging = false
        this.dragStartNote = null
        this.highlightNote(startNote, false)
        this.render()
    }
    
    setExpression(note, expression) {
        console.log('Setting expression:', note, expression)
        if (expression.type === 'none') {
            this.expressions.delete(note)
        } else {
            this.expressions.set(note, expression)
        }
        
        // Update visual state
        this.updateNoteVisual(note)
        
        // Notify listeners
        if (this.onExpressionChange) {
            this.onExpressionChange(note, expression)
        }
    }
    
    getExpression(note) {
        return this.expressions.get(note) || { type: 'none' }
    }
    
    getAllExpressions() {
        const result = {}
        for (const noteData of this.noteElements.values()) {
            const expression = this.getExpression(noteData.note)
            result[noteData.note] = expression
        }
        return result
    }
    
    updateNoteBounds() {
        // Update cached bounds for each note
        const containerRect = this.container.getBoundingClientRect()
        console.log('Container rect:', containerRect)
        
        for (const [note, data] of this.noteElements) {
            const rect = data.element.getBoundingClientRect()
            
            data.bounds = {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                centerX: (rect.left + rect.right) / 2,
                centerY: (rect.top + rect.bottom) / 2
            }
            
            console.log(`Bounds for ${note}:`, data.bounds)
        }
    }
    
    highlightNote(note, highlighted) {
        const data = this.noteElements.get(note)
        if (data) {
            if (highlighted) {
                data.element.classList.add('dragging')
            } else {
                data.element.classList.remove('dragging')
            }
        }
    }
    
    updateNoteVisual(note) {
        const data = this.noteElements.get(note)
        if (!data) return
        
        const expression = this.getExpression(note)
        const color = this.EXPRESSION_COLORS[expression.type]
        
        // Update note element styling
        data.element.style.borderColor = color
        data.element.style.borderWidth = expression.type === 'none' ? '1px' : '3px'
        data.element.style.transition = 'border-color 0.2s, border-width 0.2s'
    }
    
    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
        
        // Draw expression indicators
        this.drawExpressionIndicators()
        
        // Draw current drag feedback
        if (this.isDragging) {
            this.drawDragFeedback()
        }
    }
    
    drawExpressionIndicators() {
        const containerRect = this.container.getBoundingClientRect()
        
        for (const [note, expression] of this.expressions) {
            const noteData = this.noteElements.get(note)
            if (!noteData || !noteData.bounds) continue
            
            // Convert bounds to canvas coordinates
            const canvasBounds = {
                left: noteData.bounds.left - containerRect.left,
                right: noteData.bounds.right - containerRect.left,
                top: noteData.bounds.top - containerRect.top,
                bottom: noteData.bounds.bottom - containerRect.top,
                centerX: noteData.bounds.centerX - containerRect.left,
                centerY: noteData.bounds.centerY - containerRect.top
            }
            
            switch (expression.type) {
                case 'vibrato':
                    this.drawVibratoIndicator(canvasBounds, expression)
                    break
                case 'tremolo':
                    this.drawTremoloIndicator(canvasBounds, expression)
                    break
                case 'trill':
                    this.drawTrillIndicator(noteData, expression)
                    break
            }
        }
    }
    
    drawVibratoIndicator(bounds, expression) {
        const ctx = this.ctx
        ctx.save()
        
        // Draw wavy line above note
        ctx.strokeStyle = this.EXPRESSION_COLORS.vibrato
        ctx.lineWidth = 2
        ctx.setLineDash([])
        
        const amplitude = 5 * expression.depth
        const y = bounds.top - 10
        
        ctx.beginPath()
        for (let x = bounds.left; x <= bounds.right; x += 2) {
            const phase = (x - bounds.left) / 10
            const waveY = y + Math.sin(phase) * amplitude
            if (x === bounds.left) {
                ctx.moveTo(x, waveY)
            } else {
                ctx.lineTo(x, waveY)
            }
        }
        ctx.stroke()
        
        ctx.restore()
    }
    
    drawTremoloIndicator(bounds, expression) {
        const ctx = this.ctx
        ctx.save()
        
        // Draw intensity bars below note
        ctx.fillStyle = this.EXPRESSION_COLORS.tremolo
        
        const barCount = Math.ceil(3 * expression.depth)
        const barWidth = 3
        const barSpacing = 5
        const startX = bounds.centerX - (barCount * (barWidth + barSpacing)) / 2
        const y = bounds.bottom + 5
        
        for (let i = 0; i < barCount; i++) {
            const x = startX + i * (barWidth + barSpacing)
            const height = 5 + i * 2
            ctx.fillRect(x, y, barWidth, height)
        }
        
        ctx.restore()
    }
    
    drawTrillIndicator(noteData, expression) {
        const ctx = this.ctx
        ctx.save()
        
        const targetData = this.noteElements.get(expression.targetNote)
        if (!targetData || !targetData.bounds) {
            ctx.restore()
            return
        }
        
        const containerRect = this.container.getBoundingClientRect()
        
        // Draw curved arrow between notes
        ctx.strokeStyle = this.EXPRESSION_COLORS.trill
        ctx.lineWidth = 2
        ctx.setLineDash([5, 3])
        
        const start = noteData.bounds
        const end = targetData.bounds
        
        // Convert to canvas coordinates
        const startX = start.centerX - containerRect.left
        const startY = start.top - containerRect.top - 5
        const endX = end.centerX - containerRect.left
        const endY = end.top - containerRect.top - 5
        
        // Control point for curve
        const controlY = Math.min(startY, endY) - 20
        const controlX = (startX + endX) / 2
        
        ctx.beginPath()
        ctx.moveTo(startX, startY)
        ctx.quadraticCurveTo(controlX, controlY, endX, endY)
        ctx.stroke()
        
        // Draw arrow head
        ctx.setLineDash([])
        const angle = Math.atan2(endY - controlY, endX - controlX)
        const arrowSize = 8
        
        ctx.beginPath()
        ctx.moveTo(endX, endY)
        ctx.lineTo(
            endX - arrowSize * Math.cos(angle - Math.PI / 6),
            endY - arrowSize * Math.sin(angle - Math.PI / 6)
        )
        ctx.moveTo(endX, endY)
        ctx.lineTo(
            endX - arrowSize * Math.cos(angle + Math.PI / 6),
            endY - arrowSize * Math.sin(angle + Math.PI / 6)
        )
        ctx.stroke()
        
        ctx.restore()
    }
    
    drawDragFeedback() {
        const ctx = this.ctx
        ctx.save()
        
        const startData = this.noteElements.get(this.dragStartNote)
        if (!startData || !startData.bounds) {
            ctx.restore()
            return
        }
        
        const dx = this.currentDragPos.x - this.dragStartPos.x
        const dy = this.currentDragPos.y - this.dragStartPos.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        if (distance < this.DRAG_THRESHOLD) {
            ctx.restore()
            return
        }
        
        // Convert to canvas coordinates
        const containerRect = this.container.getBoundingClientRect()
        const canvasStartX = startData.bounds.centerX - containerRect.left
        const canvasStartY = startData.bounds.centerY - containerRect.top
        const canvasEndX = this.currentDragPos.x - containerRect.left
        const canvasEndY = this.currentDragPos.y - containerRect.top
        
        // Determine what type of gesture is being performed
        let color = '#666'
        let label = ''
        
        if (dy < this.VIBRATO_THRESHOLD) {
            color = this.EXPRESSION_COLORS.vibrato
            label = 'Vibrato ↑'
        } else if (dy > this.TREMOLO_THRESHOLD) {
            color = this.EXPRESSION_COLORS.tremolo
            label = 'Tremolo ↓'
        } else {
            // Check if hovering over another note
            const targetNote = this.getNoteFromPosition(this.currentDragPos.x, this.currentDragPos.y)
            if (targetNote && targetNote !== this.dragStartNote) {
                color = this.EXPRESSION_COLORS.trill
                label = `Trill → ${targetNote}`
            }
        }
        
        // Draw feedback line
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.setLineDash([5, 5])
        
        ctx.beginPath()
        ctx.moveTo(canvasStartX, canvasStartY)
        ctx.lineTo(canvasEndX, canvasEndY)
        ctx.stroke()
        
        // Draw label with background
        if (label) {
            ctx.font = 'bold 14px sans-serif'
            const metrics = ctx.measureText(label)
            const padding = 6
            
            // Draw background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
            ctx.fillRect(
                canvasEndX + 10, 
                canvasEndY - 20 - padding, 
                metrics.width + padding * 2, 
                20
            )
            
            // Draw text
            ctx.fillStyle = 'white'
            ctx.fillText(label, canvasEndX + 10 + padding, canvasEndY - 10)
        }
        
        ctx.restore()
    }
    
    // Clear all expressions
    clearAll() {
        this.expressions.clear()
        
        // Update all note visuals
        for (const note of this.noteElements.keys()) {
            this.updateNoteVisual(note)
        }
        
        this.render()
    }
    
    // Set multiple expressions at once
    setMultipleExpressions(expressionMap) {
        this.expressions.clear()
        
        for (const [note, expression] of Object.entries(expressionMap)) {
            if (expression.type !== 'none') {
                this.expressions.set(note, expression)
            }
            this.updateNoteVisual(note)
        }
        
        this.render()
    }
}

// CSS styles to be added to the page
const EXPRESSION_STYLES = `
    .piano-key {
        transition: border-color 0.2s, border-width 0.2s;
    }
    
    .piano-key.dragging {
        opacity: 0.8;
        transform: scale(0.95);
    }
    
    .expression-params {
        position: absolute;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 10px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        z-index: 100;
    }
    
    .expression-param {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
    }
    
    .expression-param label {
        font-size: 0.9em;
        min-width: 80px;
    }
    
    .expression-param input[type="range"] {
        width: 120px;
    }
    
    .expression-param .value {
        font-family: monospace;
        font-size: 0.8em;
        min-width: 40px;
    }
`;

// Export for use in controller
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { InteractiveExpression, EXPRESSION_STYLES }
} else {
    window.InteractiveExpression = InteractiveExpression
    window.EXPRESSION_STYLES = EXPRESSION_STYLES
}