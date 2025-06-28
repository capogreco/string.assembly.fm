/**
 * HarmonicRatioSelector - Reusable component for harmonic ratio selection
 * Handles multi-select with drag support for numerator/denominator ratios
 */
class HarmonicRatioSelector {
  constructor(container, expression, appState, eventBus = null) {
    this.container = container;
    this.expression = expression;
    this.appState = appState;
    this.eventBus = eventBus || (globalThis.eventBus ? globalThis.eventBus : null);
    this.programState = globalThis.programState || null;

    // Drag state
    this.isDragging = false;
    this.dragStart = null;
    this.dragMode = null;

    this.render();
    this.setupEventListeners();
  }

  render() {
    this.container.innerHTML = `
      <div class="harmonic-selector" data-expression="${this.expression}">
        <div class="harmonic-row" data-type="numerator">
          ${this.renderButtons('numerator')}
        </div>
        <div class="harmonic-row" data-type="denominator">
          ${this.renderButtons('denominator')}
        </div>
      </div>
    `;
  }

  renderButtons(type) {
    const selectorKey = `${this.expression}-${type}`;
    const harmonicSelections = this.programState 
      ? this.programState.currentProgram.harmonicSelections 
      : this.appState.get('harmonicSelections');
    const currentSelection = harmonicSelections[selectorKey] 
      ? new Set(harmonicSelections[selectorKey]) 
      : new Set([1]);

    return Array.from({ length: 12 }, (_, i) => {
      const value = i + 1;
      const isSelected = currentSelection.has(value);

      return `
        <span
          class="harmonic-button ${isSelected ? 'selected' : ''}"
          data-value="${value}"
          data-type="${type}"
        >${value}</span>
      `;
    }).join('');
  }

  setupEventListeners() {
    const buttons = this.container.querySelectorAll('.harmonic-button');

    buttons.forEach(button => {
      button.addEventListener('click', (e) => this.handleClick(button, e));
      button.addEventListener('mousedown', (e) => this.handleMouseDown(button, e));
      button.addEventListener('mouseenter', (e) => this.handleMouseEnter(button, e));
    });

    // Global mouse up handler
    document.addEventListener('mouseup', () => this.endDrag());
    
    // Listen for bank load events to sync visual state
    if (this.eventBus) {
      this.eventBus.on('programState:bankLoaded', () => {
        // Sync visual state with programState after bank load
        this.syncWithProgramState();
      });
      
      // Also listen for harmonic selections changes
      this.eventBus.on('programState:harmonicSelectionsChanged', (data) => {
        // Sync when harmonic selections are applied to UI
        this.syncWithProgramState();
      });
    }
  }

