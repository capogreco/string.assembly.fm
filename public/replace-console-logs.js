#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * Console.log to Logger Replacement Script
 * 
 * This script helps replace console.log/error/warn/debug statements with
 * categorized Logger calls in the String Assembly FM codebase.
 * 
 * Features:
 *   - Automatically categorizes logs based on content
 *   - Handles diagnostic logs wrapped with if (this.enableDiagnosticLogs)
 *   - Handles multi-line console statements (console.log spanning multiple lines)
 *   - Adds Logger import when needed
 *   - Preserves indentation and formatting
 * 
 * Multi-line handling:
 *   - Detects console statements that start but don't end on the same line
 *   - Continues reading until it finds the closing parenthesis
 *   - Replaces the entire multi-line statement with a single-line Logger call
 *   - Properly handles nested parentheses and string literals
 * 
 * Usage:
 *   deno run --allow-read --allow-write replace-console-logs.js [options] [files...]
 * 
 * Options:
 *   --preview    Show changes without applying them (default)
 *   --apply      Apply the changes to files
 *   --help       Show this help message
 * 
 * Examples:
 *   # Preview changes for all JS files in a directory
 *   deno run --allow-read replace-console-logs.js js/modules/
 *   
 *   # Apply changes to specific files
 *   deno run --allow-read --allow-write replace-console-logs.js --apply js/app.js
 */

import { parse } from "https://deno.land/std@0.224.0/flags/mod.ts";
import { walk } from "https://deno.land/std@0.224.0/fs/walk.ts";
import { relative } from "https://deno.land/std@0.224.0/path/mod.ts";
import { bold, green, red, yellow, blue, gray } from "https://deno.land/std@0.224.0/fmt/colors.ts";

// Logger categories based on the actual Logger module
const LOGGER_CATEGORIES = {
  connections: ["websocket", "webrtc", "connection", "connect", "disconnect", "peer"],
  messages: ["message", "send", "receive", "broadcast", "emit"],
  parameters: ["parameter", "param", "value", "range", "slider", "control"],
  expressions: ["chord", "expression", "velocity", "harmonic", "ratio"],
  performance: ["latency", "ping", "performance", "timing", "fps", "frame"],
  lifecycle: ["init", "start", "stop", "destroy", "mount", "unmount", "load", "save"],
  errors: ["error", "fail", "exception", "catch", "throw"],
  debug: ["debug", "trace", "verbose"],
  parts: ["part", "instrument", "voice", "channel"]
};

// Keywords to help categorize logs
const CATEGORY_KEYWORDS = {
  connections: /\b(websocket|webrtc|ws|rtc|connect|disconnect|peer|socket|network)\b/i,
  messages: /\b(message|msg|send|sent|receive|received|broadcast|emit|data)\b/i,
  parameters: /\b(parameter|param|value|range|slider|control|setting|config)\b/i,
  expressions: /\b(chord|expression|velocity|harmonic|ratio|frequency|pitch|note)\b/i,
  performance: /\b(latency|ping|performance|timing|fps|frame|delay|ms|millisecond)\b/i,
  lifecycle: /\b(init|initialize|start|stop|destroy|mount|unmount|load|save|create|setup)\b/i,
  errors: /\b(error|fail|failed|exception|catch|throw|invalid|wrong|problem)\b/i,
  debug: /\b(debug|trace|verbose|dump|inspect)\b/i,
  parts: /\b(part|instrument|voice|channel|synth|string)\b/i
};

// Context keywords from variable names and function names
const CONTEXT_PATTERNS = {
  connections: /\b(ws|websocket|rtc|peer|connection)manager\b/i,
  messages: /\b(message|event)handler\b/i,
  parameters: /\b(parameter|control)s?\b/i,
  performance: /\b(performance|monitor|stats)\b/i,
  parts: /\b(part|instrument)manager\b/i
};

class ConsoleLogReplacer {
  constructor(options = {}) {
    this.preview = !options.apply;
    this.stats = {
      filesProcessed: 0,
      totalReplacements: 0,
      byCategory: {}
    };
  }

