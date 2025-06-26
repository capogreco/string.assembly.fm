/**
 * ProgramManager Module for String Assembly FM
 * Handles program saving, loading, and bank management
 */

import { appState } from './AppState.js';
import { Config } from '../core/Config.js';

export class ProgramManager {
  constructor(state = appState, storage = localStorage) {
    this.state = state;
    this.storage = storage;
    this.storageKey = Config.STORAGE_KEYS.BANKS;
    this.isApplyingProgram = false; // Prevent recursive updates
  }

  /**
   * Load saved banks from localStorage
   */
  loadBanksFromStorage() {
    try {
      const saved = this.storage.getItem(this.storageKey);
      if (saved) {
        const banksData = JSON.parse(saved);
        const programBanks = new Map();

        Object.entries(banksData).forEach(([bankId, program]) => {
          programBanks.set(parseInt(bankId), program);
        });

        this.state.set('programBanks', programBanks);

        if (window.Logger) {
          window.Logger.log(
            `Loaded ${programBanks.size} banks from storage`,
            'lifecycle'
          );
        }

        return true;
      }
    } catch (e) {
      if (window.Logger) {
        window.Logger.log(`Failed to load banks from storage: ${e}`, 'error');
      }
      return false;
    }

    return false;
  }

  /**
   * Save banks to localStorage
   */
  saveBanksToStorage() {
    try {
      const programBanks = this.state.get('programBanks');
      const banksData = {};

      programBanks.forEach((program, bankId) => {
        banksData[bankId] = program;
      });

      const dataToSave = JSON.stringify(banksData);
      const dataSize = new Blob([dataToSave]).size;
      
      this.storage.setItem(this.storageKey, dataToSave);

      if (window.Logger) {
        window.Logger.log(`Saved ${Object.keys(banksData).length} banks to storage (${(dataSize/1024).toFixed(2)}KB)`, 'lifecycle');
      }

      return true;
    } catch (e) {
      if (window.Logger) {
        window.Logger.log(`Failed to save banks to storage: ${e}`, 'error');
      }
      return false;
    }
  }

  /**
   * Save current program to specified bank
   * @param {number} bankId - Bank ID (1-16)
   * @param {Object} programData - Program data to save
   */
  saveToBank(bankId, programData = null) {
    try {
      // Get current program data if not provided
      const program = programData || this.getCurrentProgram();

      if (!program) {
        if (window.Logger) {
          window.Logger.log('No program data to save', 'error');
        }
        return false;
      }

      // Store harmonic selections (convert Sets to Arrays for JSON serialization)
      const harmonicSelections = this.state.get('harmonicSelections');
      const harmonicSelectionsForSave = {};

      Object.keys(harmonicSelections).forEach((key) => {
        harmonicSelectionsForSave[key] = Array.from(harmonicSelections[key]);
      });

      // Get note expressions from PianoKeyboard
      let noteExpressions = {};
      const pianoKeyboard = this.state.get('pianoKeyboard');
      if (pianoKeyboard && pianoKeyboard.expressionHandler) {
        noteExpressions = pianoKeyboard.expressionHandler.getAllExpressions();
      }

      // Get current chord
      const currentChord = this.state.get('currentChord') || [];
      
      // Log what we're saving
      console.log(`CONTROLLER SAVING to Bank ${bankId}:`);
      console.log(`- Chord: ${currentChord.length > 0 ? currentChord.map(f => f.toFixed(1)).join(', ') + ' Hz' : 'EMPTY'}`);
      console.log(`- Expressions: ${JSON.stringify(noteExpressions)}`);

      // Create complete controller state
      const controllerState = {
        ...program,
        chordNotes: [...currentChord],
        noteExpressions: noteExpressions,
        selectedExpression: this.state.get('selectedExpression'),
        harmonicSelections: harmonicSelectionsForSave,
        timestamp: Date.now(),
        version: '1.0'
      };
      

      // Update program banks
      const programBanks = new Map(this.state.get('programBanks'));
      const isOverwrite = programBanks.has(bankId);
      programBanks.set(bankId, controllerState);
      this.state.set('programBanks', programBanks);

      // Save to storage
      this.saveBanksToStorage();
      
      if (window.Logger) {
        window.Logger.log(`${isOverwrite ? 'Overwrote' : 'Saved to'} Bank ${bankId}`, 'lifecycle');
      }

      // Emit save event
      if (window.eventBus) {
        window.eventBus.emit('program:saved', {
          bankId,
          program: controllerState,
          timestamp: Date.now()
        });
      }

      if (window.Logger) {
        window.Logger.log(`Program saved to Bank ${bankId}`, 'lifecycle');
      }

      return true;
    } catch (error) {
      if (window.Logger) {
        window.Logger.log(`Failed to save to bank ${bankId}: ${error}`, 'error');
      }
      return false;
    }
  }

