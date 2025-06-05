import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { Task } from "../types";
import client from "../../../mcp/client.js";
import { placeholderManager } from "../../../placeholders/manager";
import { MergedAnnotation } from "../../../states/states";
// Import placeholders to ensure they are registered
import "../../../placeholders/index.js";

/**
 * Creates a query agent that uses MCP tools to execute query tasks
 */
export async function createQueryAgent() {
  // Get available MCP tools
  const mcpTools = await client.getTools();
  console.log(
    `Dynamic Graph: Loaded ${mcpTools.length} MCP tools: ${mcpTools
      .map((tool) => tool.name)
      .join(", ")}`
  );

  const queryTools = mcpTools.filter(tool => 
    tool.name.includes('graphql-list-queries') ||
    tool.name.includes('graphql-get-query-details') ||
    tool.name.includes('graphql-get-query-type-details') || 
    tool.name.includes('execute-query')
  );

  // Create LLM with tools bound
  const model = new ChatOpenAI({
    model: "gpt-4",
    temperature: 0,
  }).bindTools(queryTools);

  return {
    /**
     * Executes a query task using appropriate MCP tools
     */
    async executeTask(task: Task, state: typeof MergedAnnotation.State, config: any) {
      try {
        // Extract access token from state or config (same logic as toolNode.ts)
        const authUser =
          (config as any)?.user ||
          (config as any)?.langgraph_auth_user ||
          ((config as any)?.configurable && (config as any).configurable.langgraph_auth_user);
        const authAccessToken = authUser?.token;
        
        // Use state accessToken if available, otherwise fall back to auth token
        const accessToken = state.accessToken || authAccessToken;
        
        console.log("Query Agent - Using accessToken from:", state.accessToken ? "state" : "auth config");
        console.log("Query Agent - Access token available:", !!accessToken);

        // First, get list of available queries
        const listQueriesTool = queryTools.find(t => t.name === 'graphql-list-queries');
        if (!listQueriesTool) {
          throw new Error('graphql-list-queries tool not found');
        }

        const listQueriesArgs = accessToken ? { accessToken } : {};
        const queriesList = await listQueriesTool.invoke(listQueriesArgs);
        console.log('Available queries:', queriesList);

        // Ask LLM to analyze the task and determine the execution plan
        const planningPrompt = `You are a query planning assistant. Your job is to analyze the task and create an execution plan.

Task: ${task.description}

Available queries:
${JSON.stringify(queriesList, null, 2)}

Available tools:
${queryTools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

Please analyze the task and create an execution plan. The plan should:
1. Select the most appropriate query for the task
2. Determine which tools to use and in what order
3. Specify what information we need to gather at each step

Respond with a JSON object in this format:
{
  "selectedQuery": "name of the most appropriate query",
  "reasoning": "explanation of why this query was selected",
  "executionPlan": [
    {
      "tool": "tool name",
      "purpose": "what this tool will be used for",
      "expectedInput": "what input this tool needs",
      "expectedOutput": "what output we expect"
    }
  ]
}`;

        const planningResponse = await model.invoke([
          new HumanMessage(planningPrompt)
        ]);

        // Extract the execution plan
        let plan;
        try {
          const content = typeof planningResponse.content === 'string' 
            ? planningResponse.content 
            : JSON.stringify(planningResponse.content);
          plan = JSON.parse(content);
        } catch (error) {
          console.error('Failed to parse planning response:', error);
          throw new Error('Failed to create execution plan');
        }

        console.log('Execution plan:', plan);

        // Execute the plan step by step
        interface ExecutionResult {
          step: string;
          input: Record<string, any>;
          output: any;
        }
        const results: ExecutionResult[] = [];
        for (const step of plan.executionPlan) {
          const tool = queryTools.find(t => t.name === step.tool);
          if (!tool) {
            throw new Error(`Tool ${step.tool} not found`);
          }

          // Ask LLM to prepare the input for this step
          const inputPrompt = `Prepare input for the ${step.tool} tool.

Purpose: ${step.purpose}
Expected Input: ${step.expectedInput}
Previous Results: ${JSON.stringify(results, null, 2)}

Tool Schema:
${JSON.stringify(tool.schema || {}, null, 2)}

IMPORTANT: You must provide a tool call with arguments that match the schema exactly.
For example, if the schema requires 'queryNames' as a string, provide it like this:
{
  "queryNames": "name1,name2"
}

If this is a type details step, analyze the previous query details result to extract type names.
For example, if you see "EmployeeAdvancedFilterForHrInput" and "EmployeeAdvancedFilterForHr" in the previous result,
provide them as typeNames like this:
{
  "typeNames": "EmployeeAdvancedFilterForHrInput,EmployeeAdvancedFilterForHr"
}

If this is an execute-query step, construct a valid GraphQL query string based on the type details and task description.
For example, if you see type details showing required fields and available fields, construct a query like this:
{
  "query": "query { employees(data: { companyId: \"{{auto_companyid}}\", conditionType: AND, pagination: { limit: 20, page: 1 } }) { data { id name email } total page limit } }"
}

Please provide the input parameters that match the schema exactly.`;

          const inputResponse = await model.invoke([
            new HumanMessage(inputPrompt)
          ]);

          let toolArgs;
          if (inputResponse.tool_calls?.length) {
            toolArgs = inputResponse.tool_calls[0].args;
          } else {
            // For type details step, try to extract type names from previous result
            if (step.tool === 'graphql-get-query-type-details' && results.length > 0) {
              const lastResult = results[results.length - 1].output;
              const allTypeNames = extractTypeNames(lastResult);
              
              if (allTypeNames) {
                toolArgs = { typeNames: allTypeNames };
                console.log('Requesting type details for:', allTypeNames);
              } else {
                throw new Error(`Could not extract type names from previous result: ${JSON.stringify(lastResult)}`);
              }
            } else if (step.tool === 'execute-query' && results.length > 0) {
              // Ask LLM to construct the query
              const queryPrompt = `Construct a valid GraphQL query based on the following information:

Task Description: ${task.description}

Type Details:
${JSON.stringify(results[results.length - 1].output, null, 2)}

CRITICAL REQUIREMENTS:
1. Use the correct query name (employees)
2. Include ALL required fields marked with '!' in the input:
   - companyId: String! → Use "{{auto_companyid}}"
   - conditionType: AdvancedFilterConditionType! → Use AND (without quotes)
   - pagination: PaginationInputData! → Use { limit: 20, page: 1 }
3. The return type has nested structure - EmployeeAdvancedFilterForHr contains:
   - employees: [EmployeeAdvancedFilterForHrEmployees!]! → Request employee fields INSIDE employees { }
   - pagination: PaginationData! → Request pagination fields at top level
4. Format the query properly with correct GraphQL syntax
5. Ensure the query is complete with all opening and closing braces, quotes, and parentheses
6. IMPORTANT: For enum values (like conditionType), do NOT use quotes. Use: conditionType: AND, not conditionType: "AND"

REQUIRED QUERY STRUCTURE:
query { 
  employees(data: { 
    companyId: "{{auto_companyid}}", 
    conditionType: AND, 
    pagination: { limit: 20, page: 1 } 
  }) { 
    employees {
      // Employee fields go here (id, name, email, etc.)
    }
    pagination {
      // Pagination fields go here (page, limit, total, etc.)
    }
  } 
}

CRITICAL: You must return a COMPLETE GraphQL query. Do not truncate or cut off the query.
IMPORTANT: Respond with ONLY the complete GraphQL query string, no explanations or additional text.

Your complete query:`;

              const queryResponse = await model.invoke([
                new HumanMessage(queryPrompt)
              ]);

              let query = typeof queryResponse.content === 'string' 
                ? queryResponse.content.trim()
                : JSON.stringify(queryResponse.content);

              console.log('Raw LLM response:', query);

              // Extract the query from the response - look for complete query patterns
              let extractedQuery = query;
              
              // Try different patterns to extract the query - improved patterns for better matching
              const patterns = [
                // Most comprehensive pattern - looks for complete nested structure
                /query\s*\{\s*\w+\([^)]*\)\s*\{[^{}]*\{[^{}]*\}[^{}]*\}\s*\}/g,
                // Pattern for queries with nested objects but simpler structure
                /query\s*\{\s*\w+\([^)]*\)\s*\{[^{}]+\}\s*\}/g,
                // Basic pattern with any content inside braces
                /query\s*\{[^{}]*\{[^{}]*\}[^{}]*\}/g,
                // Fallback - just look for query structure
                /query\s*\{.*?\}\s*\}/gs
              ];
              
              let patternMatched = false;
              for (const pattern of patterns) {
                const matches = query.match(pattern);
                if (matches && matches[0]) {
                  extractedQuery = matches[0];
                  console.log(`Extracted query using pattern: ${extractedQuery}`);
                  patternMatched = true;
                  break;
                }
              }
              
              // If no pattern matched, try to find a query that starts properly
              if (!patternMatched && !extractedQuery.startsWith('query {')) {
                const queryStart = extractedQuery.indexOf('query {');
                if (queryStart !== -1) {
                  extractedQuery = extractedQuery.substring(queryStart);
                }
              }
              
              // Check if query appears to be truncated and attempt to complete it
              const isQueryTruncated = (q: string): boolean => {
                // Check for common truncation patterns
                return (
                  !q.trim().endsWith('}') ||
                  !q.includes('}}') || // Should end with }} for query close
                  q.includes('companyId: "') && !q.includes('companyId: "', q.indexOf('companyId: "') + 1) && !q.match(/companyId:\s*"[^"]*"/) ||
                  (q.match(/"/g) || []).length % 2 !== 0 // Odd number of quotes
                );
              };
              
              // Get the type details from previous results to construct correct query
              const getCorrectFieldsFromTypeDetails = (): string[] => {
                console.log('Getting correct fields from type details, analyzing all results...');
                console.log('Total results available:', results.length);
                
                // Look through ALL type details results (including additional ones from nested discovery)
                let allTypeDetailsText = '';
                results.forEach((result, index) => {
                  if (result.step === 'graphql-get-query-type-details') {
                    console.log(`Processing type details result ${index}:`, typeof result.output);
                    const text = typeof result.output === 'string' ? result.output : JSON.stringify(result.output);
                    allTypeDetailsText += '\n' + text;
                  }
                });
                
                console.log('Combined type details text length:', allTypeDetailsText.length);
                console.log('Combined type details preview:', allTypeDetailsText.substring(0, 300) + '...');
                
                // Look for the main return type (EmployeeAdvancedFilterForHr)
                const mainReturnTypeMatch = allTypeDetailsText.match(/type\s+(EmployeeAdvancedFilterForHr)\s*\{([^}]+)\}/i);
                if (mainReturnTypeMatch && mainReturnTypeMatch[2]) {
                  console.log(`Found main return type: ${mainReturnTypeMatch[1]}`);
                  
                  // Parse the main return type fields
                  const mainFields = mainReturnTypeMatch[2]
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('//'))
                    .map(line => {
                      // Extract field name before the colon
                      const colonIndex = line.indexOf(':');
                      return colonIndex > 0 ? line.substring(0, colonIndex).trim() : null;
                    })
                    .filter((field): field is string => field !== null && field.length > 0);
                  
                  console.log('Main return type fields:', mainFields);
                  
                  // Look for the nested employee type definition (EmployeeAdvancedFilterForHrEmployees)
                  const employeeTypeMatch = allTypeDetailsText.match(/type\s+(EmployeeAdvancedFilterForHrEmployees)\s*\{([^}]+)\}/i);
                  if (employeeTypeMatch && employeeTypeMatch[2]) {
                    const employeeTypeName = employeeTypeMatch[1];
                    console.log(`Found nested employee type definition: ${employeeTypeName}`);
                    
                    const employeeFields = employeeTypeMatch[2]
                      .split('\n')
                      .map(line => line.trim())
                      .filter(line => line && !line.startsWith('//'))
                      .map(line => {
                        const colonIndex = line.indexOf(':');
                        if (colonIndex > 0) {
                          const fieldName = line.substring(0, colonIndex).trim();
                          const fieldType = line.substring(colonIndex + 1).trim();
                          return { name: fieldName, type: fieldType };
                        }
                        return null;
                      })
                      .filter((field): field is { name: string; type: string } => field !== null);
                    
                    console.log(`Raw employee fields for ${employeeTypeName}:`, employeeFields);
                    
                    // Filter to only scalar/simple fields to avoid complex type issues
                    const scalarFields = employeeFields.filter(field => {
                      const type = field.type;
                      // Check if it's likely a scalar type
                      const isScalar = (
                        isGraphQLScalar(type.replace(/[!\[\]]/g, '')) || // Remove ! and [] modifiers
                        type.includes('String') ||
                        type.includes('Int') ||
                        type.includes('Float') ||
                        type.includes('Boolean') ||
                        type.includes('Date') ||
                        type.includes('ID') ||
                        type.includes('JSON') ||
                        type.includes('enum') ||
                        type.toLowerCase().includes('enum')
                      );
                      
                      console.log(`Field ${field.name}: ${type} -> ${isScalar ? 'SCALAR' : 'COMPLEX'}`);
                      return isScalar;
                    }).map(field => field.name);
                    
                    console.log(`Filtered scalar employee fields for ${employeeTypeName}:`, scalarFields);
                    
                    // Ensure we have at least some basic fields
                    if (scalarFields.length === 0) {
                      console.log('No scalar fields found, using safe basic fields');
                      scalarFields.push('id', 'email', 'firstName', 'lastName');
                    } else if (scalarFields.length < 3) {
                      console.log('Too few scalar fields, adding basic fields');
                      const basicFields = ['id', 'email', 'firstName', 'lastName'];
                      basicFields.forEach(field => {
                        if (!scalarFields.includes(field)) {
                          scalarFields.push(field);
                        }
                      });
                    }
                    
                    console.log(`Final employee fields to use:`, scalarFields);
                    
                    // Look for PaginationData type definition
                    const paginationTypeMatch = allTypeDetailsText.match(/type\s+(PaginationData)\s*\{([^}]+)\}/i);
                    let paginationFields = ['limit']; // Even safer default fallback - just 'limit'
                    
                    console.log('Looking for PaginationData in combined text...');
                    console.log('Combined text contains "PaginationData":', allTypeDetailsText.includes('PaginationData'));
                    console.log('Combined text contains "Pagination":', allTypeDetailsText.includes('Pagination'));
                    console.log('PaginationData regex match result:', paginationTypeMatch ? 'FOUND' : 'NOT FOUND');
                    
                    if (paginationTypeMatch && paginationTypeMatch[2]) {
                      console.log('Raw pagination type content:', paginationTypeMatch[2]);
                      paginationFields = paginationTypeMatch[2]
                        .split('\n')
                        .map(line => line.trim())
                        .filter(line => line && !line.startsWith('//'))
                        .map(line => {
                          const colonIndex = line.indexOf(':');
                          return colonIndex > 0 ? line.substring(0, colonIndex).trim() : null;
                        })
                        .filter((field): field is string => field !== null && field.length > 0);
                      
                      console.log('Extracted pagination fields from type definition:', paginationFields);
                    } else {
                      console.log('PaginationData type not found, checking for Pagination class...');
                      
                      // Try alternative patterns - maybe it's called just "Pagination" or has different format
                      const altPaginationPatterns = [
                        /class\s+(Pagination)\s*\{([^}]+)\}/i,
                        /type\s+(Pagination)\s*\{([^}]+)\}/i,
                        /interface\s+(Pagination\w*)\s*\{([^}]+)\}/i,
                        /export.*class\s+(Pagination\w*)\s*extends.*\{([^}]+)\}/i
                      ];
                      
                      let foundAlternative = false;
                      for (const pattern of altPaginationPatterns) {
                        const altMatch = allTypeDetailsText.match(pattern);
                        if (altMatch && altMatch[2]) {
                          console.log('Found alternative pagination pattern:', altMatch[1]);
                          console.log('Alternative pagination content:', altMatch[2]);
                          paginationFields = altMatch[2]
                            .split('\n')
                            .map(line => line.trim())
                            .filter(line => line && !line.startsWith('//'))
                            .map(line => {
                              const colonIndex = line.indexOf(':');
                              return colonIndex > 0 ? line.substring(0, colonIndex).trim() : null;
                            })
                            .filter((field): field is string => field !== null && field.length > 0);
                          foundAlternative = true;
                          console.log('Extracted fields from alternative pattern:', paginationFields);
                          break;
                        }
                      }
                      
                      if (!foundAlternative) {
                        console.log('No pagination type definition found, using ultra-safe defaults');
                        // Use only the most basic field that's likely to exist
                        paginationFields = ['limit']; // Just limit, avoid 'total', 'page', etc. that might not exist
                      }
                      
                      console.log('Using pagination fields (alternative/default):', paginationFields);
                    }
                    
                    // Ensure we have at least one pagination field
                    if (paginationFields.length === 0) {
                      console.log('No pagination fields found, using absolute fallback');
                      paginationFields = ['limit']; // Ultra-safe: just 'limit'
                    }
                    
                    console.log('Final pagination fields to use:', paginationFields);
                    
                    // Construct nested query structure with ACTUAL field names
                    if (scalarFields.length > 0) {
                      // Use first 8 employee fields to avoid overly complex queries
                      const selectedEmployeeFields = scalarFields.slice(0, 8).join(' ');
                      const selectedPaginationFields = paginationFields.slice(0, 4).join(' ');
                      
                      console.log('Selected employee fields:', selectedEmployeeFields);
                      console.log('Selected pagination fields:', selectedPaginationFields);
                      
                      // CRITICAL: Ensure pagination fields are not empty to avoid syntax errors
                      const finalPaginationFields = selectedPaginationFields.trim() || 'limit total';
                      
                      const queryFields = [
                        `employees { ${selectedEmployeeFields} }`,
                        `pagination { ${finalPaginationFields} }`
                      ];
                      console.log('Final query fields with safety check:', queryFields);
                      return queryFields;
                    }
                  } else {
                    console.log('Employee type definition not found in additional type details');
                  }
                  
                  // If no nested employee type found, just use the main fields
                  if (mainFields.length > 0) {
                    console.log('Using main return type fields as fallback:', mainFields);
                    return mainFields;
                  }
                }
                
                // Final fallback: Look for any employee-related type definition
                const anyEmployeeTypeMatch = allTypeDetailsText.match(/type\s+(\w*Employee\w*)\s*\{([^}]+)\}/i);
                if (anyEmployeeTypeMatch) {
                  console.log('Found fallback employee type:', anyEmployeeTypeMatch[1]);
                  const fields = anyEmployeeTypeMatch[2]
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('//'))
                    .map(line => {
                      const colonIndex = line.indexOf(':');
                      return colonIndex > 0 ? line.substring(0, colonIndex).trim() : null;
                    })
                    .filter((field): field is string => field !== null && field.length > 0);
                  
                  if (fields.length > 0) {
                    console.log('Using fallback employee type fields:', fields.slice(0, 6));
                    return [
                      `employees { ${fields.slice(0, 6).join(' ')} }`,
                      'pagination { page limit total }'
                    ];
                  }
                }
                
                // Ultimate fallback with safe field names
                console.log('Using ultimate fallback with safe field names');
                return [
                  'employees { id firstName lastName email status }', 
                  'pagination { page limit total }'
                ];
              };
              
              if (isQueryTruncated(extractedQuery)) {
                console.warn('Query appears truncated, using complete fallback query with correct fields');
                const correctFields = getCorrectFieldsFromTypeDetails();
                extractedQuery = `query { employees(data: { companyId: "{{auto_companyid}}", conditionType: AND, pagination: { limit: 20, page: 1 } }) { ${correctFields.join(' ')} } }`;
              }
              
              // Final validation - ensure the query has the basic required structure
              const validateQuery = (q: string): boolean => {
                try {
                  // Check for balanced braces
                  const openBraces = (q.match(/\{/g) || []).length;
                  const closeBraces = (q.match(/\}/g) || []).length;
                  if (openBraces !== closeBraces) return false;
                  
                  // Check for balanced quotes
                  const quotes = (q.match(/"/g) || []).length;
                  if (quotes % 2 !== 0) return false;
                  
                  // Check for required structure
                  if (!q.includes('query {') || !q.includes('employees') || !q.includes('data:')) return false;
                  
                  return true;
                } catch (error) {
                  return false;
                }
              };
              
              if (!validateQuery(extractedQuery)) {
                console.warn('Query failed validation, using guaranteed valid fallback with correct fields');
                const correctFields = getCorrectFieldsFromTypeDetails();
                extractedQuery = `query { employees(data: { companyId: "{{auto_companyid}}", conditionType: AND, pagination: { limit: 20, page: 1 } }) { ${correctFields.join(' ')} } }`;
              }

              query = extractedQuery;
              console.log('Final extracted query:', query);

              console.log('Query before placeholder replacement:', query);
              console.log('Available placeholders:', placeholderManager.getRegisteredPlaceholders());

              // Replace placeholders with actual values
              try {
                const invokeObject = await placeholderManager.buildInvokeObject(query, { state, config });
                console.log('Invoke object from placeholder manager:', invokeObject);
                
                // Find only mustache-style placeholders ({{placeholder}}) to avoid GraphQL syntax confusion
                const mustachePlaceholders = query.match(/\{\{([^}]+)\}\}/g) || [];
                const placeholderNames = mustachePlaceholders.map(match => match.slice(2, -2).trim());
                console.log('Found mustache placeholders in query:', placeholderNames);
                
                for (const placeholder of placeholderNames) {
                  if (invokeObject[placeholder]) {
                    const placeholderPattern = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
                    query = query.replace(placeholderPattern, invokeObject[placeholder]);
                    console.log(`Replaced {{${placeholder}}} with ${invokeObject[placeholder]}`);
                  } else {
                    console.warn(`No value found for placeholder: ${placeholder}`);
                  }
                }
                
                console.log('Query after placeholder replacement:', query);
                
                // Fix common GraphQL syntax issues
                const fixGraphQLSyntax = (q: string): string => {
                  let fixed = q;
                  
                  // Fix quoted enum values - common enum values that should not be quoted
                  const enumValues = ['AND', 'OR', 'ASC', 'DESC', 'true', 'false', 'null'];
                  enumValues.forEach(enumVal => {
                    // Replace quoted enum values with unquoted ones
                    const quotedPattern = new RegExp(`"${enumVal}"`, 'g');
                    fixed = fixed.replace(quotedPattern, enumVal);
                  });
                  
                  // Specifically fix conditionType enum
                  fixed = fixed.replace(/conditionType:\s*"(AND|OR)"/g, 'conditionType: $1');
                  
                  // Fix boolean and null values
                  fixed = fixed.replace(/"true"/g, 'true');
                  fixed = fixed.replace(/"false"/g, 'false');
                  fixed = fixed.replace(/"null"/g, 'null');
                  
                  console.log('Fixed GraphQL syntax issues:', fixed);
                  return fixed;
                };
                
                query = fixGraphQLSyntax(query);
                
                // Final validation after placeholder replacement
                if (!validateQuery(query)) {
                  console.error('Query is invalid after placeholder replacement, attempting to fix');
                  // Try to fix common issues
                  if ((query.match(/"/g) || []).length % 2 !== 0) {
                    // Fix unbalanced quotes
                    query = query.replace(/("[^"]*$)/, '$1"');
                    console.log('Fixed unbalanced quotes:', query);
                  }
                  
                  // If still invalid, use a working template with the actual company ID and correct fields
                  if (!validateQuery(query)) {
                    const companyId = invokeObject['auto_companyid'] || 'companyclient1';
                    const correctFields = getCorrectFieldsFromTypeDetails();
                    query = `query { employees(data: { companyId: "${companyId}", conditionType: AND, pagination: { limit: 20, page: 1 } }) { ${correctFields.join(' ')} } }`;
                    console.log('Using fixed template query with correct fields:', query);
                  }
                }
                
              } catch (error) {
                console.error('Error during placeholder replacement:', error);
                // If placeholder replacement fails, we still need a valid query
                // Replace with a default value to prevent syntax errors
                query = query.replace(/\{\{auto_companyid\}\}/g, '"default-company-id"');
                console.log('Used fallback replacement for query:', query);
              }

              toolArgs = { query };
            } else {
              // Fallback to using the expectedInput from the plan
              try {
                toolArgs = JSON.parse(step.expectedInput);
              } catch (error) {
                throw new Error(`No tool input provided for ${step.tool} and failed to parse expectedInput: ${step.expectedInput}`);
              }
            }
          }

          // Execute the tool with the prepared input
          const toolInvokeArgs = accessToken 
            ? { ...toolArgs, accessToken }
            : toolArgs;
          const result = await tool.invoke(toolInvokeArgs);
          results.push({
            step: step.tool,
            input: toolArgs,
            output: result
          });

          console.log(`Step ${step.tool} completed:`, result);
          
          // CRITICAL: Check if we just got type details and need to discover more nested types
          console.log('DEBUG: Checking if we should discover nested types...');
          console.log('DEBUG: step.tool =', step.tool);
          console.log('DEBUG: result =', JSON.stringify(result, null, 2));
          
          if (step.tool === 'graphql-get-query-type-details') {
            console.log('DEBUG: This is a type details step, checking result structure...');
            
            // Handle both string results and object results
            let text = '';
            if (typeof result === 'string') {
              text = result;
              console.log('DEBUG: Result is a string, using directly');
            } else if (result && typeof result === 'object') {
              console.log('DEBUG: Result is an object, extracting content...');
              
              if (result.content) {
                const content = Array.isArray(result.content) ? result.content[0]?.text || '' : result.content;
                text = typeof content === 'string' ? content : JSON.stringify(content);
                console.log('DEBUG: Found result.content');
              } else {
                text = JSON.stringify(result);
                console.log('DEBUG: Converting result to JSON string');
              }
            } else {
              console.log('DEBUG: Result is not a string or object, skipping');
              text = '';
            }
            
            if (text) {
              console.log('DEBUG: Final text to analyze:', text.substring(0, 200) + '...');
              
              console.log('Checking for nested types in type details response...');
              
              // Look for additional types we haven't requested yet using a specialized function
              const additionalTypes = extractNestedTypesFromTypeDefinitions(text);
              if (additionalTypes) {
                const requestedTypes = new Set();
                
                // Collect all types we've already requested
                results.forEach(r => {
                  if (r.step === 'graphql-get-query-type-details' && r.input.typeNames) {
                    r.input.typeNames.split(',').forEach(type => requestedTypes.add(type.trim()));
                  }
                });
                
                // Filter to only new types we haven't requested
                const newTypes = additionalTypes.split(',')
                  .map(type => type.trim())
                  .filter(type => !requestedTypes.has(type));
                
                if (newTypes.length > 0) {
                  console.log(`Found additional nested types: ${newTypes.join(',')}`);
                  console.log('Requesting additional type details...');
                  
                  // Request details for the new types
                  const additionalArgs = accessToken
                    ? { typeNames: newTypes.join(','), accessToken }
                    : { typeNames: newTypes.join(',') };
                  const additionalResult = await tool.invoke(additionalArgs);
                  results.push({
                    step: 'graphql-get-query-type-details',
                    input: { typeNames: newTypes.join(',') },
                    output: additionalResult
                  });
                  
                  console.log('Additional type details completed:', additionalResult);
                } else {
                  console.log('No new nested types found to request');
                }
              } else {
                console.log('No nested types extracted from type details response');
              }
            } else {
              console.log('DEBUG: No text to analyze for nested types');
            }
          } else {
            console.log('DEBUG: This is not a type details step, skipping nested type discovery');
          }
        }

        // Extract and format the actual data from the execute-query result
        const executeQueryResult = results.find(r => r.step === 'execute-query');
        let cleanData: any = null;
        let employeeCount = 0;
        
        if (executeQueryResult && executeQueryResult.output) {
          try {
            const queryOutput = typeof executeQueryResult.output === 'string' 
              ? JSON.parse(executeQueryResult.output) 
              : executeQueryResult.output;
            
            // Extract the actual GraphQL data
            cleanData = queryOutput.data;
            
            // Count employees if available
            if (cleanData?.employees?.employees && Array.isArray(cleanData.employees.employees)) {
              employeeCount = cleanData.employees.employees.length;
            }
          } catch (error) {
            console.error('Error parsing execute-query result:', error);
          }
        }

        // Create a clean, user-friendly response
        const cleanResponse: any = {
          success: true,
          task: task.description,
          data: cleanData,
          summary: cleanData ? 
            `Successfully retrieved ${employeeCount} employee${employeeCount !== 1 ? 's' : ''}.` :
            'Query completed successfully.',
          executedAt: new Date().toISOString()
        };

        // Only include technical details in development/debug mode
        if (process.env.NODE_ENV === 'development') {
          cleanResponse.debug = {
            toolsUsed: plan.executionPlan.map(step => step.tool),
            rawResults: results
          };
        }

        return cleanResponse;
      } catch (error) {
        console.error('Error executing query task:', error);
        return {
          success: false,
          error: error.message,
          data: {
            summary: `The retrieval was unsuccessful: ${error.message}`,
            details: {
              errorType: error.name || 'UnknownError',
              errorMessage: error.message,
              errorStack: error.stack
            }
          },
          metadata: {
            taskId: task.id,
            type: task.type,
            error: error.stack
          }
        };
      }
    }
  };
}

