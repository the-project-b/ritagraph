#!/usr/bin/env tsx
import { execSync } from 'child_process';
import { existsSync } from 'fs';

console.log('🔨 Running LangChain Cloud pre-build script...');

const rootDir = '/deps/ritagraph';

// Check if we're in the right directory with full monorepo
if (!existsSync(`${rootDir}/turbo.json`)) {
  console.error('❌ turbo.json not found at', rootDir);
  process.exit(1);
}

if (!existsSync(`${rootDir}/packages`)) {
  console.error('❌ packages directory not found at', rootDir);
  process.exit(1);
}

try {
  // Use Turbo to build packages in the correct dependency order
  console.log('📦 Building all packages with Turbo...');
  execSync('npm run build', {
    stdio: 'inherit',
    cwd: rootDir
  });

  console.log('✅ All packages built successfully with Turbo!');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}