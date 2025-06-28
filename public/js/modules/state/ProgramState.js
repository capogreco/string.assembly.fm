/**
 * ProgramState Module for String Assembly FM
 * Single source of truth for all program data
 */

import { Config } from '../core/Config.js';
import { Logger } from '../core/Logger.js';
import { eventBus } from '../core/EventBus.js';

/**
 * Represents a complete program state
 */
class Program {
  constructor() {
    // Core synthesis parameters
    this.parameters = {};
    
    // Musical state
    this.chord = {
      frequencies: [],
      expressions: {} // noteName -> expression data
    };
    
    // Harmonic selections for expressions (default to [1])
    this.harmonicSelections = {
      'vibrato-numerator': [1],
      'vibrato-denominator': [1],
      'trill-numerator': [1],
      'trill-denominator': [1],
      'tremolo-numerator': [1],
      'tremolo-denominator': [1]
    };
    
    // UI state
    this.selectedExpression = 'none';
    this.powerOn = true;
    
    // Metadata
    this.metadata = {
      version: '2.0',
      timestamp: Date.now(),
      name: ''
    };
  }
  
  /**
   * Create a deep copy of this program
   */
  clone() {
    const copy = new Program();
    copy.parameters = { ...this.parameters };
    copy.chord = {
      frequencies: [...this.chord.frequencies],
      expressions: { ...this.chord.expressions }
    };
    copy.harmonicSelections = {};
    for (const key in this.harmonicSelections) {
      copy.harmonicSelections[key] = [...this.harmonicSelections[key]];
    }
    copy.selectedExpression = this.selectedExpression;
    copy.powerOn = this.powerOn;
    copy.metadata = { ...this.metadata };
    return copy;
  }
}

/**
 * Manages the current program state and synchronization
 */
export class ProgramState {
  constructor() {
    // Current UI state (what user sees/edits)
    this.currentProgram = new Program();
    
    // Active program (what's running on synths)
    this.activeProgram = null;
    
    // Saved banks
    this.banks = new Map();
    
    // Storage key for localStorage
    this.storageKey = Config.STORAGE_KEYS?.BANKS || 'stringfm_banks';
    
    // Track if we're in the middle of an update
    this.isUpdating = false;
  }
  
  /**
   * Initialize the program state
   */
  initialize() {
    Logger.log('Initializing ProgramState...', 'lifecycle');
    
    // Load banks from storage
    this.loadBanksFromStorage();
    
    // Initialize current program with defaults
    this.initializeDefaults();
    
    // Capture initial UI state
    this.captureFromUI();
    
    Logger.log('ProgramState initialized', 'lifecycle');
  }
  
  /**
   * Initialize default parameter values
   */
  initializeDefaults() {
    // Set default parameter values from Config
    Config.PARAM_IDS.forEach(paramId => {
      this.currentProgram.parameters[paramId] = Config.DEFAULT_PROGRAM?.[paramId] ?? 0.5;
    });
    
    // Log what defaults are being set
    Logger.log(`Initialized defaults for parameters: ${Object.keys(this.currentProgram.parameters).join(', ')}`, 'lifecycle');
  }
  
  /**
   * Capture current state from UI
   */
  captureFromUI() {
    if (this.isUpdating) return;
    
    try {
      this.isUpdating = true;
      
      // Capture parameter values
      Config.PARAM_IDS.forEach(paramId => {
        const element = document.getElementById(paramId);
        if (element) {
          const value = element.type === 'range' 
            ? parseFloat(element.value) 
            : element.value;
          this.currentProgram.parameters[paramId] = value;
        }
      });
      
      // Capture power state
      const powerCheckbox = document.getElementById('power');
      if (powerCheckbox) {
        this.currentProgram.powerOn = powerCheckbox.checked;
      }
      
      // Capture selected expression
      const selectedExpr = document.querySelector('input[name="expression"]:checked');
      if (selectedExpr) {
        this.currentProgram.selectedExpression = selectedExpr.value;
      }
      
      // Note: Chord and expressions are managed separately through events
      
      Logger.log('Captured program state from UI', 'lifecycle');
    } finally {
      this.isUpdating = false;
    }
  }
  