function extractTypeNames(result: any): string | null {
  if (!result) return null;
  
  // Try to find type names in the result text
  const text = typeof result === 'string' ? result : JSON.stringify(result);
  console.log('Extracting type names from query details:', text.substring(0, 500) + '...');
  
  const typeNames = new Set<string>();
  
  // Parse query signatures to extract type names
  // Look for patterns like "data: TypeName!" or "): ReturnType!"
  // This handles both argument types and return types from actual query signatures
  
  // Split by lines to process each query signature
  const lines = text.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith('//')) continue;
    
    // Look for argument types - pattern like "data: TypeName!" or "filter: TypeName"
    const argTypeMatches = trimmedLine.match(/:\s*([A-Z]\w+)(!|\s|$)/g);
    if (argTypeMatches) {
      argTypeMatches.forEach(match => {
        const typeName = match.replace(/:\s*/, '').replace(/[!\s]/g, '');
        if (typeName && !isGraphQLScalar(typeName)) {
          typeNames.add(typeName);
          console.log(`Found argument type: ${typeName}`);
        }
      });
    }
    
    // Look for return types - pattern like "): ReturnType!" 
    const returnTypeMatches = trimmedLine.match(/\):\s*([A-Z]\w+)(!|\s|$)/g);
    if (returnTypeMatches) {
      returnTypeMatches.forEach(match => {
        const typeName = match.replace(/\):\s*/, '').replace(/[!\s]/g, '');
        if (typeName && !isGraphQLScalar(typeName)) {
          typeNames.add(typeName);
          console.log(`Found return type: ${typeName}`);
        }
      });
    }
    
    // Also look for nested types within square brackets [TypeName]
    const listTypeMatches = trimmedLine.match(/\[([A-Z]\w+)\]/g);
    if (listTypeMatches) {
      listTypeMatches.forEach(match => {
        const typeName = match.replace(/[\[\]]/g, '');
        if (typeName && !isGraphQLScalar(typeName)) {
          typeNames.add(typeName);
          console.log(`Found list type: ${typeName}`);
        }
      });
    }
    
    // ADDITIONAL: Look for nested types in type field definitions
    // Pattern like "employees: [EmployeeAdvancedFilterForHrEmployees!]!" or "field: SomeType!"
    const fieldTypeMatches = trimmedLine.match(/\w+:\s*\[?([A-Z]\w+)/g);
    if (fieldTypeMatches) {
      fieldTypeMatches.forEach(match => {
        // Extract just the type name part
        const typeMatch = match.match(/:\s*\[?([A-Z]\w+)/);
        if (typeMatch && typeMatch[1]) {
          const typeName = typeMatch[1];
          if (typeName && !isGraphQLScalar(typeName) && !typeName.includes('Data')) {
            typeNames.add(typeName);
            console.log(`Found field type: ${typeName}`);
          }
        }
      });
    }
  }
  
  // Convert Set to Array and filter out any remaining unwanted types
  const result_types = Array.from(typeNames).filter(type => 
    type.length > 2 && // Reasonable length
    type !== type.toLowerCase() && // Should start with uppercase (GraphQL convention)
    !['Query', 'Mutation', 'Subscription'].includes(type) // Skip root types
  );
  
  console.log('Extracted type names from query details:', result_types);
  
  return result_types.length > 0 ? result_types.join(',') : null;
}

