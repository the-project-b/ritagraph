// Utility functions for testing and debugging the multi-agent system
import { createQueryAgent } from '../agents/query-agent';
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import client from '../../../mcp/client.js';

/**
 * Test enhanced LLM guidance integration
 */
export async function testEnhancedGuidance(): Promise<boolean> {
  console.log('🧪 Testing Enhanced LLM Guidance Integration...');
  
  try {
    const queryAgent = await createQueryAgent();
    
    // Mock type details result with enhanced MCP response
    const mockTypeDetailsResult = {
      output: `
🤖 **LLM QUERY GENERATION GUIDANCE**

**Query Structure for employees:**
\`\`\`graphql
query {
  employees(data: {
    companyId: "{{auto_companyid}}",
    conditionType: AND,
    pagination: { limit: 20, currentPage: 1 }
  }) {
    employees {
      id
      firstName
      lastName
      email
      status
    }
    pagination {
      totalItems
      currentPage
      limit
    }
  }
}
\`\`\`

⚙️ **ARGUMENT TEMPLATES:**

🔸 **EmployeeAdvancedFilterForHrInput:**
\`\`\`json
{
  "companyId": "{{auto_companyid}}",
  "conditionType": "AND",
  "pagination": {
    "limit": 20,
    "page": 1
  }
}
\`\`\`

🏷️ **FIELD SELECTION GUIDANCE:**
• **Safe Scalar Fields:** id, firstName, lastName, email, status, jobTitle
• **Avoid Complex Fields:** dataStatus, events, incomeComponents, contractData

💡 **ERROR PREVENTION:**
• Always include companyId: "{{auto_companyid}}" in filter arguments
• Include pagination: { limit: 20, currentPage: 1 } for paginated queries
• Use only scalar fields or provide proper subselection for complex fields

================================================================================

📊 **Pattern Analysis:**
{
  "inputTypes": [
    {
      "name": "EmployeeAdvancedFilterForHrInput",
      "isFilter": true,
      "requiredFields": ["companyId", "conditionType", "pagination"]
    }
  ],
  "commonArguments": {
    "companyId": true,
    "conditionType": true,
    "pagination": true
  },
  "commonFields": {
    "id": true,
    "firstName": true,
    "lastName": true,
    "email": true,
    "status": true
  }
}
`
    };
    
    // Test LLM guidance extraction
    const typeOutput = typeof mockTypeDetailsResult.output === 'string' 
      ? mockTypeDetailsResult.output 
      : JSON.stringify(mockTypeDetailsResult.output);
    
    // Extract LLM Guidance section
    const llmGuidanceMatch = typeOutput.match(/🤖 \*\*LLM QUERY GENERATION GUIDANCE\*\*([\s\S]*?)(?=================|📊 \*\*Pattern Analysis)/);
    
    if (llmGuidanceMatch) {
      const llmGuidance = llmGuidanceMatch[1].trim();
      console.log('✅ Successfully extracted LLM guidance:');
      console.log('📄 Length:', llmGuidance.length, 'characters');
      console.log('📋 Contains query template:', llmGuidance.includes('query {'));
      console.log('📋 Contains argument templates:', llmGuidance.includes('ARGUMENT TEMPLATES'));
      console.log('📋 Contains field guidance:', llmGuidance.includes('FIELD SELECTION GUIDANCE'));
      console.log('📋 Contains error prevention:', llmGuidance.includes('ERROR PREVENTION'));
    } else {
      console.log('❌ Failed to extract LLM guidance');
      return false;
    }
    
    // Extract Pattern Analysis JSON
    const patternMatch = typeOutput.match(/"Pattern Analysis:"[\s\S]*?(\{[\s\S]*?\})/);
    if (patternMatch) {
      try {
        const structuredPatterns = JSON.parse(patternMatch[1]);
        console.log('✅ Successfully extracted structured patterns:');
        console.log('📊 Input types:', structuredPatterns.inputTypes?.length || 0);
        console.log('📊 Common arguments:', Object.keys(structuredPatterns.commonArguments || {}).length);
        console.log('📊 Common fields:', Object.keys(structuredPatterns.commonFields || {}).length);
      } catch (parseError) {
        console.log('❌ Failed to parse structured patterns:', parseError.message);
        return false;
      }
    } else {
      console.log('❌ Failed to extract structured patterns');
      return false;
    }
    
    console.log('🎉 Enhanced LLM Guidance Integration Test PASSED!');
    return true;
    
  } catch (error) {
    console.error('❌ Enhanced LLM Guidance Integration Test FAILED:', error);
    return false;
  }
}

/**
 * Test strict prompting to prevent LLM from generating non-existent field names
 */
