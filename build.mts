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
  // Build projectb-graphql package directly
  console.log('📦 Building projectb-graphql package...');
  execSync('npm run build', {
    stdio: 'inherit',
    cwd: `${packagesDir}/projectb-graphql`
  });

  // Run codegen for rita-graphs package directly
  console.log('🔧 Running codegen for rita-graphs...');
  execSync('npm run codegen', {
    stdio: 'inherit',
    cwd: `${packagesDir}/rita-graphs`
  });

  // Build rita-graphs package directly
  console.log('📦 Building rita-graphs package...');
  execSync('npm run build', {
    stdio: 'inherit',
    cwd: `${packagesDir}/rita-graphs`
  });

  // Copy built packages back to node_modules location where rita app expects them
  console.log('📋 Copying built packages to node_modules...');
  execSync(`cp -r ${packagesDir}/projectb-graphql/dist ${rootDir}/node_modules/@the-project-b/projectb-graphql/`, {
    stdio: 'inherit'
  });
  
  execSync(`cp -r ${packagesDir}/rita-graphs/dist ${rootDir}/node_modules/@the-project-b/rita-graphs/`, {
    stdio: 'inherit'
  });

  console.log('✅ All packages built and copied successfully!');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}