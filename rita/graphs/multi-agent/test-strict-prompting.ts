// Test script to verify strict prompting prevents LLM from generating non-existent field names
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";

async function testStrictPrompting() {
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
    
  } catch (error) {
    console.error('❌ Error during test:', error);
  }
}

// Run the test
testStrictPrompting().catch(console.error); 