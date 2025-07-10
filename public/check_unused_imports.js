#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Function to extract imports from a file
function extractImports(content) {
  const imports = [];
  const importRegex = /import\s+(?:{([^}]+)}|([^{}\s]+))\s+from\s+['"]([^'"]+)['"]/g;
  const namedImportRegex = /import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g;
  const defaultImportRegex = /import\s+([^{}\s]+)\s+from\s+['"]([^'"]+)['"]/g;
  
  let match;
  
  // Extract named imports
  content.replace(namedImportRegex, (fullMatch, names, source) => {
    const importNames = names.split(',').map(n => n.trim()).filter(n => n);
    importNames.forEach(name => {
      // Handle 'as' aliases
      const parts = name.split(/\s+as\s+/);
      const originalName = parts[0].trim();
      const aliasName = parts[1] ? parts[1].trim() : originalName;
      imports.push({
        name: originalName,
        alias: aliasName,
        source,
        type: 'named'
      });
    });
    return fullMatch;
  });
  
  // Extract default imports
  content.replace(defaultImportRegex, (fullMatch, name, source) => {
    if (!source.includes('{')) { // Make sure it's not a named import
      imports.push({
        name: name.trim(),
        alias: name.trim(),
        source,
        type: 'default'
      });
    }
    return fullMatch;
  });
  
  // Extract mixed imports (default + named)
  const mixedImportRegex = /import\s+([^{}\s,]+)\s*,\s*{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g;
  content.replace(mixedImportRegex, (fullMatch, defaultName, namedImports, source) => {
    imports.push({
      name: defaultName.trim(),
      alias: defaultName.trim(),
      source,
      type: 'default'
    });
    
    const names = namedImports.split(',').map(n => n.trim()).filter(n => n);
    names.forEach(name => {
      const parts = name.split(/\s+as\s+/);
      const originalName = parts[0].trim();
      const aliasName = parts[1] ? parts[1].trim() : originalName;
      imports.push({
        name: originalName,
        alias: aliasName,
        source,
        type: 'named'
      });
    });
    return fullMatch;
  });
  
  return imports;
}

// Function to check if an import is used in the file
function isImportUsed(content, importInfo) {
  // Remove import statements from content to avoid false positives
  const contentWithoutImports = content.replace(/import\s+.*?from\s+['"].*?['"]\s*;?/gs, '');
  
  // Create regex to find usage
  const escapedAlias = importInfo.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Look for various usage patterns
  const patterns = [
    `\\b${escapedAlias}\\b(?!['\"])`, // Word boundary, not in quotes
    `\\b${escapedAlias}\\.`, // Object property access
    `\\b${escapedAlias}\\(`, // Function call
    `\\b${escapedAlias}\\[`, // Array/object access
    `new\\s+${escapedAlias}\\b`, // Constructor
    `extends\\s+${escapedAlias}\\b`, // Class extension
    `<${escapedAlias}\\b`, // JSX component
    `\\{\\s*${escapedAlias}\\s*\\}`, // Object shorthand
    `:\\s*${escapedAlias}\\b`, // Type annotation or object value
  ];
  
  const usageRegex = new RegExp(patterns.join('|'), 'g');
  return usageRegex.test(contentWithoutImports);
}

// Function to analyze a single file
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const imports = extractImports(content);
  const unusedImports = [];
  
  imports.forEach(importInfo => {
    if (!isImportUsed(content, importInfo)) {
      unusedImports.push(importInfo);
    }
  });
  
  return {
    filePath,
    imports,
    unusedImports
  };
}

// Function to find all JS files in a directory
function findJSFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
      findJSFiles(filePath, fileList);
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// Main function
function main() {
  const targetDirs = [
    '/Users/capo_greco/Documents/string.assembly.fm/public/js/apps',
    '/Users/capo_greco/Documents/string.assembly.fm/public/js/modules'
  ];
  
  console.log('Checking for unused imports...\n');
  
  let totalUnused = 0;
  const results = [];
  
  targetDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      const files = findJSFiles(dir);
      
      files.forEach(file => {
        const result = analyzeFile(file);
        if (result.unusedImports.length > 0) {
          results.push(result);
          totalUnused += result.unusedImports.length;
        }
      });
    }
  });
  
  // Display results
  if (results.length === 0) {
    console.log('✓ No unused imports found!');
  } else {
    results.forEach(({ filePath, unusedImports }) => {
      console.log(`\n${filePath}:`);
      unusedImports.forEach(imp => {
        console.log(`  - ${imp.name}${imp.alias !== imp.name ? ` (as ${imp.alias})` : ''} from '${imp.source}'`);
      });
    });
    
    console.log(`\n\nTotal unused imports found: ${totalUnused}`);
  }
}

// Run the script
main();