export async function testStrictPrompting(): Promise<boolean> {
  console.log('🧪 Testing strict prompting to prevent non-existent field generation...\n');
  
  const model = new ChatOpenAI({
    model: "gpt-4",
    temperature: 0,
  });
  
  // Simulate the exact type details the LLM would receive
  const typeDetails = `
✅ **Safe Scalar Fields:** birthday, contractEnd, contractId, contractStart, createdAt, email, firstName, id, incomeSum, jobTitle, lastContractDate, lastIncome, lastName, personalNumber, personalNumberPayroll

📦 **OBJECT** EmployeeAdvancedFilterForHrEmployees
📋 **Fields:**
  • **firstName**: String (The users first name)
  • **lastName**: String (The users last name)  
  • **email**: String! (User email)
  • **jobTitle**: String (Employee job title)
  • **id**: ID!
  • **status**: UserStatus! (User status)
  • **birthday**: DateTime (Employee birthday date)
  • **contractStart**: DateTime (Employee contract start date)
  • **contractEnd**: DateTime (Employee contract end date)
`;

  const strictPrompt = `🚨 CRITICAL: Generate a GraphQL query using ONLY the exact field names provided in the schema analysis below.

Query: "employees"
Task: Get employee information

${typeDetails}

⚠️ FIELD USAGE RULES:
1. Use ONLY the field names explicitly listed in the type definitions above
2. DO NOT invent or assume field names (like "name", "position", "department")
3. DO NOT use common field names unless they appear in the schema
4. If you're unsure about a field name, omit it entirely

🎯 CRITICAL EXECUTION RULES:
1. Use ONLY field names that appear in the "Safe Scalar Fields" or type definitions above
2. DO NOT use: "name", "position", "department", or any other fields not explicitly shown
3. Generate ONLY the GraphQL query (no explanations)

REMINDER: The schema shows exact field names like "firstName", "lastName", "jobTitle" - use these EXACTLY as shown.

Generate a query for employees with basic information:`;

  try {
    console.log('📤 Sending strict prompt to LLM...\n');
    
    const response = await model.invoke([new HumanMessage(strictPrompt)]);
    
    const generatedQuery = typeof response.content === 'string' 
      ? response.content.trim()
      : JSON.stringify(response.content);
    
    console.log('📥 LLM Generated Query:');
    console.log('─'.repeat(50));
    console.log(generatedQuery);
    console.log('─'.repeat(50));
    
    // Analyze the generated query for problematic fields
    console.log('\n🔍 Field Analysis:');
    
    const problematicFields = [
      'name',      // Should be firstName/lastName
      'position',  // Should be jobTitle  
      'department' // Doesn't exist
    ];
    
    const allowedFields = [
      'firstName', 'lastName', 'email', 'jobTitle', 'id', 'status', 
      'birthday', 'contractStart', 'contractEnd', 'createdAt', 
      'incomeSum', 'lastIncome', 'personalNumber'
    ];
    
    let hasProblems = false;
    
    problematicFields.forEach(field => {
      if (generatedQuery.includes(field)) {
        console.log(`❌ Found problematic field: "${field}"`);
        hasProblems = true;
      } else {
        console.log(`✅ Good: No "${field}" field generated`);
      }
    });
    
    // Check if it uses correct field names
    const correctFieldsUsed = allowedFields.filter(field => 
      generatedQuery.includes(field)
    );
    
    console.log(`\n📊 Summary:`);
    console.log(`✅ Correct fields used: ${correctFieldsUsed.join(', ')}`);
    console.log(`${hasProblems ? '❌' : '✅'} Overall result: ${hasProblems ? 'FAILED - Still generating invalid fields' : 'SUCCESS - Only valid fields used'}`);
    
    return !hasProblems;
    
  } catch (error) {
    console.error('❌ Error during test:', error);
    return false;
  }
}

/**
 * Debug type details gathering for specific types
 */
export async function debugTypeDetails(typeNames: string = 'EmployeeAdvancedFilterForHrEmployees,EmployeeAdvancedFilterForHr'): Promise<void> {
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
    
    console.log(`🎯 Testing specific employee types: ${typeNames}\n`);
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

/**
 * Run all test utilities
 */
export async function runAllTests(): Promise<void> {
  console.log('🚀 Running all multi-agent system tests...\n');
  
  const results = {
    enhancedGuidance: await testEnhancedGuidance(),
    strictPrompting: await testStrictPrompting(),
  };
  
  console.log('\n📊 TEST RESULTS SUMMARY:');
  console.log('─'.repeat(50));
  console.log(`Enhanced Guidance: ${results.enhancedGuidance ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Strict Prompting: ${results.strictPrompting ? '✅ PASS' : '❌ FAIL'}`);
  console.log('─'.repeat(50));
  
  const passedTests = Object.values(results).filter(Boolean).length;
  const totalTests = Object.keys(results).length;
  
  console.log(`\n🎯 Overall: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests PASSED!');
  } else {
    console.log('⚠️ Some tests FAILED - check output above for details');
  }
} 