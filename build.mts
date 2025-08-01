#!/usr/bin/env tsx
import { execSync } from 'child_process';
import { existsSync } from 'fs';

console.log('🔨 Running LangChain Cloud pre-build script...');

const rootDir = '/deps/ritagraph';
const packagesDir = '/deps/packages';

// Check if we're in the right directory
if (!existsSync(`${rootDir}/turbo.json`)) {
  console.error('❌ turbo.json not found at', rootDir);
  process.exit(1);
}

// Check if packages were copied by dockerfile_lines
if (!existsSync(packagesDir)) {
  console.error('❌ packages not found at', packagesDir);
  process.exit(1);
}

try {
  // Copy packages back to their expected workspace location
  console.log('📋 Setting up workspace packages...');
  execSync(`cp -r ${packagesDir} ${rootDir}/`, {
    stdio: 'inherit'
  });
  
  // Build packages using workspace commands from the main project directory
  console.log('📦 Building projectb-graphql package...');
  execSync('npm run build --workspace=@the-project-b/projectb-graphql', {
    stdio: 'inherit',
    cwd: rootDir
  });

  console.log('🔧 Running codegen for rita-graphs...');
  execSync('npm run codegen --workspace=@the-project-b/rita-graphs', {
    stdio: 'inherit',
    cwd: rootDir
  });

  console.log('📦 Building rita-graphs package...');
  execSync('npm run build --workspace=@the-project-b/rita-graphs', {
    stdio: 'inherit',
    cwd: rootDir
  });

  console.log('✅ All packages built successfully!');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}