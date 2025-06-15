// svg_interactive_expression.js
// Interactive expression system for SVG piano keyboards

class SVGInteractiveExpression {
    constructor(svgElement, noteMapping) {
        this.instanceId = Math.random().toString(36).substr(2, 9)
        console.log('Creating SVGInteractiveExpression instance:', this.instanceId)
        this.svg = svgElement
        this.noteMapping = noteMapping // Array of {element: SVGRect, note: 'C4', freq: 261.63}
        this.expressions = new Map() // note -> expression data
        this.chordNotes = new Set() // notes that are part of the current chord
        this.relatedNotes = new Map() // note -> {relatedTo: note, type: 'trill-target'}
        
        // Gesture tracking
        this.isDragging = false
        this.dragStartNote = null
        this.dragStartPos = null
        this.currentDragPos = null
        this.dragStartElement = null
        
        // Visual overlay
        this.overlay = null
        this.overlayCtx = null
        this.canvasPadding = 40 // Extra space for indicators outside piano
        
        // Gesture thresholds
        this.DRAG_THRESHOLD = 10 // pixels before drag is recognized
        this.VIBRATO_THRESHOLD = -30 // pixels up for vibrato (increased to avoid accidental triggers)
        this.TREMOLO_THRESHOLD = 30 // pixels down for tremolo
        this.HORIZONTAL_THRESHOLD = 15 // pixels horizontal to prioritize trill
        
        // Expression colors
        this.EXPRESSION_COLORS = {
            none: '#9b59b6', // Purple for chord notes without expression
            trill: '#3498db',
            vibrato: '#e74c3c',
            tremolo: '#f39c12'
        }
        
        // Lighter shades for related notes (trill targets, etc)
        this.EXPRESSION_COLORS_LIGHT = {
            none: '#c39bd3',
            trill: '#85c1e2',
            vibrato: '#f1948a',
            tremolo: '#f8c471'
        }
        
        // Callbacks
        this.onExpressionChange = null
        
        this.init()
    }
    
    init() {
        // Create canvas overlay for visual feedback
        this.createOverlay()
        
        // Build note mapping from SVG elements
        this.buildNoteMapping()
        
        // Bind event handlers
        this.bindEvents()
        
        // Initial render
        this.render()
    }
    
    createOverlay() {
        // Create canvas overlay for drawing expression indicators
        const svgRect = this.svg.getBoundingClientRect()
        
        // Clean up any existing expression canvases in the parent
        const parent = this.svg.parentElement
        const existingCanvases = parent.querySelectorAll('canvas[data-expression-canvas]')
        existingCanvases.forEach(canvas => {
            console.log('Removing existing expression canvas:', canvas.getAttribute('data-expression-canvas'))
            canvas.remove()
        })
        
        this.overlay = document.createElement('canvas')
        this.overlay.style.position = 'absolute'
        this.overlay.style.pointerEvents = 'none'
        this.overlay.style.zIndex = '1000'
        this.overlay.setAttribute('data-expression-canvas', this.instanceId)
        
        // Size canvas larger than SVG to allow indicators outside
        this.overlay.width = svgRect.width + (this.canvasPadding * 2)
        this.overlay.height = svgRect.height + (this.canvasPadding * 2)
        
        // Position canvas over SVG
        parent.style.position = 'relative'
        parent.appendChild(this.overlay)
        
        // Position overlay to match SVG with padding
        this.positionOverlay()
        
        this.overlayCtx = this.overlay.getContext('2d')
    }
    
    positionOverlay() {
        const svgRect = this.svg.getBoundingClientRect()
        const parentRect = this.svg.parentElement.getBoundingClientRect()
        
        this.overlay.style.left = `${svgRect.left - parentRect.left - this.canvasPadding}px`
        this.overlay.style.top = `${svgRect.top - parentRect.top - this.canvasPadding}px`
        this.overlay.width = svgRect.width + (this.canvasPadding * 2)
        this.overlay.height = svgRect.height + (this.canvasPadding * 2)
    }
    
