/**
 * ParameterControls Module for String Assembly FM
 * Handles all parameter input controls (sliders, checkboxes, etc.)
 */

import { eventBus } from '../core/EventBus.js';
import { appState } from '../state/AppState.js';
import { Config } from '../core/Config.js';

export class ParameterControls {
  constructor() {
    this.eventBus = eventBus;
    this.appState = appState;
    this.paramElements = new Map();
    this.isInitialized = false;
    this.changeDebounceTime = 50; // ms
    this.changeTimeouts = new Map();
  }

  /**
   * Initialize parameter controls
   */
  initialize() {
    if (this.isInitialized) {
      if (window.Logger) {
        window.Logger.log('ParameterControls already initialized', 'lifecycle');
      }
      return;
    }

    if (window.Logger) {
      window.Logger.log('Initializing ParameterControls...', 'lifecycle');
    }

    // Cache parameter elements
    this.cacheParameterElements();

    // Set up parameter event listeners
    this.setupParameterEventListeners();

    // Set up expression radio buttons
    this.setupExpressionControls();

    // Set up harmonic ratio selectors
    this.setupHarmonicRatioSelectors();

    // Set up state subscriptions
    this.setupStateSubscriptions();

    this.isInitialized = true;

    if (window.Logger) {
      window.Logger.log('ParameterControls initialized', 'lifecycle');
    }
  }

  /**
   * Cache parameter elements
   * @private
   */
  cacheParameterElements() {
    Config.PARAM_IDS.forEach(paramId => {
      const input = document.getElementById(paramId);
      const valueDisplay = document.getElementById(`${paramId}_value`);
      const controlGroup = input?.closest('.control-group');

      if (input) {
        this.paramElements.set(paramId, {
          input,
          valueDisplay,
          controlGroup,
          type: input.type,
          min: parseFloat(input.min) || 0,
          max: parseFloat(input.max) || 1,
          step: parseFloat(input.step) || 0.01
        });
      } else if (window.Logger) {
        window.Logger.log(`Parameter element not found: ${paramId}`, 'error');
      }
    });

    if (window.Logger) {
      window.Logger.log(`Cached ${this.paramElements.size} parameter elements`, 'parameters');
    }
  }

  /**
   * Set up parameter event listeners
   * @private
   */
  setupParameterEventListeners() {
    this.paramElements.forEach((element, paramId) => {
      if (!element.input) return;

      // Input event for real-time changes
      element.input.addEventListener('input', (e) => {
        this.handleParameterInput(paramId, e);
      });

      // Change event for committed changes
      element.input.addEventListener('change', (e) => {
        this.handleParameterChange(paramId, e);
      });

      // Focus events for visual feedback
      element.input.addEventListener('focus', () => {
        this.handleParameterFocus(paramId);
      });

      element.input.addEventListener('blur', () => {
        this.handleParameterBlur(paramId);
      });
    });
  }