// Helper function to check if a type is a GraphQL scalar
function isGraphQLScalar(typeName: string): boolean {
  const scalars = ['String', 'Int', 'Float', 'Boolean', 'ID', 'JSON', 'DateTime', 'Date', 'Time'];
  return scalars.includes(typeName);
}

function extractNestedTypesFromTypeDefinitions(text: string): string | null {
  console.log('Extracting nested types from type definitions:', text.substring(0, 500) + '...');
  
  const typeNames = new Set<string>();
  
  // Split by lines to process each type definition
  const lines = text.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith('//')) continue;
    
    console.log('DEBUG: Processing line:', trimmedLine);
    
    // Look for field type definitions - pattern like "employees: [EmployeeAdvancedFilterForHrEmployees!]!"
    const fieldTypeMatches = trimmedLine.match(/\w+:\s*\[?([A-Z]\w+)(!|\]|$)/g);
    if (fieldTypeMatches) {
      console.log('DEBUG: Found field type matches:', fieldTypeMatches);
      fieldTypeMatches.forEach(match => {
        // Extract the type name from patterns like:
        // "employees: [EmployeeAdvancedFilterForHrEmployees!]!" 
        // "pagination: PaginationData!"
        const typeMatch = match.match(/:\s*\[?([A-Z]\w+)/);
        if (typeMatch && typeMatch[1]) {
          const typeName = typeMatch[1];
          console.log('DEBUG: Checking type name:', typeName, 'isScalar:', isGraphQLScalar(typeName));
          if (typeName && !isGraphQLScalar(typeName)) {
            typeNames.add(typeName);
            console.log(`Found nested type in type definition: ${typeName}`);
          }
        }
      });
    }
    
    // Also look for types in enum/union definitions if needed
    // Pattern like "enum SomeType { VALUE1 VALUE2 }"
    const enumTypeMatch = trimmedLine.match(/enum\s+([A-Z]\w+)/);
    if (enumTypeMatch && enumTypeMatch[1]) {
      const typeName = enumTypeMatch[1];
      if (!isGraphQLScalar(typeName)) {
        typeNames.add(typeName);
        console.log(`Found enum type: ${typeName}`);
      }
    }
  }
  
  // Convert Set to Array and filter out any remaining unwanted types
  const result_types = Array.from(typeNames).filter(type => 
    type.length > 2 && // Reasonable length
    type !== type.toLowerCase() && // Should start with uppercase (GraphQL convention)
    !['Query', 'Mutation', 'Subscription'].includes(type) // Skip root types
  );
  
  console.log('Extracted nested types from type definitions:', result_types);
  
  return result_types.length > 0 ? result_types.join(',') : null;
}
