/**
 * ParameterControls Module for String Assembly FM
 * Handles all parameter input controls (sliders, checkboxes, etc.)
 */

import { eventBus } from "../core/EventBus.js";
import { appState } from "../state/AppState.js";
import { Config } from "../core/Config.js";

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
        window.Logger.log("ParameterControls already initialized", "lifecycle");
      }
      return;
    }

    if (window.Logger) {
      window.Logger.log("Initializing ParameterControls...", "lifecycle");
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
      window.Logger.log("ParameterControls initialized", "lifecycle");
    }
  }

  /**
   * Cache parameter elements
   * @private
   */
  cacheParameterElements() {
    Config.PARAM_IDS.forEach((paramId) => {
      const input = document.getElementById(paramId);
      const valueDisplay =
        document.getElementById(`${paramId}Value`) ||
        document.getElementById(`${paramId}_value`);
      const controlGroup = input?.closest(".control-group");

      if (input) {
        this.paramElements.set(paramId, {
          input,
          valueDisplay,
          controlGroup,
          type: input.type,
          min: parseFloat(input.min) || 0,
          max: parseFloat(input.max) || 1,
          step: parseFloat(input.step) || 0.01,
        });
        if (window.Logger && paramId.includes("transition")) {
          window.Logger.log(
            `Cached transition parameter: ${paramId} = ${input.value}`,
            "debug",
          );
        }
      } else if (window.Logger) {
        window.Logger.log(`Parameter element not found: ${paramId}`, "error");
      }
    });

    if (window.Logger) {
      window.Logger.log(
        `Cached ${this.paramElements.size} parameter elements`,
        "parameters",
      );
      const transitionParams = Array.from(this.paramElements.keys()).filter(
        (id) => id.includes("transition"),
      );
      window.Logger.log(
        `Transition parameters cached: ${transitionParams.join(", ")}`,
        "debug",
      );
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
      element.input.addEventListener("input", (e) => {
        this.handleParameterInput(paramId, e);
      });

      // Change event for committed changes
      element.input.addEventListener("change", (e) => {
        this.handleParameterChange(paramId, e);
      });

      // Focus events for visual feedback
      element.input.addEventListener("focus", () => {
        this.handleParameterFocus(paramId);
      });

      element.input.addEventListener("blur", () => {
        this.handleParameterBlur(paramId);
      });
    });
  }

  /**
   * Set up expression radio button controls
   * @private
   */
  setupExpressionControls() {
    const expressionRadios = document.querySelectorAll(
      'input[name="expression"]',
    );

    expressionRadios.forEach((radio) => {
      radio.addEventListener("change", (e) => {
        if (e.target.checked) {
          this.handleExpressionChange(e.target.value);
        }
      });
    });

    if (window.Logger) {
      window.Logger.log(
        `Set up ${expressionRadios.length} expression controls`,
        "parameters",
      );
    }
  }

  /**
   * Set up harmonic ratio selector controls
   * @private
   */
  setupHarmonicRatioSelectors() {
    const harmonicSelectors = document.querySelectorAll(".harmonic-selector");

    harmonicSelectors.forEach((selector) => {
      const expression = selector.dataset.expression;
      if (!expression) return;

      const buttons = selector.querySelectorAll(".harmonic-button");
      buttons.forEach((button) => {
        button.addEventListener("click", (e) => {
          this.handleHarmonicRatioClick(expression, button, e);
        });
        button.addEventListener("mousedown", (e) => {
          this.handleHarmonicMouseDown(expression, button, e);
        });
        button.addEventListener("mouseenter", (e) => {
          this.handleHarmonicMouseEnter(expression, button, e);
        });
      });
    });

    // Global mouse up handler for drag
    document.addEventListener("mouseup", () => {
      this.endHarmonicDrag();
    });

    if (window.Logger) {
      window.Logger.log(
        `Set up ${harmonicSelectors.length} harmonic ratio selectors`,
        "parameters",
      );
    }
  }

  /**
   * Set up state subscriptions
   * @private
   */
  setupStateSubscriptions() {
    // Subscribe to harmonic selections changes
    this.appState.subscribe("harmonicSelections", (newSelections) => {
      this.updateHarmonicSelectionDisplay(newSelections);
    });

    // Subscribe to selected expression changes
    this.appState.subscribe("selectedExpression", (newExpression) => {
      this.updateExpressionSelection(newExpression);
    });

    // Subscribe to current program changes
    this.appState.subscribe("currentProgram", (newProgram) => {
      if (newProgram) {
        this.updateParameterValues(newProgram);
      }
    });

    // Subscribe to expression assignments to update parameter visibility
    this.appState.subscribe("expressions", (expressions) => {
      this.updateExpressionParameterVisibility(expressions || {});
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
      window.Logger.log(`Parameter input: ${paramId} = ${value}`, "parameters");
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
    this.eventBus.emit("parameter:changed", {
      paramId,
      value,
      timestamp: Date.now(),
    });

    // Update current program in app state
    const currentProgram = this.appState.get("currentProgram") || {};
    currentProgram[paramId] = value;
    this.appState.set("currentProgram", currentProgram);

    if (window.Logger) {
      window.Logger.log(
        `Parameter changed: ${paramId} = ${value}`,
        "parameters",
      );
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
      element.controlGroup.classList.add("focused");
    }

    this.eventBus.emit("parameter:focused", {
      paramId,
      timestamp: Date.now(),
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
      element.controlGroup.classList.remove("focused");
    }

    this.eventBus.emit("parameter:blurred", {
      paramId,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle expression change
   * @param {string} expression - Selected expression type
   * @private
   */
  handleExpressionChange(expression) {
    this.appState.set("selectedExpression", expression);

    // Don't show/hide expression groups here - let updateExpressionParameterVisibility handle it based on actual assignments

    this.eventBus.emit("expression:changed", {
      expression,
      timestamp: Date.now(),
    });

    if (window.Logger) {
      window.Logger.log(`Expression changed: ${expression}`, "expressions");
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
    // Skip if this was part of a drag operation
    if (this.isDragging) return;

    const value = parseInt(button.dataset.value);
    const type = button.dataset.type; // 'numerator' or 'denominator'
    const selectorKey = `${expression}-${type}`;

    const harmonicSelections = this.appState.get("harmonicSelections");
    const currentSelection = harmonicSelections[selectorKey];

    if (!currentSelection) return;

    // Handle different click types
    if (event.ctrlKey || event.metaKey) {
      // Ctrl+click: clear and select only this value (single selection)
      currentSelection.clear();
      currentSelection.add(value);
    } else if (event.shiftKey) {
      // Shift+click: range selection (if previous selection exists)
      // For simplicity, just add to selection
      currentSelection.add(value);
    } else {
      // Normal click: toggle selection (multi-select default)
      if (currentSelection.has(value)) {
        currentSelection.delete(value);
        // Ensure at least one value is selected
        if (currentSelection.size === 0) {
          currentSelection.add(1);
        }
      } else {
        currentSelection.add(value);
      }
    }

    // Update state
    this.appState.set("harmonicSelections", harmonicSelections);

    // Update button visual state
    this.updateHarmonicButtonStates(expression, type);

    // Mark parameter as changed
    this.markParameterChanged("harmonicRatios");

    if (window.Logger) {
      window.Logger.log(
        `Harmonic ratio changed: ${selectorKey} = [${Array.from(currentSelection).join(", ")}]`,
        "expressions",
      );
    }
  }

  /**
   * Handle mouse down for drag selection
   * @param {string} expression - Expression type
   * @param {Element} button - Button element
   * @param {Event} event - Mouse event
   * @private
   */
  handleHarmonicMouseDown(expression, button, event) {
    event.preventDefault();

    const value = parseInt(button.dataset.value);
    const type = button.dataset.type;

    this.isDragging = true;
    this.dragStart = { expression, type, value };
    this.dragCurrent = value;

    // Determine if we're selecting or deselecting based on current state
    const selectorKey = `${expression}-${type}`;
    const harmonicSelections = this.appState.get("harmonicSelections");
    const currentSelection = harmonicSelections[selectorKey];

    this.dragMode = currentSelection.has(value) ? "deselect" : "select";
  }

  /**
   * Handle mouse enter during drag
   * @param {string} expression - Expression type
   * @param {Element} button - Button element
   * @param {Event} event - Mouse event
   * @private
   */
  handleHarmonicMouseEnter(expression, button, event) {
    if (!this.isDragging || !this.dragStart) return;

    const value = parseInt(button.dataset.value);
    const type = button.dataset.type;

    // Only handle drag within the same expression and type
    if (
      expression !== this.dragStart.expression ||
      type !== this.dragStart.type
    )
      return;

    this.dragCurrent = value;
    this.updateDragSelection();
  }

  /**
   * Update selection during drag
   * @private
   */
  updateDragSelection() {
    if (!this.isDragging || !this.dragStart) return;

    const { expression, type, value: startValue } = this.dragStart;
    const endValue = this.dragCurrent;
    const selectorKey = `${expression}-${type}`;

    const harmonicSelections = this.appState.get("harmonicSelections");
    const currentSelection = harmonicSelections[selectorKey];

    // Create range
    const min = Math.min(startValue, endValue);
    const max = Math.max(startValue, endValue);

    // Apply drag mode to range
    for (let i = min; i <= max; i++) {
      if (this.dragMode === "select") {
        currentSelection.add(i);
      } else {
        currentSelection.delete(i);
      }
    }

    // Ensure at least one value is selected
    if (currentSelection.size === 0) {
      currentSelection.add(1);
    }

    // Update state and UI
    this.appState.set("harmonicSelections", harmonicSelections);
    this.updateHarmonicButtonStates(expression, type);
    this.markParameterChanged("harmonicRatios");
  }

  /**
   * End drag selection
   * @private
   */
  endHarmonicDrag() {
    if (this.isDragging) {
      this.isDragging = false;
      this.dragStart = null;
      this.dragCurrent = null;
      this.dragMode = null;
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
    if (element.type === "range" || element.type === "number") {
      const numValue = parseFloat(rawValue);

      // Special handling for transitionDuration with logarithmic scaling
      if (element.input && element.input.id === "transitionDuration") {
        // Convert 0-100 slider to 0-40s logarithmic scale
        if (numValue === 0) return 0;
        // Map 1-100 to 0.1-40s logarithmically
        const minLog = Math.log(0.1);
        const maxLog = Math.log(40);
        const scale = (maxLog - minLog) / 99; // 99 steps from 1 to 100
        return Math.exp(minLog + (numValue - 1) * scale);
      }

      // Special handling for transitionStagger (0 = no stagger, 100 = max stagger)
      if (element.input && element.input.id === "transitionStagger") {
        // Convert 0-100 slider to stagger amount (0 = no stagger, 1 = full stagger)
        return numValue / 100;
      }

      // Special handling for transitionDurationSpread (0 = no variation, 100 = max variation)
      if (element.input && element.input.id === "transitionDurationSpread") {
        // Convert 0-100 slider to duration spread amount (0 = no spread, 1 = full 0.5x-2x range)
        return numValue / 100;
      }

      return numValue;
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
    if (typeof value === "number") {
      // Special formatting for transitionDuration
      if (paramId === "transitionDuration") {
        if (value === 0) {
          displayValue = "0s";
        } else if (value < 1) {
          displayValue = value.toFixed(2) + "s";
        } else if (value < 10) {
          displayValue = value.toFixed(1) + "s";
        } else {
          displayValue = value.toFixed(0) + "s";
        }
      } else if (paramId === "transitionStagger") {
        // Format as percentage (e.g., "0%", "25%", "100%")
        displayValue = Math.round(value * 100) + "%";
      } else if (paramId === "transitionDurationSpread") {
        // Format as percentage (e.g., "0%", "25%", "100%")
        displayValue = Math.round(value * 100) + "%";
      } else {
        displayValue = value.toFixed(2);
      }
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
      element.controlGroup.classList.remove("sent");
      element.controlGroup.classList.add("changed");
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
      element.controlGroup.classList.remove("changed");
      element.controlGroup.classList.add("sent");
    }
  }

  /**
   * Update visual state of harmonic buttons
   * @param {string} expression - Expression type
   * @param {string} type - Numerator or denominator
   * @private
   */
  updateHarmonicButtonStates(expression, type) {
    const selector = document.querySelector(
      `[data-expression="${expression}"]`,
    );
    if (!selector) return;

    const row = selector.querySelector(`[data-type="${type}"]`);
    if (!row) return;

    const buttons = row.querySelectorAll(".harmonic-button");
    const selectorKey = `${expression}-${type}`;
    const harmonicSelections = this.appState.get("harmonicSelections");
    const currentSelection = harmonicSelections[selectorKey];

    buttons.forEach((button) => {
      const value = parseInt(button.dataset.value);
      button.classList.toggle("selected", currentSelection.has(value));
    });
  }

  /**
   * Mark parameter as changed
   * @param {string} paramId - Parameter ID
   * @private
   */
  markParameterChanged(paramId) {
    // Find all harmonic selector control groups
    if (paramId === "harmonicRatios") {
      const selectors = document.querySelectorAll(".harmonic-selector");
      selectors.forEach((selector) => {
        const group = selector.closest(".control-group");
        if (group) {
          group.classList.remove("sent");
          group.classList.add("changed");
        }
      });
      return;
    }

    // Handle regular parameters
    const element = this.paramElements.get(paramId);
    if (element?.controlGroup) {
      element.controlGroup.classList.remove("sent");
      element.controlGroup.classList.add("changed");
    }

    // Update app state
    this.appState.markParameterChanged(paramId);
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
      this.eventBus.emit("parameter:inputComplete", {
        paramId,
        value,
        timestamp: Date.now(),
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
    Config.PARAM_IDS.forEach((paramId) => {
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

    // Special handling for logarithmic parameters with reverse conversion
    let sliderValue = value;
    if (paramId === "transitionDuration") {
      if (value === 0) {
        sliderValue = 0;
      } else {
        // Convert actual duration (0.1-40s) back to slider position (1-100)
        const minLog = Math.log(0.1);
        const maxLog = Math.log(40);
        const scale = (maxLog - minLog) / 99;
        sliderValue = Math.round(
          (Math.log(Math.max(0.1, value)) - minLog) / scale + 1,
        );
        sliderValue = Math.max(1, Math.min(100, sliderValue));
      }
    } else if (paramId === "transitionStagger") {
      // Convert stagger amount (0-1) back to slider position (0-100)
      sliderValue = Math.round(value * 100);
      sliderValue = Math.max(0, Math.min(100, sliderValue));
    } else if (paramId === "transitionDurationSpread") {
      // Convert duration spread amount (0-1) back to slider position (0-100)
      sliderValue = Math.round(value * 100);
      sliderValue = Math.max(0, Math.min(100, sliderValue));
    }

    element.input.value = sliderValue;
    this.updateDisplayValue(paramId, value);

    // Trigger input event to notify other systems
    element.input.dispatchEvent(new Event("input", { bubbles: true }));
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
        values[paramId] = this.parseParameterValue(
          element,
          element.input.value,
        );
      }
    });

    // Debug log transition parameters specifically
    if (window.Logger) {
      const transitionValues = {};
      [
        "transitionDuration",
        "transitionSpread",
        "transitionStagger",
        "transitionVariance",
      ].forEach((param) => {
        if (values[param] !== undefined) {
          transitionValues[param] = values[param];
        }
      });
      if (Object.keys(transitionValues).length > 0) {
        window.Logger.log(
          `Transition parameters collected: ${JSON.stringify(transitionValues)}`,
          "debug",
        );
      }
    }

    return values;
  }

  /**
   * Update harmonic selection display
   * @param {Object} harmonicSelections - Harmonic selections object
   * @private
   */
  updateHarmonicSelectionDisplay(harmonicSelections) {
    Object.entries(harmonicSelections).forEach(([selectorKey, selection]) => {
      const [expression, type] = selectorKey.split("-");
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
    const selection = this.appState.get("harmonicSelections")[selectorKey];

    if (!selection) return;

    const selector = document.querySelector(
      `.harmonic-selector[data-expression="${expression}"]`,
    );
    if (!selector) return;

    const buttons = selector.querySelectorAll(
      `.harmonic-button[data-type="${type}"]`,
    );
    buttons.forEach((button) => {
      const value = parseInt(button.dataset.value);
      button.classList.toggle("selected", selection.has(value));
    });
  }

  /**
   * Update expression selection
   * @param {string} expression - Selected expression
   * @private
   */
  updateExpressionSelection(expression) {
    const radio = document.querySelector(
      `input[name="expression"][value="${expression}"]`,
    );
    if (radio) {
      radio.checked = true;
    }

    // Don't call updateExpressionGroupVisibility here - let updateExpressionParameterVisibility handle it
  }

  // Removed updateExpressionGroupVisibility - replaced by updateExpressionParameterVisibility
  // which properly handles multiple expression types simultaneously

  /**
   * Update expression parameter visibility based on assigned expressions
   * @param {Object} expressions - Map of note names to expression objects
   * @private
   */
  updateExpressionParameterVisibility(expressions) {
    const expressionGroups = document.querySelectorAll(".expression-group");
    const usedExpressionTypes = new Set();

    if (window.Logger) {
      window.Logger.log(
        `[DEBUG] Raw expressions object: ${JSON.stringify(expressions)}`,
        "parameters",
      );
    }

    // Collect all expression types currently in use
    Object.entries(expressions).forEach(([note, expression]) => {
      if (window.Logger) {
        window.Logger.log(
          `[DEBUG] Processing note ${note}: ${JSON.stringify(expression)}`,
          "parameters",
        );
      }
      if (expression && expression.type && expression.type !== "none") {
        usedExpressionTypes.add(expression.type);
        if (window.Logger) {
          window.Logger.log(
            `[DEBUG] Added expression type: ${expression.type}`,
            "parameters",
          );
        }
      }
    });

    if (window.Logger) {
      window.Logger.log(
        `[DEBUG] Final used expression types: ${Array.from(usedExpressionTypes).join(", ")}`,
        "parameters",
      );
      window.Logger.log(
        `[DEBUG] Found ${expressionGroups.length} expression groups`,
        "parameters",
      );
    }

    // Show/hide expression parameter groups based on usage
    expressionGroups.forEach((group) => {
      const groupExpression = group.classList.contains("vibrato")
        ? "vibrato"
        : group.classList.contains("trill")
          ? "trill"
          : group.classList.contains("tremolo")
            ? "tremolo"
            : null;

      if (window.Logger) {
        window.Logger.log(
          `Group classes: ${Array.from(group.classList).join(", ")}, detected: ${groupExpression}`,
          "parameters",
        );
      }

      if (groupExpression) {
        const shouldShow = usedExpressionTypes.has(groupExpression);
        // Use CSS classes instead of direct style manipulation
        if (shouldShow) {
          group.classList.add("active");
        } else {
          group.classList.remove("active");
        }

        if (window.Logger) {
          // Get computed style to debug display issues
          const computedStyle = window.getComputedStyle(group);
          const isActuallyVisible = computedStyle.display !== "none";

          window.Logger.log(
            `${groupExpression} group: shouldShow=${shouldShow}, active=${group.classList.contains("active")}, computedDisplay=${computedStyle.display}, actuallyVisible=${isActuallyVisible}`,
            "parameters",
          );

          // Check if something is blocking visibility
          if (shouldShow && !isActuallyVisible) {
            window.Logger.log(
              `WARNING: ${groupExpression} should be visible but is not! Classes: ${Array.from(group.classList).join(", ")}`,
              "parameters",
            );
          }
        }
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
    this.appState.set("selectedExpression", "none");

    // Reset harmonic selections
    const defaultHarmonics = {};
    Object.keys(Config.HARMONIC_SELECTORS).forEach((key) => {
      defaultHarmonics[key] = new Set([1]);
    });
    this.appState.set("harmonicSelections", defaultHarmonics);

    if (window.Logger) {
      window.Logger.log("Parameters reset to defaults", "parameters");
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
    this.changeTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.changeTimeouts.clear();

    this.isInitialized = false;

    if (window.Logger) {
      window.Logger.log("ParameterControls destroyed", "lifecycle");
    }
  }
}

// Create global instance
export const parameterControls = new ParameterControls();

// Make available globally for backward compatibility
if (typeof window !== "undefined") {
  window.ParameterControls = ParameterControls;
  window.parameterControls = parameterControls;
}