  /**
   * Set up expression radio button controls
   * @private
   */
  setupExpressionControls() {
    const expressionRadios = document.querySelectorAll('input[name="expression"]');

    expressionRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.handleExpressionChange(e.target.value);
        }
      });
    });

    if (window.Logger) {
      window.Logger.log(`Set up ${expressionRadios.length} expression controls`, 'parameters');
    }
  }

  /**
   * Set up harmonic ratio selector controls
   * @private
   */
  setupHarmonicRatioSelectors() {
    const harmonicSelectors = document.querySelectorAll('.harmonic-selector');

    harmonicSelectors.forEach(selector => {
      const expression = selector.dataset.expression;
      if (!expression) return;

      const buttons = selector.querySelectorAll('.harmonic-button');
      buttons.forEach(button => {
        button.addEventListener('click', (e) => {
          this.handleHarmonicRatioClick(expression, button, e);
        });
      });
    });

    if (window.Logger) {
      window.Logger.log(`Set up ${harmonicSelectors.length} harmonic ratio selectors`, 'parameters');
    }
  }

  /**
   * Set up state subscriptions
   * @private
   */
  setupStateSubscriptions() {
    // Subscribe to harmonic selections changes
    this.appState.subscribe('harmonicSelections', (newSelections) => {
      this.updateHarmonicSelectionDisplay(newSelections);
    });

    // Subscribe to selected expression changes
    this.appState.subscribe('selectedExpression', (newExpression) => {
      this.updateExpressionSelection(newExpression);
    });

    // Subscribe to current program changes
    this.appState.subscribe('currentProgram', (newProgram) => {
      if (newProgram) {
        this.updateParameterValues(newProgram);
      }
    });
  }

  /**
   * Handle parameter input events (real-time)
   * @param {string} paramId - Parameter ID
   * @param {Event} event - Input event
   * @private
   */
  handleParameterInput(paramId, event) {
    const element = this.paramElements.get(paramId);
    if (!element) return;

    const value = this.parseParameterValue(element, event.target.value);

    // Update display value immediately
    this.updateDisplayValue(paramId, value);

    // Mark parameter as changed
    this.markParameterChanged(paramId);

    // Debounce the change notification
    this.debounceParameterChange(paramId, value);

    if (window.Logger) {
      window.Logger.log(`Parameter input: ${paramId} = ${value}`, 'parameters');
    }
  }

  /**
   * Handle parameter change events (committed)
   * @param {string} paramId - Parameter ID
   * @param {Event} event - Change event
   * @private
   */
  handleParameterChange(paramId, event) {
    const element = this.paramElements.get(paramId);
    if (!element) return;

    const value = this.parseParameterValue(element, event.target.value);

    // Emit parameter change event
    this.eventBus.emit('parameter:changed', {
      paramId,
      value,
      timestamp: Date.now()
    });

    // Update current program in app state
    const currentProgram = this.appState.get('currentProgram') || {};
    currentProgram[paramId] = value;
    this.appState.set('currentProgram', currentProgram);

    if (window.Logger) {
      window.Logger.log(`Parameter changed: ${paramId} = ${value}`, 'parameters');
    }
  }

  /**
   * Handle parameter focus
   * @param {string} paramId - Parameter ID
   * @private
   */
  handleParameterFocus(paramId) {
    const element = this.paramElements.get(paramId);
    if (element?.controlGroup) {
      element.controlGroup.classList.add('focused');
    }

    this.eventBus.emit('parameter:focused', {
      paramId,
      timestamp: Date.now()
    });
  }

  /**
   * Handle parameter blur
   * @param {string} paramId - Parameter ID
   * @private
   */
  handleParameterBlur(paramId) {
    const element = this.paramElements.get(paramId);
    if (element?.controlGroup) {
      element.controlGroup.classList.remove('focused');
    }

    this.eventBus.emit('parameter:blurred', {
      paramId,
      timestamp: Date.now()
    });
  }

  /**
   * Handle expression change
   * @param {string} expression - Selected expression type
   * @private
   */
  handleExpressionChange(expression) {
    this.appState.set('selectedExpression', expression);

    // Show/hide expression groups
    this.updateExpressionGroupVisibility(expression);

    this.eventBus.emit('expression:changed', {
      expression,
      timestamp: Date.now()
    });

    if (window.Logger) {
      window.Logger.log(`Expression changed: ${expression}`, 'expressions');
    }
  }

  /**
   * Handle harmonic ratio button click
   * @param {string} expression - Expression type
   * @param {Element} button - Clicked button
   * @param {Event} event - Click event
   * @private
   */
  handleHarmonicRatioClick(expression, button, event) {
    const value = parseInt(button.dataset.value);
    const type = button.dataset.type; // 'numerator' or 'denominator'
    const selectorKey = `${expression}-${type}`;

    const harmonicSelections = this.appState.get('harmonicSelections');
    const currentSelection = harmonicSelections[selectorKey];

    if (!currentSelection) return;

    // Handle different click types
    if (event.ctrlKey || event.metaKey) {
      // Ctrl+click: toggle selection
      if (currentSelection.has(value)) {
        currentSelection.delete(value);
        // Ensure at least one value is selected
        if (currentSelection.size === 0) {
          currentSelection.add(1);
        }
      } else {
        currentSelection.add(value);
      }
    } else if (event.shiftKey) {
      // Shift+click: range selection (if previous selection exists)
      // For simplicity, just add to selection
      currentSelection.add(value);
    } else {
      // Normal click: single selection
      currentSelection.clear();
      currentSelection.add(value);
    }

    // Update state
    this.appState.set('harmonicSelections', harmonicSelections);

    // Update button visual state
    this.updateHarmonicButtonStates(expression, type);

    this.eventBus.emit('harmonicRatio:changed', {
      expression,
      type,
      value,
      selection: Array.from(currentSelection),
      timestamp: Date.now()
    });

    if (window.Logger) {
      window.Logger.log(`Harmonic ratio changed: ${selectorKey} = [${Array.from(currentSelection).join(', ')}]`, 'expressions');
    }
  }

  /**
   * Parse parameter value based on element type
   * @param {Object} element - Parameter element data
   * @param {string} rawValue - Raw string value
   * @returns {number|string} Parsed value
   * @private
   */
  parseParameterValue(element, rawValue) {
    if (element.type === 'range' || element.type === 'number') {
      return parseFloat(rawValue);
    }
    return rawValue;
  }

  /**
   * Update display value for a parameter
   * @param {string} paramId - Parameter ID
   * @param {number|string} value - New value
   */
  updateDisplayValue(paramId, value) {
    const element = this.paramElements.get(paramId);
    if (!element?.valueDisplay) return;

    // Format value for display
    let displayValue = value;
    if (typeof value === 'number') {
      displayValue = value.toFixed(2);
    }

    element.valueDisplay.textContent = displayValue;
  }

  /**
   * Mark parameter as changed
   * @param {string} paramId - Parameter ID
   */
  markParameterChanged(paramId) {
    const element = this.paramElements.get(paramId);
    if (element?.controlGroup) {
      element.controlGroup.classList.remove('sent');
      element.controlGroup.classList.add('changed');
    }

    // Update app state
    this.appState.markParameterChanged(paramId);
  }

  /**
   * Mark parameter as sent
   * @param {string} paramId - Parameter ID
   */
  markParameterSent(paramId) {
    const element = this.paramElements.get(paramId);
    if (element?.controlGroup) {
      element.controlGroup.classList.remove('changed');
      element.controlGroup.classList.add('sent');
    }
  }

  /**
   * Debounce parameter change notifications
   * @param {string} paramId - Parameter ID
   * @param {number|string} value - Parameter value
   * @private
   */
  debounceParameterChange(paramId, value) {
    // Clear existing timeout
    if (this.changeTimeouts.has(paramId)) {
      clearTimeout(this.changeTimeouts.get(paramId));
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      this.eventBus.emit('parameter:inputComplete', {
        paramId,
        value,
        timestamp: Date.now()
      });
      this.changeTimeouts.delete(paramId);
    }, this.changeDebounceTime);

    this.changeTimeouts.set(paramId, timeout);
  }

  /**
   * Update parameter values from program data
   * @param {Object} program - Program data
   */
  updateParameterValues(program) {
    Config.PARAM_IDS.forEach(paramId => {
      if (program[paramId] !== undefined) {
        this.setParameterValue(paramId, program[paramId]);
      }
    });
  }

  /**
   * Set parameter value programmatically
   * @param {string} paramId - Parameter ID
   * @param {number|string} value - New value
   */
  setParameterValue(paramId, value) {
    const element = this.paramElements.get(paramId);
    if (!element?.input) return;

    element.input.value = value;
    this.updateDisplayValue(paramId, value);

    // Trigger input event to notify other systems
    element.input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Get parameter value
   * @param {string} paramId - Parameter ID
   * @returns {number|string|null} Parameter value
   */
  getParameterValue(paramId) {
    const element = this.paramElements.get(paramId);
    if (!element?.input) return null;

    return this.parseParameterValue(element, element.input.value);
  }

  /**
   * Get all parameter values
   * @returns {Object} Object with all parameter values
   */
  getAllParameterValues() {
    const values = {};
    this.paramElements.forEach((element, paramId) => {
      if (element.input) {
        values[paramId] = this.parseParameterValue(element, element.input.value);
      }
    });
    return values;
  }

  /**
   * Update harmonic selection display
   * @param {Object} harmonicSelections - Harmonic selections object
   * @private
   */
  updateHarmonicSelectionDisplay(harmonicSelections) {
    Object.entries(harmonicSelections).forEach(([selectorKey, selection]) => {
      const [expression, type] = selectorKey.split('-');
      this.updateHarmonicButtonStates(expression, type);
    });
  }

  /**
   * Update harmonic button states
   * @param {string} expression - Expression type
   * @param {string} type - 'numerator' or 'denominator'
   * @private
   */
  updateHarmonicButtonStates(expression, type) {
    const selectorKey = `${expression}-${type}`;
    const selection = this.appState.get('harmonicSelections')[selectorKey];

    if (!selection) return;

    const selector = document.querySelector(`.harmonic-selector[data-expression="${expression}"]`);
    if (!selector) return;

    const buttons = selector.querySelectorAll(`.harmonic-button[data-type="${type}"]`);
    buttons.forEach(button => {
      const value = parseInt(button.dataset.value);
      button.classList.toggle('selected', selection.has(value));
    });
  }

  /**
   * Update expression selection
   * @param {string} expression - Selected expression
   * @private
   */
  updateExpressionSelection(expression) {
    const radio = document.querySelector(`input[name="expression"][value="${expression}"]`);
    if (radio) {
      radio.checked = true;
    }

    this.updateExpressionGroupVisibility(expression);
  }

  /**
   * Update expression group visibility
   * @param {string} activeExpression - Currently active expression
   * @private
   */
  updateExpressionGroupVisibility(activeExpression) {
    const expressionGroups = document.querySelectorAll('.expression-group');

    expressionGroups.forEach(group => {
      const groupExpression = group.classList.contains('vibrato') ? 'vibrato' :
                             group.classList.contains('trill') ? 'trill' :
                             group.classList.contains('tremolo') ? 'tremolo' : null;

      if (groupExpression) {
        group.classList.toggle('active', groupExpression === activeExpression);
        group.style.display = groupExpression === activeExpression ? 'block' : 'none';
      }
    });
  }

  /**
   * Mark all parameters as sent
   */
  markAllParametersSent() {
    this.paramElements.forEach((element, paramId) => {
      this.markParameterSent(paramId);
    });

    // Clear the changed parameters set in app state
    this.appState.clearParameterChanges();
  }

  /**
   * Reset all parameters to default values
   */
  resetToDefaults() {
    this.updateParameterValues(Config.DEFAULT_PROGRAM);

    // Reset expressions
    this.appState.set('selectedExpression', 'none');

    // Reset harmonic selections
    const defaultHarmonics = {};
    Object.keys(Config.HARMONIC_SELECTORS).forEach(key => {
      defaultHarmonics[key] = new Set([1]);
    });
    this.appState.set('harmonicSelections', defaultHarmonics);

    if (window.Logger) {
      window.Logger.log('Parameters reset to defaults', 'parameters');
    }
  }

  /**
   * Add event listener for parameter events
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    return this.eventBus.on(`parameter:${event}`, handler);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  off(event, handler) {
    this.eventBus.off(`parameter:${event}`, handler);
  }

  /**
   * Cleanup and destroy
   */
  destroy() {
    // Clear all timeouts
    this.changeTimeouts.forEach(timeout => clearTimeout(timeout));
    this.changeTimeouts.clear();

    this.isInitialized = false;

    if (window.Logger) {
      window.Logger.log('ParameterControls destroyed', 'lifecycle');
    }
  }
}

// Create global instance
export const parameterControls = new ParameterControls();

// Make available globally for backward compatibility
if (typeof window !== 'undefined') {
  window.ParameterControls = ParameterControls;
  window.parameterControls = parameterControls;
}
