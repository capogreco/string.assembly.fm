/**
 * ProgramState Module for String Assembly FM
 * Single source of truth for all program data
 */

import { SystemConfig, ConfigUtils } from '../../config/system.config.js';
import { Logger } from '../core/Logger.js';
import { eventBus } from '../core/EventBus.js';
import { appState } from './AppState.js';

/**
 * Represents a complete program state
 */
class Program {
  constructor() {
    // Core synthesis parameters
    this.parameters = {};
    
    // Musical state
    this.chord = {
      frequencies: []
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
      expressions: this.chord.expressions ? { ...this.chord.expressions } : {}
    };
    // Clone parts (new paradigm)
    if (this.parts) {
      copy.parts = this.parts.map(p => ({ ...p }));
    }
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
    
    // Banks are now stored in AppState
    
    // Storage key for localStorage
    this.storageKey = ConfigUtils.getStorageKey('banks');
    
    // Track if we're in the middle of an update
    this.isUpdating = false;
  }
  
  /**
   * Initialize the program state
   */
  initialize() {
    // Initializing ProgramState...
    
    // Load banks from storage
    this.loadBanksFromStorage();
    
    // Initialize current program with defaults
    this.initializeDefaults();
    
    // Capture initial UI state
    this.captureFromUI();
    
    // ProgramState initialized
  }
  
  /**
   * Initialize default parameter values
   */
  initializeDefaults() {
    // Set default parameter values from Config
    ConfigUtils.getParameterNames().forEach(paramId => {
      const paramDef = SystemConfig.parameters[paramId];
      this.currentProgram.parameters[paramId] = paramDef ? paramDef.default : 0.5;
    });
    
    // Log what defaults are being set
    // Initialized default parameters
  }
  
