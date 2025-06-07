#!/usr/bin/env tsx
// Test runner for multi-agent system utilities
import { runAllTests, testEnhancedGuidance, testStrictPrompting, debugTypeDetails } from './utils/test-utilities.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Run all tests by default
    await runAllTests();
  } else {
    const command = args[0];
    
    switch (command) {
      case 'all':
        await runAllTests();
        break;
      case 'guidance':
        await testEnhancedGuidance();
        break;
      case 'prompting':
        await testStrictPrompting();
        break;
      case 'debug':
        const typeNames = args[1] || 'EmployeeAdvancedFilterForHrEmployees,EmployeeAdvancedFilterForHr';
        await debugTypeDetails(typeNames);
        break;
      default:
        console.log('Usage: tsx run-tests.ts [all|guidance|prompting|debug] [typeNames]');
        console.log('');
        console.log('Commands:');
        console.log('  all        - Run all tests (default)');
        console.log('  guidance   - Test enhanced LLM guidance');
        console.log('  prompting  - Test strict prompting');
        console.log('  debug      - Debug type details (optionally specify typeNames)');
        process.exit(1);
    }
  }
}

main().catch(console.error); 