  /**
   * Apply program state to UI
   */
  applyToUI(program = this.currentProgram) {
    if (this.isUpdating) return;
    
    try {
      this.isUpdating = true;
      
      // Apply parameter values
      Object.entries(program.parameters).forEach(([paramId, value]) => {
        const element = document.getElementById(paramId);
        if (element) {
          element.value = value;
          
          // Update display value
          const displayElement = document.getElementById(`${paramId}_value`);
          if (displayElement) {
            displayElement.textContent = value;
          }
          
          // Trigger input event
          element.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      
      // Apply power state
      const powerCheckbox = document.getElementById('power');
      if (powerCheckbox) {
        powerCheckbox.checked = program.powerOn;
      }
      
      // Apply selected expression
      const exprRadio = document.querySelector(`input[name="expression"][value="${program.selectedExpression}"]`);
      if (exprRadio) {
        exprRadio.checked = true;
      }
      
      // Apply harmonic selections
      this.applyHarmonicSelectionsToUI(program.harmonicSelections);
      
      // Emit events for chord and expressions
      eventBus.emit('programState:chordChanged', {
        frequencies: program.chord.frequencies,
        expressions: program.chord.expressions
      });
      
      Logger.log('Applied program state to UI', 'lifecycle');
    } finally {
      this.isUpdating = false;
    }
  }
  
  /**
   * Apply harmonic selections to UI
   */
  applyHarmonicSelectionsToUI(selections) {
    Logger.log(`Applying harmonic selections to UI: ${JSON.stringify(selections)}`, 'lifecycle');
    
    // Emit event for HarmonicRatioSelector components to sync
    eventBus.emit('programState:harmonicSelectionsChanged', {
      selections: selections
    });
    
    // Still do direct DOM manipulation as fallback for now
    Object.entries(selections).forEach(([key, values]) => {
      const [expression, type] = key.split('-');
      
      // Find buttons within the correct harmonic-selector and harmonic-row
      const buttons = document.querySelectorAll(
        `.harmonic-selector[data-expression="${expression}"] .harmonic-row[data-type="${type}"] .harmonic-button`
      );
      
      Logger.log(`Found ${buttons.length} buttons for ${expression}-${type}`, 'lifecycle');
      
      buttons.forEach(button => {
        const value = parseInt(button.dataset.value);
        if (values.includes(value)) {
          button.classList.add('selected');
        } else {
          button.classList.remove('selected');
        }
      });
    });
  }
  
  /**
   * Update chord in current program
   */
  updateChord(frequencies, expressions = null) {
    this.currentProgram.chord.frequencies = [...frequencies];
    
    if (expressions) {
      this.currentProgram.chord.expressions = { ...expressions };
    }
    
    // Mark as changed
    this.markChanged();
  }
  
  /**
   * Update expression for a note
   */
  updateNoteExpression(noteName, expression) {
    if (expression && expression.type !== 'none') {
      this.currentProgram.chord.expressions[noteName] = expression;
    } else {
      delete this.currentProgram.chord.expressions[noteName];
    }
    
    this.markChanged();
  }
  
  /**
   * Update harmonic selection
   */
  updateHarmonicSelection(key, values) {
    this.currentProgram.harmonicSelections[key] = [...values];
    this.markChanged();
  }
  
  /**
   * Mark current program as changed (different from active)
   */
  markChanged() {
    eventBus.emit('programState:changed', {
      hasChanges: !this.isInSync()
    });
  }
  
  /**
   * Check if current program matches active program
   */
  isInSync() {
    if (!this.activeProgram) return false;
    
    // Compare parameters
    for (const paramId in this.currentProgram.parameters) {
      if (this.currentProgram.parameters[paramId] !== this.activeProgram.parameters[paramId]) {
        return false;
      }
    }
    
    // Compare chord frequencies
    if (this.currentProgram.chord.frequencies.length !== this.activeProgram.chord.frequencies.length) {
      return false;
    }
    
    for (let i = 0; i < this.currentProgram.chord.frequencies.length; i++) {
      if (this.currentProgram.chord.frequencies[i] !== this.activeProgram.chord.frequencies[i]) {
        return false;
      }
    }
    
    // Compare expressions
    const currentExpressions = Object.keys(this.currentProgram.chord.expressions);
    const activeExpressions = Object.keys(this.activeProgram.chord.expressions);
    
    if (currentExpressions.length !== activeExpressions.length) {
      return false;
    }
    
    for (const noteName of currentExpressions) {
      const currentExpr = this.currentProgram.chord.expressions[noteName];
      const activeExpr = this.activeProgram.chord.expressions[noteName];
      
      if (!activeExpr || currentExpr.type !== activeExpr.type) {
        return false;
      }
      
      // Compare expression parameters based on type
      if (currentExpr.type === 'vibrato' && currentExpr.depth !== activeExpr.depth) {
        return false;
      }
      if (currentExpr.type === 'tremolo' && currentExpr.articulation !== activeExpr.articulation) {
        return false;
      }
      if (currentExpr.type === 'trill' && currentExpr.interval !== activeExpr.interval) {
        return false;
      }
    }
    
    // Compare other properties
    if (this.currentProgram.powerOn !== this.activeProgram.powerOn) {
      return false;
    }
    
    // Compare harmonic selections
    for (const key in this.currentProgram.harmonicSelections) {
      const currentSelection = this.currentProgram.harmonicSelections[key];
      const activeSelection = this.activeProgram.harmonicSelections[key];
      
      if (!activeSelection || currentSelection.length !== activeSelection.length) {
        return false;
      }
      
      for (let i = 0; i < currentSelection.length; i++) {
        if (currentSelection[i] !== activeSelection[i]) {
          return false;
        }
      }
    }
    
    return true;
  }
  
  /**
   * Set the active program (what's running on synths)
   */
  setActiveProgram(program = null) {
    this.activeProgram = program ? program.clone() : this.currentProgram.clone();
    this.activeProgram.metadata.timestamp = Date.now();
    
    // Debug log what we're setting as active
    if (this.activeProgram.parameters.trillEnabled) {
      Logger.log(`Set active program with trill: speed=${this.activeProgram.parameters.trillSpeed}`, 'lifecycle');
    }
    
    eventBus.emit('programState:synced', {
      program: this.activeProgram
    });
  }
  
  /**
   * Get data for sending to synths
   */
  getProgramForSynth() {
    // Capture current UI state first
    this.captureFromUI();
    
    return {
      ...this.currentProgram.parameters,
      powerOn: this.currentProgram.powerOn,
      // Note: Chord and expressions are sent separately by PartManager
    };
  }
  
  
  /**
   * Save current program to bank
   */
  saveToBank(bankId) {
    if (!this.activeProgram) {
      Logger.log('No active program to save', 'warning');
      return false;
    }
    
    const programToSave = this.activeProgram.clone();
    programToSave.metadata.timestamp = Date.now();
    programToSave.metadata.name = `Bank ${bankId}`;
    
    // Debug log what we're saving
    if (programToSave.parameters.trillEnabled) {
      Logger.log(`Saving to bank ${bankId} with trill: speed=${programToSave.parameters.trillSpeed}`, 'lifecycle');
    } else {
      Logger.log(`Saving to bank ${bankId} (no trill enabled)`, 'lifecycle');
    }
    
    this.banks.set(bankId, programToSave);
    this.saveBanksToStorage();
    
    eventBus.emit('programState:bankSaved', {
      bankId,
      program: programToSave
    });
    
    Logger.log(`Saved active program to bank ${bankId}`, 'lifecycle');
    return true;
  }
  
  /**
   * Load program from bank
   */
  loadFromBank(bankId) {
    const program = this.banks.get(bankId);
    if (!program) {
      Logger.log(`Bank ${bankId} is empty`, 'warning');
      return false;
    }
    
    // Set as current program
    this.currentProgram = program.clone();
    
    Logger.log(`Loading program from bank ${bankId} with harmonic selections: ${JSON.stringify(this.currentProgram.harmonicSelections)}`, 'lifecycle');
    
    // Apply to UI (transition parameters will be skipped)
    this.applyToUI();
    
    // Emit events for both new and old systems during migration
    eventBus.emit('programState:bankLoaded', {
      bankId,
      program: this.currentProgram
    });
    
    // Update PartManager's internal state (but don't send to synths)
    const partManager = window.modular?.partManager;
    if (partManager) {
      // Clear expressions first
      partManager.noteExpressions.clear();
      
      // Update expressions
      Object.entries(this.currentProgram.chord.expressions).forEach(([noteName, expression]) => {
        partManager.noteExpressions.set(noteName, expression);
      });
      
      // Use setChord to properly update chord and trigger redistribution
      partManager.setChord([...this.currentProgram.chord.frequencies]);
      
      Logger.log(`Updated PartManager state: ${this.currentProgram.chord.frequencies.length} notes`, 'lifecycle');
    }
    
    // Update PianoKeyboard's chord state directly first
    const pianoKeyboard = window.modular?.pianoKeyboard;
    if (pianoKeyboard) {
      // Clear and set the chord
      pianoKeyboard.currentChord.clear();
      this.currentProgram.chord.frequencies.forEach(freq => {
        pianoKeyboard.currentChord.add(freq);
      });
    }
    
    // Emit chord:changed event for piano keyboard with flag to indicate bank load
    eventBus.emit('chord:changed', {
      frequencies: this.currentProgram.chord.frequencies,
      noteNames: this.currentProgram.chord.frequencies.map(f => this.frequencyToNoteName(f)),
      fromBankLoad: true  // Flag to prevent automatic redistribution
    });
    
    // Restore expressions to PianoKeyboard - need slight delay to ensure chord is processed
    setTimeout(() => {
      if (pianoKeyboard && pianoKeyboard.expressionHandler) {
        Logger.log(`Restoring expressions to PianoKeyboard: ${JSON.stringify(this.currentProgram.chord.expressions)}`, 'lifecycle');
        pianoKeyboard.expressionHandler.restoreExpressions(this.currentProgram.chord.expressions);
      }
    }, 100); // Increased delay slightly
    
    Logger.log(`Loaded program from bank ${bankId}`, 'lifecycle');
    return true;
  }
  
  /**
   * Convert frequency to note name (helper method)
   */
  frequencyToNoteName(frequency) {
    const A4 = 440;
    const C0 = A4 * Math.pow(2, -4.75);
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    
    if (frequency <= 0) return "";
    
    const halfSteps = Math.round(12 * Math.log2(frequency / C0));
    const octave = Math.floor(halfSteps / 12);
    const noteIndex = halfSteps % 12;
    
    return `${noteNames[noteIndex]}${octave}`;
  }
  
  /**
   * Clear all banks
   */
  clearAllBanks() {
    this.banks.clear();
    this.saveBanksToStorage();
    
    eventBus.emit('programState:banksCleared');
    Logger.log('All banks cleared', 'lifecycle');
  }
  
  /**
   * Get saved banks info
   */
  getSavedBanks() {
    const banks = [];
    for (let i = 1; i <= 10; i++) {
      const program = this.banks.get(i);
      banks.push({
        id: i,
        saved: !!program,
        program: program || null
      });
    }
    return banks;
  }
  
  /**
   * Load banks from localStorage
   */
  loadBanksFromStorage() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const data = JSON.parse(saved);
        this.banks.clear();
        
        Object.entries(data).forEach(([bankId, program]) => {
          const prog = new Program();
          Object.assign(prog, program);
          
          // Ensure harmonic selections exist with defaults
          if (!prog.harmonicSelections || Object.keys(prog.harmonicSelections).length === 0) {
            prog.harmonicSelections = {
              'vibrato-numerator': [1],
              'vibrato-denominator': [1],
              'trill-numerator': [1],
              'trill-denominator': [1],
              'tremolo-numerator': [1],
              'tremolo-denominator': [1]
            };
          } else {
            // Ensure each key has at least [1] if empty
            ['vibrato', 'trill', 'tremolo'].forEach(expr => {
              ['numerator', 'denominator'].forEach(type => {
                const key = `${expr}-${type}`;
                if (!prog.harmonicSelections[key] || prog.harmonicSelections[key].length === 0) {
                  prog.harmonicSelections[key] = [1];
                }
              });
            });
          }
          
          this.banks.set(parseInt(bankId), prog);
        });
        
        Logger.log(`Loaded ${this.banks.size} banks from storage`, 'lifecycle');
      }
    } catch (error) {
      Logger.log(`Failed to load banks: ${error}`, 'error');
    }
  }
  
  /**
   * Save banks to localStorage
   */
  saveBanksToStorage() {
    try {
      const data = {};
      this.banks.forEach((program, bankId) => {
        data[bankId] = program;
      });
      
      localStorage.setItem(this.storageKey, JSON.stringify(data));
      Logger.log('Banks saved to storage', 'lifecycle');
    } catch (error) {
      Logger.log(`Failed to save banks: ${error}`, 'error');
    }
  }
}

// Create singleton instance
export const programState = new ProgramState();

// Make available globally for compatibility
if (typeof window !== 'undefined') {
  window.programState = programState;
}