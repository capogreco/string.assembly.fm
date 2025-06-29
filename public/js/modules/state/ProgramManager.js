/**
 * ProgramManager Module for String Assembly FM
 * Handles program saving, loading, and bank management
 */

import { appState } from './AppState.js';
import { SystemConfig, ConfigUtils } from '../../config/system.config.js';
import { eventBus } from '../core/EventBus.js';
import { programState } from './ProgramState.js';

export class ProgramManager {
  constructor(state = appState, storage = localStorage, eventBusInstance = eventBus) {
    this.state = state;
    this.storage = storage;
    this.eventBus = eventBusInstance;
    this.storageKey = ConfigUtils.getStorageKey('banks');
    this.isApplyingProgram = false; // Prevent recursive updates
    
    // This is now a compatibility wrapper around ProgramState
    this.programState = programState;
  }

  /**
   * Load saved banks from localStorage
   * @deprecated Use programState.loadBanksFromStorage() instead
   */
  loadBanksFromStorage() {
    // Delegate to ProgramState
    this.programState.loadBanksFromStorage();
    
    // Keep appState in sync for compatibility
    const banks = this.programState.getSavedBanks();
    const programBanks = new Map();
    banks.forEach(bank => {
      if (bank.saved) {
        programBanks.set(bank.id, bank.program);
      }
    });
    this.state.set('programBanks', programBanks);
    
    return true;
  }

  /**
   * Save banks to localStorage
   * @deprecated Use programState.saveBanksToStorage() instead
   */
  saveBanksToStorage() {
    // Delegate to ProgramState
    this.programState.saveBanksToStorage();
    return true;
  }

  /**
   * Save current program to specified bank
   * @param {number} bankId - Bank ID (1-16)
   * @param {Object} programData - Program data to save
   * @deprecated Use programState.saveToBank() instead
   */
  saveToBank(bankId, programData = null) {
    // For compatibility: if programData is provided, we need to convert it
    // to the format expected by ProgramState
    if (programData) {
      // This is being called with old-style program data
      // We should save the active program instead
      if (window.Logger) {
        window.Logger.log('ProgramManager.saveToBank called with programData - saving active program instead', 'warning');
      }
    }
    
    // Delegate to ProgramState to save the active program
    return this.programState.saveToBank(bankId);
  }

  /**
   * Load program from specified bank
   * @param {number} bankId - Bank ID to load from
   * @deprecated Use programState.loadFromBank() instead
   */
  loadFromBank(bankId, options = { preview: false }) {
    if (options.preview) {
      const banks = this.state.getNested('banking.banks') || new Map();
      const program = banks.get(bankId);
      if (program) {
        // Apply program parameters without dispatching events
        this.applyProgramToUI(program.parameters, { dispatchEvents: false });
        this.applyHarmonicSelectionsToUI(program.harmonicSelections);
        this.applyExpressionToUI(program.selectedExpression);

        // Manually update the piano keyboard
        const pianoKeyboard = window.modular?.pianoKeyboard;
        if (pianoKeyboard) {
          pianoKeyboard.setChord(program.chord.frequencies);
          pianoKeyboard.expressionHandler.restoreExpressions(program.chord.expressions);
        }
        return true;
      }
      return false;
    }
    // Delegate to ProgramState for full load
    return this.programState.loadFromBank(bankId);
  }

  /**
   * Create example program with default values
   */
  createExampleProgram() {
    return {
      ...ConfigUtils.getDefaultProgram(),
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
      ConfigUtils.getParameterNames().forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
          const value = element.type === 'range'
            ? parseFloat(element.value)
            : element.value;
          program[id] = value;
        } else {
          // Use default value if element not found
          program[id] = ConfigUtils.getDefaultProgram()[id] || 0.5;
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
  applyProgramToUI(program, options = { dispatchEvents: true }) {
    // Prevent recursive updates
    if (this.isApplyingProgram) {
      console.warn('[ProgramManager] Prevented recursive applyProgramToUI call');
      return;
    }
    
    this.isApplyingProgram = true;
    
    try {
      ConfigUtils.getParameterNames().forEach((id) => {
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
            if (options.dispatchEvents) {
              element.dispatchEvent(new Event('input', { bubbles: true }));
            }
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
    Object.entries(harmonicSelections).forEach(([key, values]) => {
      const [expression, type] = key.split('-');
      const buttons = document.querySelectorAll(
        `.harmonic-selector[data-expression="${expression}"] .harmonic-row[data-type="${type}"] .harmonic-button`
      );

      buttons.forEach(button => {
        const value = parseInt(button.dataset.value);
        const isSelected = values.includes(value);
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
   * @deprecated Use programState.getSavedBanks() instead
   */
  getSavedBanks() {
    // Delegate to ProgramState
    return this.programState.getSavedBanks();
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
   * Clear all saved banks
   * @returns {boolean} Success status
   */
  clearAllBanks() {
    // Delegate to ProgramState
    this.programState.clearAllBanks();
    
    // Emit compatibility event
    this.eventBus.emit('programManager:allBanksCleared', {
      timestamp: Date.now()
    });
    
    return true;
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
