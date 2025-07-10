/**
 * PerformanceMonitor - Track and analyze system performance metrics
 */

export class PerformanceMonitor {
  static metrics = {
    programSendTime: [],
    connectionTime: [],
    stateUpdateTime: [],
    messageProcessTime: [],
    renderTime: []
  };
  
  static maxSamples = 100;
  static marks = new Map();
  
  /**
   * Start measuring an operation
   * @param {string} name - Operation name
   */
  static start(name) {
    this.marks.set(name, performance.now());
  }
  
  /**
   * End measurement and record result
   * @param {string} name - Operation name
   * @param {string} category - Metric category
   */
  static end(name, category) {
    const startTime = this.marks.get(name);
    if (!startTime) {
      console.warn(`No start mark found for: ${name}`);
      return;
    }
    
    const duration = performance.now() - startTime;
    this.marks.delete(name);
    
    if (!this.metrics[category]) {
      this.metrics[category] = [];
    }
    
    this.metrics[category].push({
      duration,
      timestamp: Date.now(),
      name
    });
    
    // Keep only recent samples
    if (this.metrics[category].length > this.maxSamples) {
      this.metrics[category].shift();
    }
    
    return duration;
  }
  
  /**
   * Measure a synchronous function
   * @param {string} name - Measurement name
   * @param {Function} fn - Function to measure
   * @returns {*} Function result
   */
  static measure(name, fn, category = 'general') {
    const start = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - start;
      this.recordMetric(category, name, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(category, name, duration);
      throw error;
    }
  }
  
  /**
   * Measure an async function
   * @param {string} name - Measurement name
   * @param {Function} fn - Async function to measure
   * @returns {Promise<*>} Function result
   */
  static async measureAsync(name, fn, category = 'general') {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.recordMetric(category, name, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(category, name, duration);
      throw error;
    }
  }
  
  /**
   * Record a metric
   * @private
   */
  static recordMetric(category, name, duration) {
    if (!this.metrics[category]) {
      this.metrics[category] = [];
    }
    
    this.metrics[category].push({
      duration,
      timestamp: Date.now(),
      name
    });
    
    if (this.metrics[category].length > this.maxSamples) {
      this.metrics[category].shift();
    }
    
    // Log slow operations
    if (duration > 100) {
      console.warn(`Slow operation detected: ${name} took ${duration.toFixed(2)}ms`);
    }
  }
  
  /**
   * Get statistics for a category
   * @param {string} category - Metric category
   */
  static getStats(category) {
    const samples = this.metrics[category];
    if (!samples || samples.length === 0) {
      return null;
    }
    
    const durations = samples.map(s => s.duration);
    const sorted = [...durations].sort((a, b) => a - b);
    
    return {
      count: samples.length,
      mean: durations.reduce((a, b) => a + b, 0) / samples.length,
      median: sorted[Math.floor(sorted.length / 2)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      recent: samples.slice(-10).map(s => ({
        name: s.name,
        duration: s.duration.toFixed(2)
      }))
    };
  }
  
  /**
   * Generate performance report
   */
  static report() {
    const report = {
      timestamp: Date.now(),
      categories: {}
    };
    
    Object.keys(this.metrics).forEach(category => {
      const stats = this.getStats(category);
      if (stats) {
        report.categories[category] = stats;
      }
    });
    
    // Check memory usage if available
    if (performance.memory) {
      report.memory = {
        usedJSHeapSize: (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
        totalJSHeapSize: (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB',
        jsHeapSizeLimit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2) + ' MB'
      };
    }
    
    return report;
  }
  
  /**
   * Create a performance observer for specific operations
   * @param {string} category - Category to monitor
   * @param {number} threshold - Alert threshold in ms
   */
  static createObserver(category, threshold = 100) {
    return {
      start: (name) => this.start(`${category}-${name}`),
      end: (name) => {
        const duration = this.end(`${category}-${name}`, category);
        if (duration && duration > threshold) {
          console.warn(`Performance threshold exceeded: ${name} took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`);
        }
        return duration;
      }
    };
  }
  
  /**
   * Monitor frame rate
   */
  static frameMonitor = {
    lastTime: 0,
    frameCount: 0,
    fps: 0,
    
    update() {
      const now = performance.now();
      this.frameCount++;
      
      if (now - this.lastTime >= 1000) {
        this.fps = Math.round((this.frameCount * 1000) / (now - this.lastTime));
        this.frameCount = 0;
        this.lastTime = now;
        
        if (this.fps < 30) {
          console.warn(`Low FPS detected: ${this.fps}`);
        }
      }
      
      requestAnimationFrame(() => this.update());
    },
    
    start() {
      this.lastTime = performance.now();
      this.update();
    }
  };
  
  /**
   * Clear all metrics
   */
  static clear() {
    Object.keys(this.metrics).forEach(key => {
      this.metrics[key] = [];
    });
    this.marks.clear();
  }
  
  /**
   * Export metrics for analysis
   */
  static export() {
    return {
      metrics: this.metrics,
      report: this.report()
    };
  }
}

// Auto-instrument common operations
if (typeof window !== 'undefined') {
  // Monitor long tasks
  if ('PerformanceObserver' in window) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 50) {
          PerformanceMonitor.recordMetric('longTasks', entry.name || 'unknown', entry.duration);
        }
      }
    });
    
    try {
      observer.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      // Long task monitoring not supported
    }
  }
}