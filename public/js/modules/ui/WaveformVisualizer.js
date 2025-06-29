/**
 * WaveformVisualizer Module for String Assembly FM
 * Vertical waveform visualization with cosine envelope
 */

export class WaveformVisualizer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d');
    
    // Configuration options
    this.options = {
      lineWidth: 2,
      strokeStyle: '#ffffff',
      backgroundColor: '#000000',
      amplitudeScale: 0.4, // Percentage of canvas width
      samples: 256,
      ...options
    };
    
    this.isRunning = false;
    this.analyserNode = null;
    this.dataArray = null;
  }

  /**
   * Set the analyser node to visualize
   * @param {AnalyserNode} analyserNode - Web Audio API analyser node
   */
  setAnalyserNode(analyserNode) {
    if (!analyserNode) {
      console.warn('[WaveformVisualizer] No analyser node provided');
      return;
    }
    
    this.analyserNode = analyserNode;
    this.dataArray = new Float32Array(analyserNode.fftSize);
    
    // If visualization was already started, begin drawing now
    if (this.isRunning && !this.animationId) {
      this.draw();
    }
  }

  /**
   * Start the visualization
   */
  start() {
    this.isRunning = true;
    
    // Only start drawing if analyser is already set
    if (this.analyserNode) {
      this.draw();
    }
    // Otherwise, drawing will start automatically when setAnalyserNode is called
  }

  /**
   * Stop the visualization
   */
  stop() {
    this.isRunning = false;
  }

  /**
   * Resize the canvas
   * @param {number} width - New width
   * @param {number} height - New height
   */
  resize(width, height) {
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  /**
   * Draw single frame of the visualization
   */
  draw() {
    if (!this.isRunning) return;
    
    requestAnimationFrame(() => this.draw());
    
    if (!this.ctx || !this.canvas || !this.analyserNode || !this.dataArray) {
      // Clear canvas when no audio
      if (this.ctx) {
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }
      return;
    }

    // Get time domain data for waveform
    this.analyserNode.getFloatTimeDomainData(this.dataArray);
    
    // Clear canvas
    this.ctx.fillStyle = this.options.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Set up drawing style
    this.ctx.lineWidth = this.options.lineWidth;
    this.ctx.strokeStyle = this.options.strokeStyle;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    
    // Begin path for waveform
    this.ctx.beginPath();
    
    // Center x position
    const centerX = this.canvas.width / 2;
    const maxAmplitude = this.canvas.width * this.options.amplitudeScale;
    
    // Number of points to sample from the buffer
    const samples = this.options.samples;
    const step = Math.floor(this.dataArray.length / samples);
    
    // Move to top center
    this.ctx.moveTo(centerX, 0);
    
    // Draw waveform with cosine envelope
    for (let i = 0; i < samples; i++) {
      const dataIndex = i * step;
      const sample = this.dataArray[dataIndex] || 0;
      
      // Y position (0 to canvas.height)
      const y = (i / (samples - 1)) * this.canvas.height;
      
      // Cosine envelope: 1 at center, 0 at top/bottom
      const envelope = Math.cos((i / (samples - 1) - 0.5) * Math.PI * 2) * 0.5 + 0.5;
      
      // Apply envelope to the sample amplitude
      const amplitude = sample * envelope * maxAmplitude;
      
      // X position with amplitude offset
      const x = centerX + amplitude;
      
      this.ctx.lineTo(x, y);
    }
    
    this.ctx.stroke();
  }

  /**
   * Update visualization options
   * @param {Object} options - Options to update
   */
  updateOptions(options) {
    this.options = { ...this.options, ...options };
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stop();
    this.analyserNode = null;
    this.dataArray = null;
  }
}