    buildNoteMapping() {
        // If noteMapping wasn't provided, build it from SVG rect elements
        if (!this.noteMapping || this.noteMapping.length === 0) {
            this.noteMapping = []
            
            const rects = this.svg.querySelectorAll('rect[data-note]')
            rects.forEach(rect => {
                const note = rect.getAttribute('data-note')
                const octave = rect.getAttribute('data-octave')
                const freq = parseFloat(rect.getAttribute('data-freq'))
                
                if (note && octave) {
                    this.noteMapping.push({
                        element: rect,
                        note: note + octave,
                        freq: freq || 440
                    })
                }
            })
        }
        
        console.log(`Built note mapping with ${this.noteMapping.length} notes`)
    }
    
    bindEvents() {
        // SVG mouse events
        this.svg.addEventListener('mousedown', this.handleMouseDown.bind(this))
        window.addEventListener('mousemove', this.handleMouseMove.bind(this))
        window.addEventListener('mouseup', this.handleMouseUp.bind(this))
        
        // Touch events
        this.svg.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false })
        window.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false })
        window.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false })
        
        // Window resize
        window.addEventListener('resize', this.handleResize.bind(this))
    }
    
    handleMouseDown(e) {
        const noteData = this.getNoteFromEvent(e)
        if (!noteData) return
        
        this.startDrag(noteData, e.clientX, e.clientY)
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
        const noteData = this.getNoteFromEvent(touch)
        if (!noteData) return
        
        this.startDrag(noteData, touch.clientX, touch.clientY)
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
        // Reposition overlay
        this.positionOverlay()
        
        // Redraw
        this.render()
    }
    
    getNoteFromEvent(e) {
        // Handle both mouse and touch events
        const target = e.target
        
        // Check if it's an SVG rect with note data
        if (target.tagName === 'rect' && target.hasAttribute('data-note')) {
            const note = target.getAttribute('data-note')
            const octave = target.getAttribute('data-octave')
            const freq = parseFloat(target.getAttribute('data-freq'))
            
            return {
                element: target,
                note: note + octave,
                freq: freq || 440
            }
        }
        
        return null
    }
    
    getNoteFromPosition(x, y) {
        // Find which note is at the given position
        const point = this.svg.createSVGPoint()
        point.x = x
        point.y = y
        
        // Convert to SVG coordinates
        const svgPoint = point.matrixTransform(this.svg.getScreenCTM().inverse())
        
        // Check each note's bounding box in reverse order (black keys first)
        // This ensures black keys, which are drawn on top, are checked before white keys
        for (let i = this.noteMapping.length - 1; i >= 0; i--) {
            const noteData = this.noteMapping[i]
            const rect = noteData.element
            const bbox = rect.getBBox()
            
            if (svgPoint.x >= bbox.x && 
                svgPoint.x <= bbox.x + bbox.width &&
                svgPoint.y >= bbox.y && 
                svgPoint.y <= bbox.y + bbox.height) {
                return noteData
            }
        }
        
        return null
    }
    
    startDrag(noteData, x, y) {
        console.log('Starting drag:', noteData.note, x, y)
        this.isDragging = true
        this.dragStartNote = noteData.note
        this.dragStartElement = noteData.element
        this.dragStartPos = { x, y }
        this.currentDragPos = { x, y }
        
        // Visual feedback - highlight the key
        this.highlightKey(noteData.element, true)
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
        const dx = x - this.dragStartPos.x
        const dy = y - this.dragStartPos.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        console.log('End drag:', {
            startNote: this.dragStartNote,
            dx,
            dy,
            distance
        })
        
        // Determine expression type based on drag
        let expression = null
        
        if (distance < this.DRAG_THRESHOLD) {
            // Simple click - toggle note in chord
            console.log('Simple click - toggling chord membership')
            if (this.chordNotes.has(this.dragStartNote)) {
                // Remove from chord - will be handled by callback
                expression = { type: 'remove-from-chord' }
            } else {
                // Add to chord
                this.chordNotes.add(this.dragStartNote)
                expression = { type: 'none' }
            }
        } else if (Math.abs(dx) > this.HORIZONTAL_THRESHOLD) {
            // Check for horizontal drag first - trill
            const targetNote = this.getNoteFromPosition(x, y)
            console.log('Checking for trill target:', targetNote)
            if (targetNote && targetNote.note !== this.dragStartNote) {
                // Add main note to chord if not already
                if (!this.chordNotes.has(this.dragStartNote)) {
                    this.chordNotes.add(this.dragStartNote)
                }
                
                expression = {
                    type: 'trill',
                    targetNote: targetNote.note,
                    targetFreq: targetNote.freq,
                    interval: this.calculateInterval(this.dragStartNote, targetNote.note),
                    speed: 8
                }
                console.log('Trill detected:', expression)
                
                // Mark the target note as related but don't add to chord
                this.relatedNotes.set(targetNote.note, {
                    relatedTo: this.dragStartNote,
                    type: 'trill-target'
                })
            }
        } else if (dy < this.VIBRATO_THRESHOLD) {
            // Dragged up - vibrato (negative dy means up)
            console.log('Vibrato detected')
            
            // Add to chord if not already
            if (!this.chordNotes.has(this.dragStartNote)) {
                this.chordNotes.add(this.dragStartNote)
            }
            
            expression = {
                type: 'vibrato',
                depth: Math.min(1, Math.abs(dy) / 100),
                rate: 4
            }
        } else if (dy > this.TREMOLO_THRESHOLD) {
            // Dragged down - tremolo
            console.log('Tremolo detected')
            
            // Add to chord if not already
            if (!this.chordNotes.has(this.dragStartNote)) {
                this.chordNotes.add(this.dragStartNote)
            }
            
            expression = {
                type: 'tremolo',
                depth: Math.min(1, dy / 100),
                speed: 10
            }
        }
        
        // Apply expression
        if (expression) {
            if (expression.type === 'remove-from-chord') {
                // Special handling for chord removal
                this.chordNotes.delete(this.dragStartNote)
                this.expressions.delete(this.dragStartNote)
                this.updateKeyVisual(this.dragStartNote)
                if (this.onExpressionChange) {
                    this.onExpressionChange(this.dragStartNote, { type: 'removed' })
                }
            } else {
                this.setExpression(this.dragStartNote, expression)
            }
        }
        
        // Clean up
        this.isDragging = false
        this.dragStartNote = null
        this.highlightKey(this.dragStartElement, false)
        this.dragStartElement = null
        this.render()
    }
    
    calculateInterval(note1, note2) {
        // Simple interval calculation based on note names
        const noteOrder = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        
        const parseNote = (noteStr) => {
            const match = noteStr.match(/^([A-G]#?)(\d)$/)
            if (!match) return null
            const noteName = match[1]
            const octave = parseInt(match[2])
            const noteIndex = noteOrder.indexOf(noteName)
            return octave * 12 + noteIndex
        }
        
        const midi1 = parseNote(note1)
        const midi2 = parseNote(note2)
        
        return Math.abs(midi2 - midi1)
    }
    
    setExpression(note, expression) {
        console.log('Setting expression:', note, expression)
        
        // Clear any previous related notes for this note
        const oldExpression = this.expressions.get(note)
        if (oldExpression && oldExpression.type === 'trill' && oldExpression.targetNote) {
            this.relatedNotes.delete(oldExpression.targetNote)
            // Update the old target note visual
            this.updateKeyVisual(oldExpression.targetNote)
        }
        
        if (expression.type === 'none') {
            this.expressions.delete(note)
        } else {
            this.expressions.set(note, expression)
            
            // Handle trill target notes
            if (expression.type === 'trill' && expression.targetNote) {
                if (!this.chordNotes.has(expression.targetNote)) {
                    this.chordNotes.add(expression.targetNote)
                }
                this.relatedNotes.set(expression.targetNote, {
                    relatedTo: note,
                    type: 'trill-target'
                })
                // Update the target note visual
                this.updateKeyVisual(expression.targetNote)
            }
        }
        
        // Update visual state
        this.updateKeyVisual(note)
        
        // Notify listeners
        if (this.onExpressionChange) {
            this.onExpressionChange(note, expression)
        }
        
        this.render()
    }
    
    getExpression(note) {
        return this.expressions.get(note) || { type: 'none' }
    }
    
    getAllExpressions() {
        const result = {}
        // Include all chord notes, even without expressions
        for (const note of this.chordNotes) {
            const expression = this.getExpression(note)
            result[note] = expression
        }
        return result
    }
    
    // Get current chord notes (excluding trill targets)
    getChordNotes() {
        // Filter out notes that are only trill targets
        const actualChordNotes = Array.from(this.chordNotes).filter(note => {
            // Keep the note if it has its own expression or if it's not a trill target
            const relatedInfo = this.relatedNotes.get(note)
            return !relatedInfo || relatedInfo.type !== 'trill-target' || this.expressions.has(note)
        })
        return actualChordNotes
    }
    
    highlightKey(element, highlighted) {
        if (!element) return
        
        const originalFill = element.getAttribute('data-original-fill')
        if (!originalFill) {
            element.setAttribute('data-original-fill', element.getAttribute('fill'))
        }
        
        if (highlighted) {
            element.style.opacity = '0.8'
            element.style.filter = 'brightness(1.2)'
        } else {
            element.style.opacity = '1'
            element.style.filter = 'none'
        }
    }
    
    updateKeyVisual(note) {
        const noteData = this.noteMapping.find(n => n.note === note)
        if (!noteData) return
        
        const expression = this.getExpression(note)
        const element = noteData.element
        
        // Store original fill and stroke if not already stored
        if (!element.hasAttribute('data-original-fill')) {
            element.setAttribute('data-original-fill', element.getAttribute('fill') || 'white')
            element.setAttribute('data-original-stroke', element.getAttribute('stroke') || '#000')
        }
        
        // If note is in chord, use expression color for fill
        if (this.chordNotes.has(note)) {
            let color
            
            // Check if this is a related note (like trill target)
            const relatedInfo = this.relatedNotes.get(note)
            if (relatedInfo) {
                // Use lighter shade for related notes
                const mainNote = relatedInfo.relatedTo
                const mainExpression = this.getExpression(mainNote)
                color = this.EXPRESSION_COLORS_LIGHT[mainExpression.type]
            } else {
                // Use full color for main notes
                color = this.EXPRESSION_COLORS[expression.type]
            }
            
            // Store current fill to check if it needs updating
            const currentFill = element.getAttribute('fill')
            
            // Apply visual changes
            element.setAttribute('fill', color)
            element.setAttribute('stroke', '#000')
            
            // Force style update to ensure visibility
            element.style.fill = color
            element.style.stroke = '#000'
            element.style.opacity = '1'
            
            // Add visual feedback that this is a chord note
            if (relatedInfo) {
                element.style.filter = 'brightness(1.1) saturate(0.8)' // Slightly less intense for related notes
            } else {
                element.style.filter = 'brightness(1.2) saturate(1.2)'
            }
            
            // No need for force reflow - the style changes will update naturally
        } else {
            // Reset to original appearance
            const originalFill = element.getAttribute('data-original-fill')
            const originalStroke = element.getAttribute('data-original-stroke')
            
            if (originalFill) element.setAttribute('fill', originalFill)
            if (originalStroke) element.setAttribute('stroke', originalStroke)
            
            // Clear ALL inline styles to ensure SVG attributes take effect
            element.style.fill = ''
            element.style.stroke = ''
            element.style.filter = ''
            element.style.opacity = ''
            element.style.display = ''
        }
    }
    
    render() {
        if (!this.overlay || !this.overlayCtx) {
            console.log('No overlay or context available for rendering')
            return
        }
        
        // Ensure we have a valid context (canvas dimensions might have been reset)
        if (this.overlay.width === 0 || this.overlay.height === 0) {
            console.log('Canvas has no dimensions, repositioning overlay')
            this.positionOverlay()
            this.overlayCtx = this.overlay.getContext('2d')
        }
        
        console.log('SVGInteractiveExpression.render() called')
        console.log('Stack trace:', new Error().stack)
        console.log('Current expressions:', this.expressions.size, Array.from(this.expressions.keys()))
        console.log('Canvas dimensions:', this.overlay.width, 'x', this.overlay.height)
        
        // Always clear canvas first
        this.overlayCtx.clearRect(0, 0, this.overlay.width, this.overlay.height)
        
        // Draw expression indicators
        this.drawExpressionIndicators()
        
        // Draw current drag feedback
        if (this.isDragging) {
            this.drawDragFeedback()
        }
    }
    
    drawExpressionIndicators() {
        const ctx = this.overlayCtx
        const svgRect = this.svg.getBoundingClientRect()
        
        console.log('drawExpressionIndicators() - chordNotes:', this.chordNotes.size, Array.from(this.chordNotes))
        
        // Draw expression for each chord note
        for (const note of this.chordNotes) {
            const noteData = this.noteMapping.find(n => n.note === note)
            if (!noteData) continue
            
            const expression = this.getExpression(note)
            if (expression.type === 'none') continue
            
            console.log(`Drawing indicator for ${note}, type: ${expression.type}`)
            
            const rect = noteData.element.getBoundingClientRect()
            const x = rect.left - svgRect.left + rect.width / 2 + this.canvasPadding
            const y = rect.top - svgRect.top + this.canvasPadding
            
            switch (expression.type) {
                case 'vibrato':
                    this.drawVibratoIndicator(x, y, rect.width, expression)
                    break
                case 'tremolo':
                    this.drawTremoloIndicator(x, y + rect.height, rect.width, expression)
                    break
                case 'trill':
                    this.drawTrillIndicator(noteData, expression)
                    break
            }
        }
    }
    
    drawVibratoIndicator(x, y, width, expression) {
        const ctx = this.overlayCtx
        ctx.save()
        
        // Add depth percentage label above the key
        ctx.fillStyle = this.EXPRESSION_COLORS.vibrato
        ctx.font = 'bold 12px sans-serif'
        ctx.textAlign = 'center'
        const depthPercent = Math.round(expression.depth * 100)
        ctx.fillText(`${depthPercent}%`, x, y - 10)
        
        ctx.restore()
    }
    
    drawTremoloIndicator(x, y, width, expression) {
        const ctx = this.overlayCtx
        ctx.save()
        
        // Add depth percentage label below the key
        ctx.fillStyle = this.EXPRESSION_COLORS.tremolo
        ctx.font = 'bold 12px sans-serif'
        ctx.textAlign = 'center'
        const depthPercent = Math.round(expression.depth * 100)
        ctx.fillText(`${depthPercent}%`, x, y + 15)
        
        ctx.restore()
    }
    
    drawTrillIndicator(noteData, expression) {
        const ctx = this.overlayCtx
        ctx.save()
        
        const targetData = this.noteMapping.find(n => n.note === expression.targetNote)
        if (!targetData) {
            ctx.restore()
            return
        }
        
        const svgRect = this.svg.getBoundingClientRect()
        const startRect = noteData.element.getBoundingClientRect()
        const endRect = targetData.element.getBoundingClientRect()
        
        // Convert to canvas coordinates (with padding)
        const startX = startRect.left - svgRect.left + startRect.width / 2 + this.canvasPadding
        const startY = startRect.top - svgRect.top + this.canvasPadding
        const endX = endRect.left - svgRect.left + endRect.width / 2 + this.canvasPadding
        const endY = endRect.top - svgRect.top + this.canvasPadding
        
        ctx.strokeStyle = this.EXPRESSION_COLORS.trill
        ctx.lineWidth = 3
        ctx.setLineDash([5, 3])
        
        // Control point for curve
        const controlY = Math.min(startY, endY) - 30
        const controlX = (startX + endX) / 2
        
        ctx.beginPath()
        ctx.moveTo(startX, startY - 5)
        ctx.quadraticCurveTo(controlX, controlY, endX, endY - 5)
        ctx.stroke()
        
        // Arrow head
        ctx.setLineDash([])
        const angle = Math.atan2(endY - controlY, endX - controlX)
        const arrowSize = 10
        
        ctx.beginPath()
        ctx.moveTo(endX, endY - 5)
        ctx.lineTo(
            endX - arrowSize * Math.cos(angle - Math.PI / 6),
            endY - 5 - arrowSize * Math.sin(angle - Math.PI / 6)
        )
        ctx.moveTo(endX, endY - 5)
        ctx.lineTo(
            endX - arrowSize * Math.cos(angle + Math.PI / 6),
            endY - 5 - arrowSize * Math.sin(angle + Math.PI / 6)
        )
        ctx.stroke()
        
        ctx.restore()
    }
    
    drawDragFeedback() {
        const ctx = this.overlayCtx
        ctx.save()
        
        if (!this.dragStartElement) {
            ctx.restore()
            return
        }
        
        const svgRect = this.svg.getBoundingClientRect()
        const startRect = this.dragStartElement.getBoundingClientRect()
        
        // Convert to canvas coordinates (with padding)
        const startX = startRect.left - svgRect.left + startRect.width / 2 + this.canvasPadding
        const startY = startRect.top - svgRect.top + startRect.height / 2 + this.canvasPadding
        const endX = this.currentDragPos.x - svgRect.left + this.canvasPadding
        const endY = this.currentDragPos.y - svgRect.top + this.canvasPadding
        
        const dx = this.currentDragPos.x - this.dragStartPos.x
        const dy = this.currentDragPos.y - this.dragStartPos.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        if (distance < this.DRAG_THRESHOLD) {
            ctx.restore()
            return
        }
        
        // Determine gesture type
        let color = '#666'
        let label = ''
        let depth = 0
        
        // Check horizontal movement first for trill
        if (Math.abs(dx) > this.HORIZONTAL_THRESHOLD) {
            const targetNote = this.getNoteFromPosition(this.currentDragPos.x, this.currentDragPos.y)
            if (targetNote && targetNote.note !== this.dragStartNote) {
                color = this.EXPRESSION_COLORS.trill
                label = `Trill → ${targetNote.note}`
            }
        } else if (dy < this.VIBRATO_THRESHOLD) {
            color = this.EXPRESSION_COLORS.vibrato
            depth = Math.min(1, Math.abs(dy) / 100)
            label = `V ${Math.round(depth * 100)}%`
        } else if (dy > this.TREMOLO_THRESHOLD) {
            color = this.EXPRESSION_COLORS.tremolo
            depth = Math.min(1, dy / 100)
            label = `T ${Math.round(depth * 100)}%`
        }
        
        // Draw feedback line
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.setLineDash([5, 5])
        
        ctx.beginPath()
        ctx.moveTo(startX, startY)
        ctx.lineTo(endX, endY)
        ctx.stroke()
        
        // Draw depth indicator for vibrato/tremolo
        if (depth > 0 && (dy < this.VIBRATO_THRESHOLD || dy > this.TREMOLO_THRESHOLD)) {
            // Draw a visual depth indicator
            ctx.save()
            ctx.strokeStyle = color
            ctx.lineWidth = 4
            ctx.setLineDash([])
            ctx.globalAlpha = 0.6
            
            // Draw arc showing depth
            const radius = 30
            const startAngle = dy < 0 ? Math.PI : 0  // Vibrato starts from bottom, tremolo from top
            const endAngle = startAngle + (Math.PI * depth)
            
            ctx.beginPath()
            ctx.arc(startX, startY, radius, startAngle, endAngle, false)
            ctx.stroke()
            
            ctx.restore()
        }
        
        // Draw label on the piano key instead of following mouse
        if (label && (dy < this.VIBRATO_THRESHOLD || dy > this.TREMOLO_THRESHOLD)) {
            ctx.font = 'bold 12px sans-serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            
            // Calculate position on the key
            const keyRect = this.dragStartElement.getBoundingClientRect()
            const keyCenterX = keyRect.left - svgRect.left + keyRect.width / 2 + this.canvasPadding
            const keyCenterY = keyRect.top - svgRect.top + keyRect.height / 2 + this.canvasPadding
            
            // Position label in lower half of key for better visibility
            const labelY = keyCenterY + keyRect.height / 4
            
            // Simple background for contrast
            const metrics = ctx.measureText(label)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
            ctx.fillRect(
                keyCenterX - metrics.width / 2 - 4,
                labelY - 10,
                metrics.width + 8,
                20
            )
            
            // Draw text
            ctx.fillStyle = 'white'
            ctx.fillText(label, keyCenterX, labelY)
            
            ctx.textAlign = 'left'
            ctx.textBaseline = 'alphabetic'
        } else if (label) {
            // For trill, keep the label following the mouse
            ctx.font = 'bold 14px sans-serif'
            const metrics = ctx.measureText(label)
            const padding = 6
            
            // Background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
            ctx.fillRect(
                endX + 10,
                endY - 20 - padding,
                metrics.width + padding * 2,
                20
            )
            
            // Text
            ctx.fillStyle = 'white'
            ctx.fillText(label, endX + 10 + padding, endY - 10)
        }
        
        ctx.restore()
    }
    
    // Set which notes are in the current chord
    setChordNotes(notes) {
        // Clear related notes when chord changes
        this.relatedNotes.clear()
        
        this.chordNotes = new Set(notes)
        
        console.log('Setting chord notes:', notes)
        
        // Re-establish related notes based on current expressions
        for (const [note, expression] of this.expressions) {
            if (this.chordNotes.has(note) && expression.type === 'trill' && expression.targetNote) {
                if (!this.chordNotes.has(expression.targetNote)) {
                    this.chordNotes.add(expression.targetNote)
                }
                this.relatedNotes.set(expression.targetNote, {
                    relatedTo: note,
                    type: 'trill-target'
                })
            }
        }
        
        // First, reset all notes to ensure clean state
        for (const noteData of this.noteMapping) {
            const element = noteData.element
            if (!this.chordNotes.has(noteData.note)) {
                // Clear any previous chord styling
                if (element.hasAttribute('data-original-fill')) {
                    element.setAttribute('fill', element.getAttribute('data-original-fill'))
                    element.style.fill = ''
                    element.style.filter = ''
                    element.style.opacity = '1'
                }
            }
        }
        
        // Then update all key visuals
        for (const noteData of this.noteMapping) {
            this.updateKeyVisual(noteData.note)
        }
        
        // Force immediate render
        this.render()
        
        // Force SVG to redraw
        this.svg.style.display = 'none'
        this.svg.offsetHeight // Force reflow
        this.svg.style.display = ''
    }
    
    // Clear all expressions
    clearAll() {
        console.log('SVGInteractiveExpression.clearAll() called')
        console.log('Instance ID:', this.instanceId || 'default')
        console.log('Before clear - expressions:', this.expressions.size, 'chordNotes:', this.chordNotes.size)
        
        this.expressions.clear()
        this.chordNotes.clear()
        this.relatedNotes.clear()
        
        console.log('After clear - expressions:', this.expressions.size, 'chordNotes:', this.chordNotes.size)
        
        // Reset all key visuals
        for (const noteData of this.noteMapping) {
            this.updateKeyVisual(noteData.note)
        }
        
        // Ensure we have a valid canvas context before clearing
        if (this.overlay && this.overlayCtx) {
            // Check if canvas needs repositioning
            if (this.overlay.width === 0 || this.overlay.height === 0) {
                this.positionOverlay()
                this.overlayCtx = this.overlay.getContext('2d')
            }
            
            console.log('Clearing canvas:', this.overlay.width, 'x', this.overlay.height)
            
            // Clear the canvas completely
            this.overlayCtx.clearRect(0, 0, this.overlay.width, this.overlay.height)
            
            // Force browser to update the canvas
            this.overlay.style.display = 'none'
            this.overlay.offsetHeight // Force reflow
            this.overlay.style.display = ''
            
            // Double check all canvases in the document
            const allCanvases = document.querySelectorAll('canvas')
            console.log('Total canvases in document:', allCanvases.length)
            allCanvases.forEach((canvas, index) => {
                console.log(`Canvas ${index}:`, canvas.width, 'x', canvas.height, 'parent:', canvas.parentElement?.id || 'no-id')
            })
        }
        
        // Notify controller that expressions have changed
        if (this.onExpressionChange) {
            this.onExpressionChange(null, null)
        }
    }
    
    // Set multiple expressions at once
    setMultipleExpressions(expressionMap) {
        this.expressions.clear()
        
        for (const [note, expression] of Object.entries(expressionMap)) {
            if (expression.type !== 'none') {
                this.expressions.set(note, expression)
            }
            this.updateKeyVisual(note)
        }
        
        this.render()
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SVGInteractiveExpression }
} else {
    window.SVGInteractiveExpression = SVGInteractiveExpression
}