  handleClick(button, event) {
    if (this.isDragging) return;

    const value = parseInt(button.dataset.value);
    const type = button.dataset.type;
    const selectorKey = `${this.expression}-${type}`;

    const harmonicSelections = this.appState.get('harmonicSelections');
    const currentSelection = harmonicSelections[selectorKey];

    if (!currentSelection) {
      console.error(`No harmonic selection found for ${selectorKey}`);
      return;
    }

    // Handle different click types
    if (event.ctrlKey || event.metaKey) {
      // Ctrl+click: single selection
      currentSelection.clear();
      currentSelection.add(value);
    } else {
      // Normal click: toggle selection
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

    this.updateState(harmonicSelections);
    this.updateVisualState(type);
  }

  handleMouseDown(button, event) {
    event.preventDefault();

    const value = parseInt(button.dataset.value);
    const type = button.dataset.type;
    const selectorKey = `${this.expression}-${type}`;

    const harmonicSelections = this.appState.get('harmonicSelections');
    const currentSelection = harmonicSelections[selectorKey];

    if (!currentSelection) return;

    this.isDragging = true;
    this.dragStart = { type, value };

    // Determine drag mode based on current state
    this.dragMode = currentSelection.has(value) ? 'deselect' : 'select';
  }

  handleMouseEnter(button, _event) {
    if (!this.isDragging || !this.dragStart) return;

    const value = parseInt(button.dataset.value);
    const type = button.dataset.type;

    // Only handle drag within the same type
    if (type !== this.dragStart.type) return;

    this.updateDragSelection(this.dragStart.value, value, type);
  }

  updateDragSelection(startValue, endValue, type) {
    const selectorKey = `${this.expression}-${type}`;
    const harmonicSelections = this.appState.get('harmonicSelections');
    const currentSelection = harmonicSelections[selectorKey];

    if (!currentSelection) return;

    // Create range
    const min = Math.min(startValue, endValue);
    const max = Math.max(startValue, endValue);

    // Apply drag mode to range
    for (let i = min; i <= max; i++) {
      if (this.dragMode === 'select') {
        currentSelection.add(i);
      } else {
        currentSelection.delete(i);
      }
    }

    // Ensure at least one value is selected
    if (currentSelection.size === 0) {
      currentSelection.add(1);
    }

    this.updateState(harmonicSelections);
    this.updateVisualState(type);
  }

  endDrag() {
    if (this.isDragging) {
      this.isDragging = false;
      this.dragStart = null;
      this.dragMode = null;
    }
  }

  updateState(harmonicSelections) {
    // Update ProgramState if available
    if (this.programState) {
      // Update each harmonic selection in ProgramState
      Object.entries(harmonicSelections).forEach(([key, valueSet]) => {
        this.programState.updateHarmonicSelection(key, Array.from(valueSet));
      });
    }
    
    // Update appState for compatibility
    this.appState.set('harmonicSelections', harmonicSelections);

    // Mark parameter as changed
    this.markParameterChanged();

    // Log the change
    const selectorKey = `${this.expression}-${this.dragStart?.type || 'unknown'}`;
    const currentSelection = harmonicSelections[selectorKey];

    if (globalThis.Logger && currentSelection) {
      globalThis.Logger.log(
        `Harmonic ratio changed: ${selectorKey} = [${Array.from(currentSelection).join(', ')}]`,
        'expressions'
      );
    }
    
    // Emit event for PartManager
    if (this.eventBus && currentSelection) {
      this.eventBus.emit('harmonicRatio:changed', {
        expression: this.expression,
        type: this.dragStart?.type || 'unknown',
        key: selectorKey,
        selection: Array.from(currentSelection)
      });
    }
  }

  updateVisualState(type) {
    const selectorKey = `${this.expression}-${type}`;
    const harmonicSelections = this.programState 
      ? this.programState.currentProgram.harmonicSelections 
      : this.appState.get('harmonicSelections');
    const currentSelection = harmonicSelections[selectorKey] 
      ? new Set(harmonicSelections[selectorKey]) 
      : null;

    if (!currentSelection) return;

    const row = this.container.querySelector(`[data-type="${type}"]`);
    if (!row) return;

    const buttons = row.querySelectorAll('.harmonic-button');
    buttons.forEach(button => {
      const value = parseInt(button.dataset.value);
      button.classList.toggle('selected', currentSelection.has(value));
    });
  }

  markParameterChanged() {
    // Find the control group and mark as changed
    const controlGroup = this.container.closest('.control-group');
    if (controlGroup) {
      controlGroup.classList.remove('sent');
      controlGroup.classList.add('changed');
    }

    // Update app state
    if (this.appState.markParameterChanged) {
      this.appState.markParameterChanged('harmonicRatios');
    }
    
    // Update sync status if programState is available
    if (this.programState) {
      this.programState.markChanged();
    }
  }

  // Public method to update selections programmatically
  setSelection(type, values) {
    const selectorKey = `${this.expression}-${type}`;
    const harmonicSelections = this.appState.get('harmonicSelections');

    if (harmonicSelections[selectorKey]) {
      harmonicSelections[selectorKey] = new Set(values);
      this.updateState(harmonicSelections);
      this.updateVisualState(type);
    }
  }

  // Public method to get current selections
  getSelection(type) {
    const selectorKey = `${this.expression}-${type}`;
    const harmonicSelections = this.appState.get('harmonicSelections');
    return harmonicSelections[selectorKey] ? Array.from(harmonicSelections[selectorKey]) : [1];
  }
  
  // Sync visual state with programState after bank load
  syncWithProgramState() {
    if (!this.programState) return;
    
    const harmonicSelections = this.programState.currentProgram.harmonicSelections;
    
    // Update both numerator and denominator
    ['numerator', 'denominator'].forEach(type => {
      const selectorKey = `${this.expression}-${type}`;
      const values = harmonicSelections[selectorKey] || [1];
      
      // Update internal state in appState to match programState
      const appHarmonicSelections = this.appState.get('harmonicSelections');
      if (appHarmonicSelections[selectorKey]) {
        appHarmonicSelections[selectorKey] = new Set(values);
      }
      
      // Update visual state
      this.updateVisualState(type);
    });
  }

  // Static method to create HRG components from existing HTML
  static replaceExistingSelectors(appState, eventBus = null) {
    const existingSelectors = document.querySelectorAll('.harmonic-selector');
    const components = [];
    
    // Try to get eventBus from window if not provided
    const eventBusInstance = eventBus || (globalThis.eventBus ? globalThis.eventBus : null);

    existingSelectors.forEach(selector => {
      const expression = selector.dataset.expression;
      if (!expression) return;

      // Get the container (should be the parent element)
      const container = selector.parentElement;

      // Clear existing content
      container.innerHTML = `<label>${expression.charAt(0).toUpperCase() + expression.slice(1)} Harmonic Ratios</label>`;

      // Create new container for the component
      const componentContainer = document.createElement('div');
      container.appendChild(componentContainer);

      // Create and store the component
      const component = new HarmonicRatioSelector(componentContainer, expression, appState, eventBusInstance);
      components.push(component);
    });

    return components;
  }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HarmonicRatioSelector;
} else if (typeof window !== 'undefined') {
  globalThis.HarmonicRatioSelector = HarmonicRatioSelector;
}