  /**
   * Calculate relative path from one file to another
   */
  calculateRelativePath(fromFile, toPath) {
    // Normalize the path to handle both relative and absolute paths
    const normalizedPath = fromFile.startsWith('/') ? fromFile : '/' + fromFile;
    
    // Remove filename from path
    const fromParts = normalizedPath.split('/').filter(p => p);
    fromParts.pop(); // Remove filename
    
    // Check if file is in js/modules/*/
    if (fromParts.includes('js') && fromParts.includes('modules')) {
      const moduleIndex = fromParts.indexOf('modules');
      const afterModules = fromParts.slice(moduleIndex + 1);
      
      // If we're in a subdirectory of modules (ui, network, state, etc.)
      if (afterModules.length > 0 && afterModules[0] !== 'core') {
        return '../core/Logger.js';
      }
      
      // If we're in the modules directory itself
      if (afterModules.length === 0) {
        return './core/Logger.js';
      }
    }
    
    // If we're in js/apps/
    if (fromParts.includes('js') && fromParts.includes('apps')) {
      return '../modules/core/Logger.js';
    }
    
    // If we're directly in js/
    if (fromParts[fromParts.length - 1] === 'js') {
      return './modules/core/Logger.js';
    }
    
    // If we're in js/test/ or other js subdirectories
    if (fromParts.includes('js')) {
      const jsIndex = fromParts.indexOf('js');
      const afterJs = fromParts.slice(jsIndex + 1);
      if (afterJs.length === 1) {
        return '../modules/core/Logger.js';
      }
    }
    
    // Default fallback
    return './js/modules/core/Logger.js';
  }

  /**
   * Categorize a console statement based on its content and context
   */
  categorizeLog(content, context = {}) {
    const lowerContent = content.toLowerCase();
    
    // First check for explicit error/warn/debug
    if (context.method === 'error') return 'errors';
    if (context.method === 'warn') return 'errors'; // Treat warnings as errors
    if (context.method === 'debug') return 'debug';
    
    // Check file context
    if (context.filePath) {
      const filePath = context.filePath.toLowerCase();
      for (const [category, pattern] of Object.entries(CONTEXT_PATTERNS)) {
        if (pattern.test(filePath)) {
          return category;
        }
      }
    }
    
    // Check content for category keywords
    for (const [category, pattern] of Object.entries(CATEGORY_KEYWORDS)) {
      if (pattern.test(content)) {
        return category;
      }
    }
    
    // Default to lifecycle for general logs
    return 'lifecycle';
  }

  /**
   * Convert console method to Logger method
   */
  getLoggerMethod(consoleMethod) {
    switch (consoleMethod) {
      case 'error':
        return 'error';
      case 'warn':
        return 'error'; // Logger doesn't have warn, use error
      case 'debug':
        return 'debug';
      default:
        return 'log';
    }
  }

