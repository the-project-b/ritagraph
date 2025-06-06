// Debug script to inspect MCP type details for employee types
import client from '../../mcp/client.js';

async function debugTypeDetails() {
  console.log('🔍 DEBUGGING TYPE DETAILS GATHERING...\n');
  
  try {
    // Get available MCP tools
    const mcpTools = await client.getTools();
    console.log(`📦 Available MCP tools: ${mcpTools.map(t => t.name).join(', ')}\n`);
    
    // Find the type details tool
    const typeDetailsTool = mcpTools.find(t => t.name === 'graphql-get-type-details');
    if (!typeDetailsTool) {
      console.error('❌ graphql-get-type-details tool not found');
      return;
    }
    
    console.log('🎯 Testing specific employee types that cause "name" field errors...\n');
    
    // Test the exact types mentioned in the error
    const typeNames = 'EmployeeAdvancedFilterForHrEmployees,EmployeeAdvancedFilterForHr';
    console.log(`📋 Requesting type details for: ${typeNames}\n`);
    
    const result = await typeDetailsTool.invoke({
      typeNames: typeNames,
      includeRelatedTypes: true
    });
    
    console.log('📄 RAW RESULT FROM MCP TOOL:');
    console.log('='.repeat(80));
    console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    console.log('='.repeat(80));
    
    // Try to extract the LLM guidance like the query agent does
    console.log('\n🤖 EXTRACTING LLM GUIDANCE (like query agent does)...\n');
    
    const typeOutput = typeof result === 'string' ? result : JSON.stringify(result);
    
    // Extract LLM Guidance section
    const llmGuidanceMatch = typeOutput.match(/🤖 \*\*LLM QUERY GENERATION GUIDANCE\*\*([\s\S]*?)(?=================|📊 \*\*Pattern Analysis)/);
    if (llmGuidanceMatch) {
      console.log('✅ LLM GUIDANCE FOUND:');
      console.log('-'.repeat(50));
      console.log(llmGuidanceMatch[1].trim());
      console.log('-'.repeat(50));
    } else {
      console.log('❌ No LLM guidance found in response');
    }
    
    // Extract Pattern Analysis JSON
    const patternMatch = typeOutput.match(/"Pattern Analysis:"[\s\S]*?(\{[\s\S]*?\})/);
    if (patternMatch) {
      try {
        const patterns = JSON.parse(patternMatch[1]);
        console.log('\n✅ STRUCTURED PATTERNS FOUND:');
        console.log('-'.repeat(50));
        console.log('📊 Scalar Fields:', patterns.scalarFields);
        console.log('⚠️ Complex Fields:', patterns.complexFields);
        console.log('🏷️ Common Fields:', patterns.commonFields);
        console.log('-'.repeat(50));
      } catch (parseError) {
        console.log('❌ Failed to parse pattern analysis:', parseError.message);
      }
    } else {
      console.log('❌ No pattern analysis found in response');
    }
    
    // Look for specific field information about EmployeeAdvancedFilterForHrEmployees
    console.log('\n🔍 LOOKING FOR SPECIFIC FIELD INFO...\n');
    
    if (typeOutput.includes('EmployeeAdvancedFilterForHrEmployees')) {
      console.log('✅ Found EmployeeAdvancedFilterForHrEmployees in response');
      
      // Extract the section about this specific type
      const typeSection = typeOutput.match(/EmployeeAdvancedFilterForHrEmployees[\s\S]*?(?=\n\n|=====)/);
      if (typeSection) {
        console.log('📋 Type Section:');
        console.log('-'.repeat(50));
        console.log(typeSection[0]);
        console.log('-'.repeat(50));
        
        // Check if firstName and lastName are mentioned
        const hasFirstName = typeSection[0].includes('firstName');
        const hasLastName = typeSection[0].includes('lastName');
        const hasNameField = typeSection[0].includes('name:') && !typeSection[0].includes('firstName') && !typeSection[0].includes('lastName');
        
        console.log('🔍 Field Analysis:');
        console.log(`   firstName mentioned: ${hasFirstName ? '✅' : '❌'}`);
        console.log(`   lastName mentioned: ${hasLastName ? '✅' : '❌'}`);
        console.log(`   generic "name" field mentioned: ${hasNameField ? '⚠️ PROBLEM!' : '✅ Good'}`);
      }
    } else {
      console.log('❌ EmployeeAdvancedFilterForHrEmployees not found in response');
    }
    
  } catch (error) {
    console.error('❌ Error during debugging:', error);
  }
}

// Run the debug
debugTypeDetails().catch(console.error); 