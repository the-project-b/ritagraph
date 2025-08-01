#!/usr/bin/env tsx
import { execSync } from 'child_process';
import { existsSync } from 'fs';

console.log('🔨 Running LangChain Cloud pre-build script...');

const rootDir = '/deps/ritagraph';

// Check if we're in the right directory
if (!existsSync(`${rootDir}/turbo.json`)) {
  console.error('❌ turbo.json not found at', rootDir);
  process.exit(1);
}

try {
  // Build packages in correct order using Turbo
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