  /**
   * Create a Logger replacement for a console statement
   */
  createReplacement(match, context) {
    const { method, args, indent } = match;
    const category = this.categorizeLog(args, { ...context, method });
    
    // Handle special cases
    if (method === 'error') {
      return `${indent}Logger.log(${args}, 'error');`;
    }
    
    // For regular logs, add category as second parameter
    if (args.includes(',')) {
      // Multiple arguments - need to handle carefully
      // Try to detect if it's template literal or multiple args
      if (args.includes('${') || args.match(/['"`].*\+.*['"`]/)) {
        // Likely a template literal or concatenation
        return `${indent}Logger.log(${args}, '${category}');`;
      } else {
        // Multiple arguments - wrap in template literal
        return `${indent}Logger.log(\`${args.replace(/[`\\$]/g, '\\$&')}\`, '${category}');`;
      }
    } else {
      // Single argument
      return `${indent}Logger.log(${args}, '${category}');`;
    }
  }

  /**
   * Process a single file
   */
  async processFile(filePath) {
    try {
      const content = await Deno.readTextFile(filePath);
      const lines = content.split('\n');
      const replacements = [];
      
      // Regex to match console statements
      const consoleRegex = /^(\s*)console\.(log|error|warn|debug)\s*\((.*)\);?\s*$/;
      
      // Regex to match if (this.enableDiagnosticLogs) console statements
      const diagnosticConsoleRegex = /^(\s*)if\s*\(\s*this\.enableDiagnosticLogs\s*\)\s*console\.(log|error|warn|debug)\s*\((.*)\);?\s*$/;
      
      // Regex to match multi-line diagnostic pattern (if statement with console on next line)
      const diagnosticIfRegex = /^(\s*)if\s*\(\s*this\.enableDiagnosticLogs\s*\)\s*\{?\s*$/;
      
      // Regex to match start of multi-line console statement
      const consoleStartRegex = /^(\s*)console\.(log|error|warn|debug)\s*\(/;
      
      // Regex to match start of multi-line diagnostic console statement
      const diagnosticConsoleStartRegex = /^(\s*)if\s*\(\s*this\.enableDiagnosticLogs\s*\)\s*console\.(log|error|warn|debug)\s*\(/;
      
      // Track if we need to import Logger
      let hasLoggerImport = false;
      let needsLoggerImport = false;
      let importLineIndex = -1;
      
      // Track multi-line diagnostic patterns
      let diagnosticIfLines = new Set();
      let diagnosticConsoleLines = new Map();
      
      // Helper function to find the end of a multi-line console statement
      const findConsoleStatementEnd = (startIndex) => {
        let parenCount = 0;
        let inString = false;
        let stringChar = null;
        let endIndex = startIndex;
        let args = '';
        let hasClosingSemicolon = false;
        
        for (let i = startIndex; i < lines.length; i++) {
          const line = lines[i];
          
          // Parse the line character by character
          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            const prevChar = j > 0 ? line[j - 1] : '';
            
            // Handle string boundaries
            if (!inString && (char === '"' || char === "'" || char === '`')) {
              inString = true;
              stringChar = char;
            } else if (inString && char === stringChar && prevChar !== '\\') {
              inString = false;
              stringChar = null;
            }
            
            // Count parentheses when not in string
            if (!inString) {
              if (char === '(') parenCount++;
              else if (char === ')') parenCount--;
            }
          }
          
          // Add line content to args
          if (i === startIndex) {
            // First line - extract args after the opening parenthesis
            const match = line.match(/console\.\w+\s*\((.*)/);
            if (match) {
              args += match[1];
            }
          } else {
            // Subsequent lines - add full line
            args += '\n' + line;
          }
          
          // Check if we've found the closing parenthesis
          if (parenCount === 0 && line.includes(')')) {
            endIndex = i;
            
            // Check if there's a semicolon after the closing parenthesis
            const afterParen = line.substring(line.lastIndexOf(')') + 1);
            hasClosingSemicolon = afterParen.includes(';');
            
            // If there's only closing punctuation on the next line, include it
            if (!hasClosingSemicolon && i + 1 < lines.length) {
              const nextLine = lines[i + 1].trim();
              if (nextLine === ');' || nextLine === ';') {
                endIndex = i + 1;
                hasClosingSemicolon = true;
              }
            }
            
            // Extract the arguments up to the closing parenthesis
            const lastParen = args.lastIndexOf(')');
            if (lastParen !== -1) {
              args = args.substring(0, lastParen).trim();
              // Remove trailing comma if present
              if (args.endsWith(',')) {
                args = args.substring(0, args.length - 1).trim();
              }
            }
            break;
          }
        }
        
        return { endIndex, args };
      };
      
      // Track lines already processed to avoid duplicates
      const processedLines = new Set();
      
      // First pass - find console statements and check for Logger import
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        
        // Skip if already processed
        if (processedLines.has(index)) {
          continue;
        }
        
        // Check for existing Logger import
        if (line.includes('import') && line.includes('Logger')) {
          hasLoggerImport = true;
        }
        
        // Track where imports are (for adding Logger import if needed)
        if (line.includes('import') && importLineIndex === -1) {
          importLineIndex = index;
        }
        
        // Check for diagnostic if statement (multi-line pattern)
        const diagnosticIfMatch = line.match(diagnosticIfRegex);
        if (diagnosticIfMatch) {
          // Look ahead to see if there's a console statement on the next line(s)
          for (let i = 1; i <= 2 && index + i < lines.length; i++) {
            const nextLine = lines[index + i];
            // Check for both single-line and multi-line console starts
            const nextMatch = nextLine.match(consoleRegex) || nextLine.match(consoleStartRegex);
            if (nextMatch) {
              diagnosticIfLines.add(index);
              diagnosticConsoleLines.set(index + i, {
                ifLine: index,
                indent: diagnosticIfMatch[1]
              });
              break;
            }
            // Stop if we hit a non-whitespace line that's not a console.log
            if (nextLine.trim() && !nextLine.trim().startsWith('console.')) {
              break;
            }
          }
          continue;
        }
        
        // Check for single-line diagnostic console statement
        const diagnosticMatch = line.match(diagnosticConsoleRegex);
        if (diagnosticMatch) {
          const [fullMatch, indent, method, args] = diagnosticMatch;
          
          needsLoggerImport = true;
          processedLines.add(index);
          
          // For diagnostic logs, always use 'debug' category
          const replacement = `${indent}Logger.log(${args}, 'debug');`;
          
          replacements.push({
            lineNumber: index + 1,
            original: line,
            replacement: replacement,
            category: 'debug',
            isDiagnostic: true,
            linesToReplace: [index]
          });
          
          continue;
        }
        
        // Check for multi-line diagnostic console statement start
        const diagnosticStartMatch = line.match(diagnosticConsoleStartRegex);
        if (diagnosticStartMatch) {
          const [fullMatch, indent, method] = diagnosticStartMatch;
          
          needsLoggerImport = true;
          
          // Find the end of the statement
          const { endIndex, args } = findConsoleStatementEnd(index);
          
          // Mark all lines as processed
          for (let i = index; i <= endIndex; i++) {
            processedLines.add(i);
          }
          
          // For diagnostic logs, always use 'debug' category
          const replacement = `${indent}Logger.log(${args}, 'debug');`;
          
          replacements.push({
            lineNumber: index + 1,
            original: lines.slice(index, endIndex + 1).join('\n'),
            replacement: replacement,
            category: 'debug',
            isDiagnostic: true,
            linesToReplace: Array.from({ length: endIndex - index + 1 }, (_, i) => index + i)
          });
          
          continue;
        }
        
        // Check for single-line console statement
        const match = line.match(consoleRegex);
        if (match) {
          const [fullMatch, indent, method, args] = match;
          
          // Skip if already using Logger
          if (line.includes('window.Logger')) {
            continue;
          }
          
          needsLoggerImport = true;
          processedLines.add(index);
          
          let replacement;
          let category;
          let linesToRemove = [];
          
          // Check if this is part of a multi-line diagnostic pattern
          const diagnosticInfo = diagnosticConsoleLines.get(index);
          if (diagnosticInfo) {
            category = 'debug';
            replacement = `${diagnosticInfo.indent}Logger.log(${args}, 'debug');`;
            
            // Mark the if statement line for removal
            linesToRemove.push(diagnosticInfo.ifLine);
            
            // Check if there's a closing brace after this console.log
            if (index + 1 < lines.length && lines[index + 1].trim() === '}') {
              // Check if the opening if had a brace
              const ifLine = lines[diagnosticInfo.ifLine];
              if (ifLine.includes('{')) {
                linesToRemove.push(index + 1);
              }
            }
          } else {
            // Regular console statement
            replacement = this.createReplacement(
              { method, args, indent },
              { filePath, lineNumber: index + 1 }
            );
            category = this.categorizeLog(args, { method, filePath });
          }
          
          replacements.push({
            lineNumber: index + 1,
            original: line,
            replacement: replacement,
            category: category,
            linesToRemove: linesToRemove,
            linesToReplace: [index]
          });
          
          continue;
        }
        
        // Check for multi-line console statement start
        const startMatch = line.match(consoleStartRegex);
        if (startMatch) {
          const [fullMatch, indent, method] = startMatch;
          
          // Skip if already using Logger
          if (line.includes('window.Logger')) {
            continue;
          }
          
          needsLoggerImport = true;
          
          // Find the end of the statement
          const { endIndex, args } = findConsoleStatementEnd(index);
          
          // Mark all lines as processed
          for (let i = index; i <= endIndex; i++) {
            processedLines.add(i);
          }
          
          let replacement;
          let category;
          let linesToRemove = [];
          
          // Check if this is part of a multi-line diagnostic pattern
          const diagnosticInfo = diagnosticConsoleLines.get(index);
          if (diagnosticInfo) {
            category = 'debug';
            replacement = `${diagnosticInfo.indent}Logger.log(${args}, 'debug');`;
            
            // Mark the if statement line for removal
            linesToRemove.push(diagnosticInfo.ifLine);
            
            // Check if there's a closing brace after the last line
            if (endIndex + 1 < lines.length && lines[endIndex + 1].trim() === '}') {
              // Check if the opening if had a brace
              const ifLine = lines[diagnosticInfo.ifLine];
              if (ifLine.includes('{')) {
                linesToRemove.push(endIndex + 1);
              }
            }
          } else {
            // Regular console statement
            replacement = this.createReplacement(
              { method, args, indent },
              { filePath, lineNumber: index + 1 }
            );
            category = this.categorizeLog(args, { method, filePath });
          }
          
          replacements.push({
            lineNumber: index + 1,
            original: lines.slice(index, endIndex + 1).join('\n'),
            replacement: replacement,
            category: category,
            linesToRemove: linesToRemove,
            linesToReplace: Array.from({ length: endIndex - index + 1 }, (_, i) => index + i)
          });
        }
      }
      
      // If no replacements, skip this file
      if (replacements.length === 0) {
        return null;
      }
      
      // Prepare the modified content
      let modifiedLines = [...lines];
      let importStatement = null;
      
      // Add Logger import if needed and not present
      if (needsLoggerImport && !hasLoggerImport) {
        // Calculate relative path to Logger.js
        const loggerPath = this.calculateRelativePath(filePath, '/modules/core/Logger.js');
        importStatement = `import { Logger } from '${loggerPath}';`;
        if (importLineIndex >= 0) {
          // Add after other imports
          modifiedLines.splice(importLineIndex + 1, 0, importStatement);
          // Adjust line numbers for replacements
          replacements.forEach(r => r.lineNumber++);
        } else {
          // Add at the beginning
          modifiedLines.unshift(importStatement);
          replacements.forEach(r => r.lineNumber++);
        }
      }
      
      // Collect all lines to remove and replace
      const linesToRemove = new Set();
      const lineOperations = new Map();
      
      // Process replacements
      replacements.forEach(({ lineNumber, replacement, linesToRemove: removeLines, linesToReplace }) => {
        // Handle lines to remove (from diagnostic if statements)
        if (removeLines) {
          removeLines.forEach(line => linesToRemove.add(line));
        }
        
        // Handle multi-line replacements
        if (linesToReplace && linesToReplace.length > 0) {
          // Mark the first line for replacement
          lineOperations.set(linesToReplace[0], { action: 'replace', content: replacement });
          
          // Mark subsequent lines for removal
          for (let i = 1; i < linesToReplace.length; i++) {
            lineOperations.set(linesToReplace[i], { action: 'remove' });
          }
        } else {
          // Single line replacement (backward compatibility)
          lineOperations.set(lineNumber - 1, { action: 'replace', content: replacement });
        }
      });
      
      // Add lines to remove
      linesToRemove.forEach(lineIndex => {
        if (!lineOperations.has(lineIndex)) {
          lineOperations.set(lineIndex, { action: 'remove' });
        }
      });
      
      // Apply all operations in reverse order
      const sortedOperations = Array.from(lineOperations.entries()).sort((a, b) => b[0] - a[0]);
      
      sortedOperations.forEach(([lineIndex, operation]) => {
        if (operation.action === 'remove') {
          modifiedLines.splice(lineIndex, 1);
        } else if (operation.action === 'replace') {
          modifiedLines[lineIndex] = operation.content;
        }
      });
      
      const modifiedContent = modifiedLines.join('\n');
      
      // Update stats
      this.stats.filesProcessed++;
      this.stats.totalReplacements += replacements.length;
      replacements.forEach(({ category }) => {
        this.stats.byCategory[category] = (this.stats.byCategory[category] || 0) + 1;
      });
      
      return {
        filePath,
        replacements,
        originalContent: content,
        modifiedContent,
        needsImport: needsLoggerImport && !hasLoggerImport,
        importStatement: needsLoggerImport && !hasLoggerImport ? importStatement : null
      };
      
    } catch (error) {
      console.error(`Error processing ${filePath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Display preview of changes
   */
  displayPreview(result) {
    const relPath = relative(Deno.cwd(), result.filePath);
    console.log(`\n${bold(blue(relPath))}`);
    
    if (result.needsImport) {
      console.log(green(`+ ${result.importStatement || 'import { Logger } from \'../core/Logger.js\';'}`));
    }
    
    // Track which lines we've already shown
    const shownLines = new Set();
    
    // Sort replacements by line number for better display
    const sortedReplacements = [...result.replacements].sort((a, b) => a.lineNumber - b.lineNumber);
    
    sortedReplacements.forEach(({ lineNumber, original, replacement, category, linesToRemove, linesToReplace, isDiagnostic }) => {
      // Skip if we've already shown these lines (for multi-line replacements)
      if (linesToReplace && linesToReplace.some(line => shownLines.has(line))) {
        return;
      }
      
      // Show lines that will be removed (from diagnostic if statements)
      if (linesToRemove && linesToRemove.length > 0) {
        linesToRemove.forEach(removeLineIndex => {
          if (!shownLines.has(removeLineIndex)) {
            const removeLine = result.originalContent.split('\n')[removeLineIndex];
            console.log(`  ${gray(`Line ${removeLineIndex + 1}:`)} ${red('[REMOVE]')}`);
            console.log(red(`-   ${removeLine.trim()}`));
            shownLines.add(removeLineIndex);
          }
        });
      }
      
      const label = isDiagnostic ? `[${category}] (diagnostic)` : `[${category}]`;
      console.log(`  ${gray(`Line ${lineNumber}:`)} ${yellow(label)}`);
      
      // Handle multi-line original display
      if (original.includes('\n')) {
        const originalLines = original.split('\n');
        originalLines.forEach((line, idx) => {
          if (idx === 0) {
            console.log(red(`-   ${line}`));
          } else {
            console.log(red(`    ${line}`));
          }
        });
      } else {
        console.log(red(`-   ${original.trim()}`));
      }
      
      console.log(green(`+   ${replacement.trim()}`));
      
      // Mark lines as shown
      if (linesToReplace) {
        linesToReplace.forEach(line => shownLines.add(line));
      } else {
        shownLines.add(lineNumber - 1);
      }
      
      // Show closing brace removal if applicable
      if (linesToRemove && linesToRemove.some(line => {
        const braceLine = result.originalContent.split('\n')[line];
        return braceLine && braceLine.trim() === '}';
      })) {
        linesToRemove.forEach(line => {
          const braceLine = result.originalContent.split('\n')[line];
          if (braceLine && braceLine.trim() === '}' && !shownLines.has(line)) {
            console.log(`  ${gray(`Line ${line + 1}:`)} ${red('[REMOVE]')}`);
            console.log(red(`-   ${braceLine.trim()}`));
            shownLines.add(line);
          }
        });
      }
    });
  }

  /**
   * Apply changes to file
   */
  async applyChanges(result) {
    try {
      await Deno.writeTextFile(result.filePath, result.modifiedContent);
      console.log(green(`✓ Updated ${relative(Deno.cwd(), result.filePath)}`));
    } catch (error) {
      console.error(red(`✗ Failed to update ${result.filePath}: ${error.message}`));
    }
  }

  /**
   * Process multiple files
   */
  async processFiles(patterns) {
    const results = [];
    
    for (const pattern of patterns) {
      // Check if it's a file or directory
      try {
        const stat = await Deno.stat(pattern);
        
        if (stat.isFile && pattern.endsWith('.js')) {
          const result = await this.processFile(pattern);
          if (result) results.push(result);
        } else if (stat.isDirectory) {
          // Walk directory for JS files
          for await (const entry of walk(pattern, {
            exts: ['js'],
            skip: [/node_modules/, /\.git/, /dist/, /build/]
          })) {
            if (entry.isFile) {
              const result = await this.processFile(entry.path);
              if (result) results.push(result);
            }
          }
        }
      } catch (error) {
        // Try glob pattern
        console.warn(`Could not process ${pattern}: ${error.message}`);
      }
    }
    
    return results;
  }

  /**
   * Display summary statistics
   */
  displaySummary() {
    console.log(`\n${bold('Summary:')}`);
    console.log(`Files processed: ${this.stats.filesProcessed}`);
    console.log(`Total replacements: ${this.stats.totalReplacements}`);
    
    if (Object.keys(this.stats.byCategory).length > 0) {
      console.log(`\n${bold('Replacements by category:')}`);
      for (const [category, count] of Object.entries(this.stats.byCategory)) {
        console.log(`  ${category}: ${count}`);
      }
    }
  }
}

// Main execution
async function main() {
  const args = parse(Deno.args, {
    boolean: ['apply', 'preview', 'help'],
    default: { preview: true }
  });

  if (args.help || args._.length === 0) {
    console.log(`
${bold('Console.log to Logger Replacement Tool')}

This tool helps replace console.log statements with categorized Logger calls.

${bold('Features:')}
  - Automatically categorizes logs based on content
  - Handles diagnostic logs wrapped with if (this.enableDiagnosticLogs)
  - Handles multi-line console statements (spanning multiple lines)
  - Adds Logger import when needed
  - Preserves indentation and formatting

${bold('Usage:')}
  deno run --allow-read --allow-write replace-console-logs.js [options] [files...]

${bold('Options:')}
  --preview    Show changes without applying them (default)
  --apply      Apply the changes to files
  --help       Show this help message

${bold('Examples:')}
  # Preview changes for all JS files in a directory
  deno run --allow-read replace-console-logs.js js/modules/

  # Apply changes to specific files
  deno run --allow-read --allow-write replace-console-logs.js --apply js/app.js

  # Process multiple files
  deno run --allow-read replace-console-logs.js js/app.js js/modules/ui/*.js

${bold('Categories:')}
  The tool automatically categorizes logs based on content:
  - connections: WebSocket, WebRTC connections
  - messages: Message passing between peers
  - parameters: Parameter changes
  - expressions: Chord and expression changes
  - performance: Latency, timing metrics
  - lifecycle: State changes, initialization
  - errors: Error messages
  - debug: Debug messages (includes all diagnostic logs)
  - parts: Part/instrument operations

${bold('Diagnostic Log Handling:')}
  The tool automatically detects and converts patterns like:
  - if (this.enableDiagnosticLogs) console.log(...) → Logger.log(..., 'debug')
  - Removes the if wrapper since Logger has its own filtering

${bold('Multi-line Console Statement Handling:')}
  The tool properly handles console statements that span multiple lines:
  - console.log(                    →  Logger.log(\`Multi-line
      \`Multi-line                      template literal\`, 'category');
      template literal\`
    );
  - Detects when statements don't close on the same line
  - Preserves arguments and formatting in the replacement
`);
    return;
  }

  const replacer = new ConsoleLogReplacer({ apply: args.apply });
  const results = await replacer.processFiles(args._);

  if (results.length === 0) {
    console.log('No console statements found to replace.');
    return;
  }

  // Show previews
  if (!args.apply) {
    console.log(bold('\nPreview mode - no files will be modified'));
    console.log('Use --apply to apply these changes\n');
  }

  for (const result of results) {
    replacer.displayPreview(result);
  }

  // Apply changes if requested
  if (args.apply) {
    console.log(`\n${bold('Applying changes...')}`);
    for (const result of results) {
      await replacer.applyChanges(result);
    }
  }

  // Show summary
  replacer.displaySummary();
}

// Run the script
if (import.meta.main) {
  main().catch(console.error);
}