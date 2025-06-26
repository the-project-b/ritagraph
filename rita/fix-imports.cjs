const fs = require('fs');
const path = require('path');

function resolveImportPath(importPath, currentFilePath) {
  // Resolve the import path relative to the current file
  const currentDir = path.dirname(currentFilePath);
  const resolvedPath = path.resolve(currentDir, importPath);
  return resolvedPath;
}

function checkIfPathExists(importPath, currentFilePath) {
  const resolvedPath = resolveImportPath(importPath, currentFilePath);
  
  // Check if it's a file with .ts extension
  if (fs.existsSync(resolvedPath + '.ts')) {
    return { exists: true, isFile: true, actualPath: resolvedPath + '.ts' };
  }
  
  // Check if it's a file with .js extension
  if (fs.existsSync(resolvedPath + '.js')) {
    return { exists: true, isFile: true, actualPath: resolvedPath + '.js' };
  }
  
  // Check if it's a directory
  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
    return { exists: true, isFile: false, actualPath: resolvedPath };
  }
  
  // Check if it's a directory with index.ts
  if (fs.existsSync(path.join(resolvedPath, 'index.ts'))) {
    return { exists: true, isFile: false, actualPath: resolvedPath };
  }
  
  // Check if it's a directory with index.js
  if (fs.existsSync(path.join(resolvedPath, 'index.js'))) {
    return { exists: true, isFile: false, actualPath: resolvedPath };
  }
  
  return { exists: false, isFile: null, actualPath: resolvedPath };
}

function fixImportsInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let result = content;
  
  // Handle "from" imports (including multiline): } from "path" or import { something } from "path"
  result = result.replace(/from\s+['"](\.[^'"]*?)['"];?/g, (match, importPath) => {
    // Skip node_modules and already processed files
    if (importPath.includes('node_modules') || importPath.endsWith('.js')) {
      return match;
    }
    
    return fixImportPath(importPath, filePath, match);
  });
  
  // Handle bare imports: import "path"
  result = result.replace(/import\s+['"](\.[^'"]*?)['"];?/g, (match, importPath) => {
    // Skip node_modules and already processed files
    if (importPath.includes('node_modules') || importPath.endsWith('.js')) {
      return match;
    }
    
    return fixImportPath(importPath, filePath, match);
  });
  
  if (result !== content) {
    fs.writeFileSync(filePath, result);
    console.log('Fixed imports in:', filePath);
    return true;
  }
  return false;
}

function fixImportPath(importPath, filePath, match) {
  // Check filesystem
  const pathInfo = checkIfPathExists(importPath, filePath);
  
  // Check if the last part (after last /) has a file extension
  const lastPart = importPath.split('/').pop();
  const hasFileExtension = lastPart && lastPart.includes('.') && !lastPart.startsWith('.');
  
  if (hasFileExtension) {
    // Replace existing extension with .js
    const newPath = importPath.replace(/\.[^/.]+$/, '.js');
    return match.replace(importPath, newPath);
  } else if (pathInfo.exists) {
    // Use filesystem info - this is the ACTUAL truth
    const newPath = pathInfo.isFile ? importPath + '.js' : importPath + '/index.js';
    return match.replace(importPath, newPath);
  } else {
    // Path doesn't exist - check if the resolved path (without extension) is a directory
    const resolvedPath = resolveImportPath(importPath, filePath);
    
    // Check if it's a directory that exists
    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
      const newPath = importPath + '/index.js';
      console.log(`  → Filesystem check: "${importPath}" is a directory → ${newPath}`);
      return match.replace(importPath, newPath);
    } else {
      // Default to treating as file
      const newPath = importPath + '.js';
      console.log(`  → Filesystem check: "${importPath}" not found, treating as file → ${newPath}`);
      return match.replace(importPath, newPath);
    }
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  let fixedCount = 0;
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      fixedCount += walkDir(filePath);
    } else if (file.endsWith('.ts')) {
      if (fixImportsInFile(filePath)) {
        fixedCount++;
      }
    }
  });
  
  return fixedCount;
}

console.log('Fixing TypeScript imports to include .js extensions...');
const fixedCount = walkDir('./src');
console.log(`Import fixing complete! Fixed ${fixedCount} files.`); 