/**
 * ErrorCollector - Centralized error tracking and reporting
 * Collects errors from all components for debugging and monitoring
 */

export class ErrorCollector {
  static errors = [];
  static maxErrors = 100;
  static listeners = new Set();

  /**
   * Log an error from a component
   * @param {string} component - Component name
   * @param {Error|string} error - Error object or message
   * @param {Object} context - Additional context
   */
  static log(component, error, context = {}) {
    const errorEntry = {
      component,
      message: error.message || error.toString(),
      stack: error.stack || null,
      context,
      timestamp: Date.now(),
      id: `${component}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    this.errors.push(errorEntry);
    
    // Keep only recent errors
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // Notify listeners
    this.listeners.forEach(listener => {
      try {
        listener(errorEntry);
      } catch (e) {
        console.error('Error in error listener:', e);
      }
    });

    // Also log to console in development
    if (window.location.hostname === 'localhost') {
      console.error(`[${component}] ${error.message || error}`, context);
      if (error.stack) {
        console.error(error.stack);
      }
    }

    return errorEntry.id;
  }

  /**
   * Create an error boundary for async functions
   * @param {Function} fn - Async function to wrap
   * @param {string} component - Component name for error tracking
   * @returns {Function} Wrapped function
   */
  static createAsyncBoundary(fn, component) {
    return async function(...args) {
      try {
        return await fn.apply(this, args);
      } catch (error) {
        ErrorCollector.log(component, error, {
          function: fn.name,
          arguments: args
        });
        throw error; // Re-throw so caller can handle
      }
    };
  }

  /**
   * Wrap all methods of an object with error boundaries
   * @param {Object} obj - Object with methods to wrap
   * @param {string} component - Component name
   */
  static wrapObject(obj, component) {
    Object.getOwnPropertyNames(Object.getPrototypeOf(obj))
      .filter(prop => typeof obj[prop] === 'function' && prop !== 'constructor')
      .forEach(method => {
        const original = obj[method];
        obj[method] = function(...args) {
          try {
            const result = original.apply(this, args);
            // Handle async methods
            if (result instanceof Promise) {
              return result.catch(error => {
                ErrorCollector.log(component, error, {
                  method,
                  arguments: args
                });
                throw error;
              });
            }
            return result;
          } catch (error) {
            ErrorCollector.log(component, error, {
              method,
              arguments: args
            });
            throw error;
          }
        };
      });
  }

  /**
   * Get recent errors
   * @param {number} count - Number of errors to retrieve
   * @param {string} component - Filter by component (optional)
   */
  static getRecent(count = 10, component = null) {
    let errors = this.errors;
    
    if (component) {
      errors = errors.filter(e => e.component === component);
    }
    
    return errors.slice(-count);
  }

  /**
   * Get error statistics
   */
  static getStats() {
    const stats = {
      total: this.errors.length,
      byComponent: {},
      recentRate: 0
    };

    // Count by component
    this.errors.forEach(error => {
      stats.byComponent[error.component] = (stats.byComponent[error.component] || 0) + 1;
    });

    // Calculate recent error rate (last 5 minutes)
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    const recentErrors = this.errors.filter(e => e.timestamp > fiveMinutesAgo);
    stats.recentRate = recentErrors.length / 5; // errors per minute

    return stats;
  }

  /**
   * Subscribe to error events
   * @param {Function} listener - Function to call on new errors
   * @returns {Function} Unsubscribe function
   */
  static subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Clear all errors
   */
  static clear() {
    this.errors = [];
  }

  /**
   * Export errors for debugging
   */
  static export() {
    return {
      errors: this.errors,
      stats: this.getStats(),
      timestamp: Date.now()
    };
  }
}

// Add global error handlers
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    ErrorCollector.log('window', event.error || event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    ErrorCollector.log('promise', event.reason, {
      promise: event.promise
    });
  });
}