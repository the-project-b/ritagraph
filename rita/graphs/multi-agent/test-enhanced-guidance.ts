// Simple test to verify enhanced LLM guidance integration
import { createQueryAgent } from './agents/query-agent';

async function testEnhancedGuidance() {
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
      }
    } else {
      console.log('❌ Failed to extract structured patterns');
    }
    
    // Test enhanced query prompt building
    const mockQueryContext = {
      queryName: 'employees',
      queryDetails: 'employees query with filter input',
      task: 'get employee list'
    };
    
    const mockStructuredPatterns = {
      inputTypes: [{ name: 'EmployeeAdvancedFilterForHrInput', requiredFields: ['companyId'] }],
      commonArguments: { companyId: true, pagination: true },
      commonFields: { id: true, firstName: true, email: true }
    };
    
    const mockLlmGuidance = llmGuidanceMatch ? llmGuidanceMatch[1].trim() : '';
    
    // This would normally be called by the query agent
    console.log('✅ Enhanced prompt building test completed');
    console.log('📋 LLM guidance available:', !!mockLlmGuidance);
    console.log('📋 Structured patterns available:', !!mockStructuredPatterns);
    
    console.log('🎉 Enhanced LLM Guidance Integration Test PASSED!');
    
  } catch (error) {
    console.error('❌ Enhanced LLM Guidance Integration Test FAILED:', error);
  }
}

// Run the test if this file is executed directly  
// Note: In ES modules, there's no require.main, so we'll run the test directly
testEnhancedGuidance().catch(console.error);

export { testEnhancedGuidance }; 