  /**
   * Capture current state from UI
   */
  captureFromUI() {
    if (this.isUpdating) return;
    
    try {
      this.isUpdating = true;
      
      // Capture parameter values
      ConfigUtils.getParameterNames().forEach(paramId => {
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
      
      // Captured program state from UI
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
      
      // The ParameterControls module will now handle applying parameter values
      // by listening to the programState:bankLoaded event.
      
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
      
      // NOTE: Removed chord event emission - using direct renderParts() calls instead
      
      // Applied program state to UI
    } finally {
      this.isUpdating = false;
    }
  }
  
  /**
   * Apply harmonic selections to UI
   */
  applyHarmonicSelectionsToUI(selections) {
    // Applying harmonic selections to UI
    
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
      
      // Found buttons for harmonic selection
      
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
  updateChord(frequencies) {
    this.currentProgram.chord.frequencies = [...frequencies];
    
    // Mark as changed
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
    
    // Get parts from partManager for saving (NEW PARADIGM)
    const partManager = appState.get('partManager');
    Logger.log(`setActiveProgram: partManager exists: ${!!partManager}`, 'lifecycle');
    
    if (partManager) {
      // Get the complete parts array
      const parts = partManager.getParts();
      // Store parts in activeProgram (new paradigm)
      this.activeProgram.parts = parts.map(p => p.toObject ? p.toObject() : p);
      Logger.log(`Captured ${parts.length} parts for active program`, 'lifecycle');
      
      // Also build expressions for backward compatibility
      if (partManager.synthAssignments.size > 0) {
        const expressions = {};
        for (const [synthId, assignment] of partManager.synthAssignments) {
          const noteName = partManager.frequencyToNoteName(assignment.frequency);
          if (assignment.expression && assignment.expression.type !== "none") {
            expressions[noteName] = assignment.expression;
          }
        }
        // Store in activeProgram for backward compatibility when saving
        this.activeProgram.chord.expressions = expressions;
      }
    } else {
      // Initialize empty arrays/objects if not already present
      if (!this.activeProgram.parts) {
        this.activeProgram.parts = [];
      }
      if (!this.activeProgram.chord.expressions) {
        this.activeProgram.chord.expressions = {};
      }
      Logger.log(`No partManager available`, 'lifecycle');
    }
    
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
    
    // Log save summary
    const partsCount = programToSave.parts?.length || 0;
    const freqCount = programToSave.chord?.frequencies?.length || 0;
    Logger.log(`Saving to bank ${bankId}: ${partsCount} parts, ${freqCount} frequencies`, 'lifecycle');
    
    // Get banks from AppState
    const banks = appState.getNested('banking.banks') || new Map();
    banks.set(bankId, programToSave);
    appState.setNested('banking.banks', banks);
    
    // Update metadata
    appState.setNested('banking.metadata.lastModified', Date.now());
    
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
    const banks = appState.getNested('banking.banks') || new Map();
    const program = banks.get(bankId);
    if (!program) {
      Logger.log(`Bank ${bankId} is empty`, 'warning');
      return false;
    }
    
    Logger.log(`Loading program from bank ${bankId}`, 'lifecycle');
    
    // 1. Set as current program
    this.currentProgram = program.clone();
    
    // 2. Update UI directly (no events)
    this.applyToUI();
    
    // 3. Update PartManager directly (no events)
    const partManager = appState.get('partManager');
    if (partManager) {
      if (this.currentProgram.parts && this.currentProgram.parts.length > 0) {
        // New paradigm: use parts directly
        partManager.setPartsDirectly(this.currentProgram.parts);
        Logger.log(`Loaded ${this.currentProgram.parts.length} parts from bank ${bankId}`, 'lifecycle');
      } else if (this.currentProgram.chord.frequencies && this.currentProgram.chord.frequencies.length > 0) {
        // Old paradigm: convert chord + expressions to parts
        const frequencies = this.currentProgram.chord.frequencies;
        const expressions = this.currentProgram.chord.expressions || {};
        
        // Create parts from frequencies and expressions
        const parts = frequencies.map(freq => {
          const noteName = this.frequencyToNoteName(freq);
          const expression = expressions[noteName] || { type: 'none' };
          return { frequency: freq, expression: expression };
        });
        
        partManager.setPartsDirectly(parts);
        Logger.log(`Migrated ${frequencies.length} frequencies + ${Object.keys(expressions).length} expressions to parts`, 'lifecycle');
      } else {
        // Empty bank
        partManager.setPartsDirectly([]);
        Logger.log(`Bank ${bankId} is empty`, 'lifecycle');
      }
    }
    
    // 4. Update PianoKeyboard directly from Parts (single source of truth)
    const pianoKeyboard = appState.get('pianoKeyboard');
    if (pianoKeyboard && partManager) {
      const currentParts = partManager.getParts();
      pianoKeyboard.renderParts(currentParts);
    }
    
    // Emit single completion event
    eventBus.emit('programState:bankLoaded', {
      bankId,
      program: this.currentProgram
    });
    
    Logger.log(`Successfully loaded program from bank ${bankId}`, 'lifecycle');
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
    appState.setNested('banking.banks', new Map());
    appState.setNested('banking.metadata.lastModified', Date.now());
    this.saveBanksToStorage();
    
    eventBus.emit('programState:banksCleared');
    Logger.log('All banks cleared', 'lifecycle');
  }
  
  /**
   * Get saved banks info
   */
  getSavedBanks() {
    const banksMap = appState.getNested('banking.banks') || new Map();
    const banks = [];
    for (let i = 1; i <= 10; i++) {
      const program = banksMap.get(i);
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
      const banks = new Map();
      
      if (saved) {
        const data = JSON.parse(saved);
        
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
          
          banks.set(parseInt(bankId), prog);
        });
        
        // Store in AppState
        appState.setNested('banking.banks', banks);
        appState.setNested('banking.metadata.lastModified', Date.now());
        
        // Banks loaded from storage
        // Emit event to update UI
        eventBus.emit('programState:banksLoaded', {
          bankCount: banks.size
        });
      } else {
        // Initialize empty banks
        appState.setNested('banking.banks', banks);
        // Emit event even for empty banks to update UI
        eventBus.emit('programState:banksLoaded', {
          bankCount: 0
        });
      }
    } catch (error) {
      Logger.log(`Failed to load banks: ${error}`, 'error');
      // Initialize empty banks on error
      appState.setNested('banking.banks', new Map());
      // Emit event even on error to update UI
      eventBus.emit('programState:banksLoaded', {
        bankCount: 0,
        error: error.message
      });
    }
  }
  
  /**
   * Save banks to localStorage
   */
  saveBanksToStorage() {
    try {
      const banks = appState.getNested('banking.banks') || new Map();
      const data = {};
      banks.forEach((program, bankId) => {
        data[bankId] = program;
      });
      
      localStorage.setItem(this.storageKey, JSON.stringify(data));
      // Banks saved to storage
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