  /**
   * Load program from specified bank
   * @param {number} bankId - Bank ID to load from
   */
  loadFromBank(bankId) {
    // Prevent recursive loads
    if (this.isLoadingBank) {
      console.warn(`[ProgramManager] Prevented recursive load of bank ${bankId}`);
      return false;
    }
    
    this.isLoadingBank = true;
    
    try {
      if (window.Logger) {
        window.Logger.log(`Loading from bank ${bankId}...`, 'lifecycle');
      }

      const programBanks = this.state.get('programBanks');

      if (!programBanks.has(bankId)) {
        if (window.Logger) {
          window.Logger.log(`Bank ${bankId} not found`, 'error');
        }
        return false;
      }

      const savedState = programBanks.get(bankId);

      if (!savedState) {
        if (window.Logger) {
          window.Logger.log(`Bank ${bankId} has no data`, 'error');
        }
        return false;
      }
      
      // Restore UI parameter values
      this.applyProgramToUI(savedState);

      // Restore harmonic selections
      if (savedState.harmonicSelections) {
        const harmonicSelections = this.state.get('harmonicSelections');

        for (const key in savedState.harmonicSelections) {
          if (harmonicSelections[key]) {
            harmonicSelections[key].clear();
            savedState.harmonicSelections[key].forEach(value => {
              harmonicSelections[key].add(value);
            });
          }
        }

        this.state.set('harmonicSelections', harmonicSelections);
        this.applyHarmonicSelectionsToUI(harmonicSelections);
      }

      // Log what we're loading
      try {
        console.log(`CONTROLLER LOADING from Bank ${bankId}:`);
        const chordString = savedState.chordNotes && savedState.chordNotes.length > 0 
          ? savedState.chordNotes.map(f => f.toFixed(1)).join(', ') + ' Hz' 
          : 'EMPTY';
        console.log(`- Chord: ${chordString}`);
        console.log(`- Expressions: ${JSON.stringify(savedState.noteExpressions || {})}`);
      } catch (e) {
        console.error('Error logging load data:', e);
      }

      // Restore chord and expressions
      if (savedState.chordNotes && Array.isArray(savedState.chordNotes)) {
        console.log(`- Restoring chord with ${savedState.chordNotes.length} notes`);
        
        // Clear existing chord first
        this.state.set('currentChord', []);
        
        // Set new chord
        this.state.set('currentChord', [...savedState.chordNotes]);

        // Update global compatibility
        if (window.currentChord) {
          window.currentChord = [...savedState.chordNotes];
        }
        
        // Emit chord change event for PianoKeyboard
        if (window.eventBus) {
          window.eventBus.emit('chord:changed', {
            frequencies: [...savedState.chordNotes],
            timestamp: Date.now()
          });
        }
        
        console.log(`- Chord restored and events emitted`);
      } else {
        console.log(`- No chord to restore`);
      }

      // Restore note expressions
      if (savedState.noteExpressions) {
        const pianoKeyboard = this.state.get('pianoKeyboard');
        if (pianoKeyboard && pianoKeyboard.expressionHandler) {
          pianoKeyboard.expressionHandler.restoreExpressions(savedState.noteExpressions);
        }
      }

      // Restore selected expression
      if (savedState.selectedExpression) {
        this.state.set('selectedExpression', savedState.selectedExpression);
        this.applyExpressionToUI(savedState.selectedExpression);
      }

      // Update current program state
      this.state.set('currentProgram', savedState);

      // Update global compatibility
      if (window.current_program) {
        window.current_program = savedState;
      }

      // Update bank selector to reflect loaded bank
      const bankSelector = document.getElementById('bank_selector');
      if (bankSelector) {
        bankSelector.value = bankId;
      }

      // Emit load event
      if (window.eventBus) {
        window.eventBus.emit('program:loaded', {
          bankId,
          program: savedState,
          timestamp: Date.now()
        });
      }

      if (window.Logger) {
        window.Logger.log(`Successfully loaded Bank ${bankId}`, 'lifecycle');
      }

      return true;
    } catch (error) {
      if (window.Logger) {
        window.Logger.log(`Failed to load from bank ${bankId}: ${error}`, 'error');
      }
      return false;
    } finally {
      this.isLoadingBank = false;
    }
  }

  /**
   * Create example program with default values
   */
  createExampleProgram() {
    return {
      ...Config.DEFAULT_PROGRAM,
      name: 'Example Program',
      timestamp: Date.now(),
      version: '1.0'
    };
  }

  /**
   * Get current program from UI state
   */
  getCurrentProgram() {
    try {
      const program = {};

      // Get parameter values from UI elements
      Config.PARAM_IDS.forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
          const value = element.type === 'range'
            ? parseFloat(element.value)
            : element.value;
          program[id] = value;
        } else {
          // Use default value if element not found
          program[id] = Config.DEFAULT_PROGRAM[id] || 0.5;
        }
      });

      // Add metadata
      program.timestamp = Date.now();
      program.version = '1.0';

      return program;
    } catch (error) {
      if (window.Logger) {
        window.Logger.log(`Failed to get current program: ${error}`, 'error');
      }
      return null;
    }
  }

  /**
   * Apply program values to UI elements
   * @param {Object} program - Program data to apply
   */
  applyProgramToUI(program) {
    // Prevent recursive updates
    if (this.isApplyingProgram) {
      console.warn('[ProgramManager] Prevented recursive applyProgramToUI call');
      return;
    }
    
    this.isApplyingProgram = true;
    
    try {
      Config.PARAM_IDS.forEach((id) => {
        if (program[id] !== undefined) {
          const element = document.getElementById(id);
          if (element) {
            element.value = program[id];

            // Update display value if there's a corresponding display element
            const displayElement = document.getElementById(`${id}_value`);
            if (displayElement) {
              displayElement.textContent = program[id];
            }

            // Trigger input event to notify other systems
            element.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      });
    } finally {
      this.isApplyingProgram = false;
    }
  }

  /**
   * Apply harmonic selections to UI
   * @param {Object} harmonicSelections - Harmonic selections to apply
   */
  applyHarmonicSelectionsToUI(harmonicSelections) {
    Object.entries(harmonicSelections).forEach(([selector, values]) => {
      const buttons = document.querySelectorAll(
        `.harmonic-selector[data-expression="${selector.split('-')[0]}"] .harmonic-button`
      );

      buttons.forEach(button => {
        const value = parseInt(button.dataset.value);
        const isSelected = values.has(value);
        button.classList.toggle('selected', isSelected);
      });
    });
  }

  /**
   * Apply expression selection to UI
   * @param {string} expression - Expression type to select
   */
  applyExpressionToUI(expression) {
    const radio = document.querySelector(`input[name="expression"][value="${expression}"]`);
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  /**
   * Get list of all saved banks
   * @returns {Array} Array of bank info objects
   */
  getSavedBanks() {
    const programBanks = this.state.get('programBanks');
    const banks = [];

    for (let i = 1; i <= Config.UI.BANK_COUNT; i++) {
      const program = programBanks.get(i);
      banks.push({
        id: i,
        saved: !!program,
        name: program?.name || `Bank ${i}`,
        timestamp: program?.timestamp || null,
        program: program || null
      });
    }

    return banks;
  }

  /**
   * Delete program from bank
   * @param {number} bankId - Bank ID to clear
   */
  clearBank(bankId) {
    try {
      const programBanks = new Map(this.state.get('programBanks'));

      if (programBanks.has(bankId)) {
        programBanks.delete(bankId);
        this.state.set('programBanks', programBanks);
        this.saveBanksToStorage();

        // Emit clear event
        if (window.eventBus) {
          window.eventBus.emit('program:cleared', {
            bankId,
            timestamp: Date.now()
          });
        }

        if (window.Logger) {
          window.Logger.log(`Cleared Bank ${bankId}`, 'lifecycle');
        }

        return true;
      }

      return false;
    } catch (error) {
      if (window.Logger) {
        window.Logger.log(`Failed to clear bank ${bankId}: ${error}`, 'error');
      }
      return false;
    }
  }

  /**
   * Export all banks as JSON
   * @returns {string} JSON string of all banks
   */
  exportBanks() {
    try {
      const programBanks = this.state.get('programBanks');
      const exportData = {
        version: '1.0',
        timestamp: Date.now(),
        banks: Object.fromEntries(programBanks)
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      if (window.Logger) {
        window.Logger.log(`Failed to export banks: ${error}`, 'error');
      }
      return null;
    }
  }

  /**
   * Import banks from JSON
   * @param {string} jsonData - JSON string to import
   * @returns {boolean} Success status
   */
  importBanks(jsonData) {
    try {
      const importData = JSON.parse(jsonData);

      if (!importData.banks) {
        throw new Error('Invalid import data format');
      }

      const programBanks = new Map();
      Object.entries(importData.banks).forEach(([bankId, program]) => {
        programBanks.set(parseInt(bankId), program);
      });

      this.state.set('programBanks', programBanks);
      this.saveBanksToStorage();

      // Emit import event
      if (window.eventBus) {
        window.eventBus.emit('program:imported', {
          bankCount: programBanks.size,
          timestamp: Date.now()
        });
      }

      if (window.Logger) {
        window.Logger.log(`Imported ${programBanks.size} banks`, 'lifecycle');
      }

      return true;
    } catch (error) {
      if (window.Logger) {
        window.Logger.log(`Failed to import banks: ${error}`, 'error');
      }
      return false;
    }
  }
}

// Create global instance
export const programManager = new ProgramManager();

// Make available globally for backward compatibility
if (typeof window !== 'undefined') {
  window.ProgramManager = ProgramManager;
  window.programManager = programManager;
}
