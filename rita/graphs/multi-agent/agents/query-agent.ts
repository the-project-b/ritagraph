import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { Task } from "../types";
import client from "../../../mcp/client.js";
import { placeholderManager } from "../../../placeholders/manager";
import { MergedAnnotation } from "../../../states/states";
import { executionStateManager } from "../utils/execution-state-manager";
import { QueryPlanner } from "./query-agent/query-planner";
import { QueryValidator } from "./query-agent/query-validator";
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
    tool.name.includes('execute-query')
  );

  // Create LLM with tools bound
  const model = new ChatOpenAI({
    model: "gpt-4",
    temperature: 0,
  }).bindTools(queryTools);

  // Initialize helper modules
  const queryPlanner = new QueryPlanner();
  const queryValidator = new QueryValidator();

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

        // Check if we have saved execution state to resume from
        const savedExecutionState = executionStateManager.getState(task.id, 'query_agent');
        if (savedExecutionState) {
          console.log(`🔍 QUERY AGENT - Resuming execution from saved state`);
          console.log(`🔍 QUERY AGENT - Saved plan:`, savedExecutionState.plan);
          console.log(`🔍 QUERY AGENT - Saved results:`, savedExecutionState.results);
          
          // Resume execution from where we left off
          const result = await this.resumeExecution(savedExecutionState, accessToken, task, state, config);
          
          // Clear the execution state after successful resumption
          if (result.success) {
            executionStateManager.clearState(task.id, 'query_agent');
          }
          
          return result;
        }

        // First execution - get list of available queries
        const listQueriesTool = queryTools.find(t => t.name === 'graphql-list-queries');
        if (!listQueriesTool) {
          throw new Error('graphql-list-queries tool not found');
        }

        const listQueriesArgs = accessToken ? { accessToken } : {};
        const queriesList = await listQueriesTool.invoke(listQueriesArgs);
        console.log('Available queries:', queriesList);

        // Create execution plan using QueryPlanner
        const existingTypeDetailsContext = queryPlanner.buildExistingTypeDetailsContext(state);
        const plan = await queryPlanner.createExecutionPlan(
          task, 
          queriesList, 
          queryTools, 
          existingTypeDetailsContext
        );

        // Execute the plan step by step
        interface ExecutionResult {
          step: string;
          input: Record<string, any>;
          output: any;
        }
        const results: ExecutionResult[] = [];
        
        for (const step of plan.executionPlan) {
          console.log(`🔍 QUERY AGENT - Executing step: ${step.tool}`);
          console.log(`🔍 QUERY AGENT - Step purpose: ${step.purpose}`);
          
          const tool = queryTools.find(t => t.name === step.tool);
          if (!tool) {
            throw new Error(`Tool ${step.tool} not found`);
          }

          // Special handling for query details step - check if we need type details
          if (step.tool === 'graphql-get-query-details') {
            console.log(`🔍 QUERY AGENT - Processing query details step`);
            
            // Execute the query details tool first
            const listQueriesResult = results.find(r => r.step === 'graphql-list-queries');
            const selectedQuery = plan.selectedQuery;
            
            const toolArgs = { queryNames: selectedQuery };
            const toolInvokeArgs = accessToken 
              ? { ...toolArgs, accessToken }
              : toolArgs;
            
            const result = await tool.invoke(toolInvokeArgs);
            results.push({
              step: step.tool,
              input: toolArgs,
              output: result
            });
            
            console.log(`🔍 QUERY AGENT - Query details completed for: ${selectedQuery}`);
            console.log(`🔍 QUERY AGENT - Checking if type details are needed...`);
            
            // Check if the result contains type names that need details
            const needsTypeDetails = checkIfTypeDetailsNeeded(result);
            if (needsTypeDetails.needed) {
              console.log(`🔍 QUERY AGENT - Type details needed for: ${needsTypeDetails.typeNames.join(', ')}`);
              
              // Check if we already have type details from completed tasks in the state
              const existingTypeDetails = checkForExistingTypeDetails(state, needsTypeDetails.typeNames);
              if (existingTypeDetails.found) {
                console.log(`🔍 QUERY AGENT - Found existing type details, proceeding with query generation`);
                // Store the type details in results for query generation
                results.push({
                  step: 'existing-type-details',
                  input: { typeNames: needsTypeDetails.typeNames.join(',') },
                  output: existingTypeDetails.data
                });
              } else {
                console.log(`🔍 QUERY AGENT - No existing type details found. Query agent cannot proceed without type details.`);
                
                // Save execution state before returning for type details
                const executionState = {
                  plan: plan,
                  results: results,
                  queriesList: queriesList,
                  accessToken: accessToken,
                  currentStep: step,
                  stepIndex: plan.executionPlan.findIndex(s => s.tool === step.tool),
                  needsTypeDetails: needsTypeDetails
                };
                
                console.log(`🔍 QUERY AGENT - Saving execution state for resumption after type details`);
                
                // Save execution state using the state manager
                executionStateManager.saveState(task.id, 'query_agent', executionState);
                
                // Return early with a message indicating type details are needed
                return {
                  success: false,
                  requiresTypeDetails: true,
                  typeNames: needsTypeDetails.typeNames,
                  data: {
                    summary: `Query requires type details for: ${needsTypeDetails.typeNames.join(', ')}. Please create a type details task first.`,
                    queryDetails: result,
                    selectedQuery: selectedQuery
                  },
                  metadata: {
                    taskId: task.id,
                    type: task.type,
                    reason: 'Type details required before query execution'
                  }
                };
              }
            }
            
            continue;
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
  "query": "query { employees(data: { companyId: \"{{auto_companyid}}\", conditionType: AND, pagination: { limit: 20, currentPage: 1 } }) { data { id name email } total page limit } }"
}

Please provide the input parameters that match the schema exactly.`;

          const inputResponse = await model.invoke([
            new HumanMessage(inputPrompt)
          ]);

          let toolArgs;
          if (inputResponse.tool_calls?.length) {
            toolArgs = inputResponse.tool_calls[0].args;
          } else if (step.tool === 'execute-query' && results.length > 0) {
              // Ask LLM to construct the query dynamically based on the selected query and available query information
              const selectedQueryName = plan.selectedQuery;
              const queryDetailsResult = results.find(r => r.step === 'graphql-get-query-details');
              
              console.log(`Generating query for: ${selectedQueryName}`);
              
              // Build context for LLM to generate appropriate query
              const typeDetailsResult = results.find(r => r.step === 'existing-type-details');
              
              const queryContext = {
                queryName: selectedQueryName,
                queryDetails: queryDetailsResult?.output || '',
                typeDetails: typeDetailsResult?.output || 'No type details available',
                task: task.description
              };
              
                                             // Extract enhanced LLM guidance from MCP tool analysis
                let structuredPatterns: any = null;
                let llmGuidance = '';
                let typeDetailsSummary = 'No type details available';
                
                if (typeDetailsResult && typeDetailsResult.output) {
                  try {
                    // The enhanced MCP tool returns structured data with LLM guidance
                    const typeOutput = typeof typeDetailsResult.output === 'string' 
                      ? typeDetailsResult.output 
                      : JSON.stringify(typeDetailsResult.output);
                    
                    console.log('🔍 QUERY AGENT - Processing enhanced MCP tool response');
                    
                    // Extract LLM Guidance section (the comprehensive guidance text)
                    const llmGuidanceMatch = typeOutput.match(/🤖 \*\*LLM QUERY GENERATION GUIDANCE\*\*([\s\S]*?)(?=================|📊 \*\*Pattern Analysis)/);
                    if (llmGuidanceMatch) {
                      llmGuidance = llmGuidanceMatch[1].trim();
                      console.log('🔍 QUERY AGENT - Extracted LLM guidance:', llmGuidance.substring(0, 200) + '...');
                    }
                    
                    // Extract Pattern Analysis JSON (for backward compatibility and structured data access)
                    const patternMatch = typeOutput.match(/"Pattern Analysis:"[\s\S]*?(\{[\s\S]*?\})/);
                    if (patternMatch) {
                      try {
                        structuredPatterns = JSON.parse(patternMatch[1]);
                        console.log('🔍 QUERY AGENT - Extracted structured patterns:', Object.keys(structuredPatterns));
                        
                        // Build summary combining LLM guidance and structured patterns
                        if (llmGuidance) {
                          typeDetailsSummary = 'Enhanced MCP Analysis with LLM Guidance Available';
                        } else {
                          typeDetailsSummary = this.buildStructuredTypeDetailsSummary(structuredPatterns);
                        }
                      } catch (parseError) {
                        console.warn('🔍 QUERY AGENT - Failed to parse pattern analysis:', parseError);
                        typeDetailsSummary = llmGuidance ? 'LLM guidance available' : 'Type details available but pattern analysis parsing failed';
                      }
                    } else {
                      console.log('🔍 QUERY AGENT - No pattern analysis found');
                      typeDetailsSummary = llmGuidance ? 'LLM guidance available' : 'Type details available (no pattern analysis found)';
                    }
                  } catch (error) {
                    console.error('🔍 QUERY AGENT - Error processing enhanced type details:', error);
                    typeDetailsSummary = 'Type details available but processing failed';
                  }
                }
               
               // Enhanced dynamic query prompt using MCP LLM guidance
               const dynamicQueryPrompt = this.buildEnhancedQueryPrompt(
                 selectedQueryName,
                 queryContext,
                 typeDetailsSummary,
                 structuredPatterns,
                 llmGuidance
               );
               
               // Add timeout protection for LLM call
               console.log('🔍 QUERY AGENT - Generating query with LLM (with timeout protection)...');
               const queryResponse = await Promise.race([
                 model.invoke([new HumanMessage(dynamicQueryPrompt)]),
                 new Promise((_, reject) => 
                   setTimeout(() => reject(new Error('Query generation timeout after 15 seconds')), 15000)
                 )
               ]) as any;

              let query = typeof queryResponse.content === 'string' 
                ? queryResponse.content.trim()
                : JSON.stringify(queryResponse.content);

              console.log('Dynamic query generated:', query);

              // Clean up the query
              query = query.replace(/```graphql\n?/g, '').replace(/```\n?/g, '').trim();
              
              // Filter out complex fields using QueryValidator
              query = queryValidator.filterComplexFields(query);
              console.log('Query after complex field filtering:', query);
              
              // Validate and fix the query using QueryValidator
              const validation = queryValidator.validateAndFix(query, selectedQueryName);
              if (!validation.isValid) {
                console.warn(`Generated query failed validation, using simple fallback for ${selectedQueryName}`);
                // Generate a simple fallback query
                if (selectedQueryName === 'me') {
                  query = 'query { me { id email firstName lastName } }';
                } else {
                  query = `query { ${selectedQueryName} }`;
                }
              }

              console.log('Final query to execute:', query);

              // Handle placeholder replacement
              try {
                const invokeObject = await placeholderManager.buildInvokeObject(query, { state, config });
                
                const mustachePlaceholders = query.match(/\{\{([^}]+)\}\}/g) || [];
                const placeholderNames = mustachePlaceholders.map(match => match.slice(2, -2).trim());
                
                for (const placeholder of placeholderNames) {
                  if (invokeObject[placeholder]) {
                    const placeholderPattern = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
                    query = query.replace(placeholderPattern, invokeObject[placeholder]);
                  }
                }
                
                // Fix GraphQL syntax
                const fixGraphQLSyntax = (q: string): string => {
                  let fixed = q;
                  const enumValues = ['AND', 'OR', 'ASC', 'DESC', 'true', 'false', 'null'];
                  enumValues.forEach(enumVal => {
                    const quotedPattern = new RegExp(`"${enumVal}"`, 'g');
                    fixed = fixed.replace(quotedPattern, enumVal);
                  });
                  return fixed;
                };
                
                query = fixGraphQLSyntax(query);
              } catch (error) {
                console.error('Error during placeholder replacement:', error);
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

          // Execute the tool with the prepared input
          const toolInvokeArgs = accessToken 
            ? { ...toolArgs, accessToken }
            : toolArgs;
          
          let result;
          try {
            // Add timeout protection for query execution
            console.log('🔍 QUERY AGENT - Executing query with timeout protection...');
            result = await Promise.race([
              tool.invoke(toolInvokeArgs),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Query execution timeout after 30 seconds')), 30000)
              )
            ]);
          } catch (error: any) {
            console.log(`🔍 QUERY AGENT - Tool execution error:`, error.message);
            
            // Use QueryValidator to handle errors with automatic retry
            if (step.tool === 'execute-query' && 
                error.message && 
                (error.message.includes('Cannot query field') || 
                 error.message.includes('must have a selection of subfields'))) {
              
              const originalQuery = toolInvokeArgs.query || '';
              result = await queryValidator.handleQueryError(
                originalQuery,
                error,
                async (fixedQuery: string) => {
                  const retryArgs = accessToken 
                    ? { query: fixedQuery, accessToken }
                    : { query: fixedQuery };
                  return await tool.invoke(retryArgs);
                }
              );
            }
            // Check if this is a union type error that needs inline fragments
            else if (step.tool === 'execute-query' && 
                error.message && 
                error.message.includes('Cannot query field') && 
                error.message.includes('Did you mean to use an inline fragment')) {
              
              console.log('Detected union type error, regenerating query with inline fragments...');
              
              // Extract union type members from error message
              const fragmentMatches = error.message.match(/inline fragment on "([^"]+)"/g);
              const unionMembers = fragmentMatches ? 
                fragmentMatches.map((match: string) => match.match(/"([^"]+)"/)?.[1]).filter(Boolean) : 
                ['OnboardingAdmin', 'OnboardingBpo', 'OnboardingEmployee', 'OnboardingHrManager']; // fallback
              
              console.log('Detected union members:', unionMembers);
              
              // Generate query with inline fragments
              const selectedQueryName = plan.selectedQuery;
              const fragments = unionMembers.map(member => 
                `... on ${member} { id email firstName lastName }`
              ).join('\n        ');
              
              const unionQuery = `query {
  ${selectedQueryName} {
    __typename
    ${fragments}
  }
}`;
              
              console.log('Retrying with union query:', unionQuery);
              
              // Retry with the corrected query
              const retryArgs = accessToken 
                ? { query: unionQuery, accessToken }
                : { query: unionQuery };
              
              try {
                result = await tool.invoke(retryArgs);
                console.log('Union query retry successful!');
              } catch (retryError) {
                console.error('Union query retry failed:', retryError);
                throw retryError;
              }
            }
            // Check if this is a complex field error that needs field filtering
            else if (step.tool === 'execute-query' && 
                     error.message && 
                     error.message.includes('must have a selection of subfields')) {
              
              console.log('Detected complex field error, filtering problematic fields...');
              console.log('Error message:', error.message);
              
              // Extract the problematic field name from error message
              const fieldMatch = error.message.match(/Field "([^"]+)"/);
              const problematicField = fieldMatch ? fieldMatch[1] : '';
              
              console.log('Problematic field detected:', problematicField);
              
              // Get the original query and remove the problematic field
              const originalQuery = toolArgs.query || '';
              let fixedQuery = originalQuery;
              
              console.log('Original query:', originalQuery);
              
              if (problematicField) {
                // Remove the specific problematic field with better regex patterns
                const patterns = [
                  new RegExp(`\\s*${problematicField}\\s*,?`, 'g'),  // field with optional comma
                  new RegExp(`\\s*,\\s*${problematicField}\\s*`, 'g'), // comma then field
                  new RegExp(`\\s*${problematicField}\\s*`, 'g')  // just the field
                ];
                
                patterns.forEach(pattern => {
                  fixedQuery = fixedQuery.replace(pattern, ' ');
                });
              }
              
              // Apply additional complex field filtering
              const complexFields = [
                'dataStatus', 'events', 'incomeComponents', 'lastInviteLink',
                'missingFieldsBPO', 'missingFieldsEmployee', 'missingFieldsHR',
                'healthInsurance', 'contractData', 'paymentComponents',
                'permissions', 'roles', 'metadata', 'settings', 'preferences',
                'contractDataStatuses', 'employeeContractDataStatuses'
              ];
              
              complexFields.forEach(field => {
                const patterns = [
                  new RegExp(`\\s*${field}\\s*,?`, 'g'),
                  new RegExp(`\\s*,\\s*${field}\\s*`, 'g'),
                  new RegExp(`\\s*${field}\\s*`, 'g')
                ];
                patterns.forEach(pattern => {
                  fixedQuery = fixedQuery.replace(pattern, ' ');
                });
              });
              
              // Clean up the query thoroughly
              fixedQuery = fixedQuery
                .replace(/\s+/g, ' ')           // Multiple spaces to single
                .replace(/\{\s+/g, '{ ')        // Clean opening braces
                .replace(/\s+\}/g, ' }')        // Clean closing braces
                .replace(/,\s*,/g, ',')         // Remove double commas
                .replace(/,\s*\}/g, ' }')       // Remove trailing commas before closing braces
                .replace(/\{\s*,/g, '{ ')       // Remove leading commas after opening braces
                .replace(/\s*,\s*/g, ', ')      // Normalize comma spacing
                .trim();
              
              console.log('Retrying with filtered query:', fixedQuery);
              
              // Retry with the filtered query
              const retryArgs = accessToken 
                ? { query: fixedQuery, accessToken }
                : { query: fixedQuery };
              
              try {
                result = await tool.invoke(retryArgs);
                console.log('Complex field filtering retry successful!');
              } catch (retryError) {
                console.error('Complex field filtering retry failed:', retryError);
                console.error('Retry error details:', retryError.message);
                throw retryError;
              }
            }
            else {
              throw error;
            }
          }
          
          results.push({
            step: step.tool,
            input: toolArgs,
            output: result
          });

          console.log(`Step ${step.tool} completed:`, result);
        }

        // Extract and format the actual data from the execute-query result
        const executeQueryResult = results.find(r => r.step === 'execute-query');
        let cleanData: any = null;
        let resultSummary = 'Query completed successfully.';
        
        if (executeQueryResult && executeQueryResult.output) {
          try {
            const queryOutput = typeof executeQueryResult.output === 'string' 
              ? JSON.parse(executeQueryResult.output) 
              : executeQueryResult.output;
            
            // Extract the actual GraphQL data
            cleanData = queryOutput.data;
            
            // Generate dynamic summary based on the data structure and selected query
            const selectedQueryName = plan.selectedQuery || 'unknown';
            
            if (cleanData) {
              if (selectedQueryName === 'me') {
                // Handle "me" query - single user object
                const userData = cleanData[selectedQueryName];
                if (userData) {
                  const name = userData.firstName || userData.email || userData.id || 'Unknown';
                  resultSummary = `Successfully retrieved user data for ${name}.`;
                } else {
                  resultSummary = 'Successfully retrieved user data.';
                }
              } else if (selectedQueryName === 'employees' && cleanData.employees?.employees) {
                // Handle employees query - array of employees
                const employeeCount = cleanData.employees.employees.length;
                resultSummary = `Successfully retrieved ${employeeCount} employee${employeeCount !== 1 ? 's' : ''}.`;
              } else {
                // Generic handling for other queries
                const queryResult = cleanData[selectedQueryName];
                if (Array.isArray(queryResult)) {
                  const count = queryResult.length;
                  resultSummary = `Successfully retrieved ${count} item${count !== 1 ? 's' : ''} from ${selectedQueryName}.`;
                } else if (queryResult && typeof queryResult === 'object') {
                  resultSummary = `Successfully retrieved ${selectedQueryName} data.`;
                } else {
                  resultSummary = `Successfully executed ${selectedQueryName} query.`;
                }
              }
            }
          } catch (error) {
            console.error('Error parsing execute-query result:', error);
            resultSummary = 'Query completed but data parsing failed.';
          }
        }

        // Create a clean, user-friendly response
        const cleanResponse: any = {
          success: true,
          task: task.description,
          data: cleanData,
          summary: resultSummary,
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
    },

    /**
     * Resumes execution from a saved state after type details are available
     */
    async resumeExecution(savedState: any, accessToken: string, task: Task, state: any, config: any) {
      console.log(`🔍 QUERY AGENT - Resuming from step: ${savedState.currentStep.tool}`);
      
      const { plan, results, queriesList, stepIndex } = savedState;
      
      // Check if type details are now available
      const existingTypeDetails = checkForExistingTypeDetails(state, savedState.needsTypeDetails.typeNames);
      if (existingTypeDetails.found) {
        console.log(`🔍 QUERY AGENT - Type details now available, proceeding with query generation`);
        
        // Add the type details to results
        results.push({
          step: 'existing-type-details',
          input: { typeNames: savedState.needsTypeDetails.typeNames.join(',') },
          output: existingTypeDetails.data
        });
      } else {
        console.log(`🔍 QUERY AGENT - Type details still not available`);
        return {
          success: false,
          error: 'Type details are still not available after resumption',
          metadata: {
            taskId: task.id,
            type: task.type,
            reason: 'Type details missing on resumption'
          }
        };
      }

      // Continue execution from the next step
      const remainingSteps = plan.executionPlan.slice(stepIndex + 1);
      
      for (const step of remainingSteps) {
        console.log(`🔍 QUERY AGENT - Executing remaining step: ${step.tool}`);
        
        const tool = queryTools.find(t => t.name === step.tool);
        if (!tool) {
          throw new Error(`Tool ${step.tool} not found`);
        }

        if (step.tool === 'execute-query') {
          // Generate query using existing results and type details
          const selectedQueryName = plan.selectedQuery;
          const queryDetailsResult = results.find(r => r.step === 'graphql-get-query-details');
          
          console.log(`🔍 QUERY AGENT - Generating query for: ${selectedQueryName} (resumed execution)`);
          
                     // Use existing query generation logic but with streamlined type details to avoid hanging
           
                       // Extract enhanced LLM guidance from MCP tool analysis (resumption)
            let structuredPatterns: any = null;
            let llmGuidance = '';
            let typeDetailsSummary = 'No type details available';
            
            if (existingTypeDetails && existingTypeDetails.data) {
              try {
                // The enhanced MCP tool returns structured data with LLM guidance
                const typeText = JSON.stringify(existingTypeDetails.data);
                
                console.log('🔍 QUERY AGENT - Processing enhanced MCP tool response (resumed)');
                
                // Extract LLM Guidance section (the comprehensive guidance text)
                const llmGuidanceMatch = typeText.match(/🤖 \*\*LLM QUERY GENERATION GUIDANCE\*\*([\s\S]*?)(?=================|📊 \*\*Pattern Analysis)/);
                if (llmGuidanceMatch) {
                  llmGuidance = llmGuidanceMatch[1].trim();
                  console.log('🔍 QUERY AGENT - Extracted LLM guidance (resumed):', llmGuidance.substring(0, 200) + '...');
                }
                
                // Extract Pattern Analysis JSON (for backward compatibility)
                const patternMatch = typeText.match(/"Pattern Analysis:"[\s\S]*?(\{[\s\S]*?\})/);
                if (patternMatch) {
                  try {
                    structuredPatterns = JSON.parse(patternMatch[1]);
                    console.log('🔍 QUERY AGENT - Extracted structured patterns (resumed):', Object.keys(structuredPatterns));
                    
                    // Build summary combining LLM guidance and structured patterns
                    if (llmGuidance) {
                      typeDetailsSummary = 'Enhanced MCP Analysis with LLM Guidance Available (resumed)';
                    } else {
                      typeDetailsSummary = this.buildStructuredTypeDetailsSummary(structuredPatterns);
                    }
                  } catch (parseError) {
                    console.warn('🔍 QUERY AGENT - Failed to parse pattern analysis (resumed):', parseError);
                    typeDetailsSummary = llmGuidance ? 'LLM guidance available (resumed)' : 'Type details available but pattern analysis parsing failed';
                  }
                } else {
                  console.log('🔍 QUERY AGENT - No pattern analysis found (resumed)');
                  typeDetailsSummary = llmGuidance ? 'LLM guidance available (resumed)' : 'Type details available (no pattern analysis found)';
                }
              } catch (error) {
                console.error('🔍 QUERY AGENT - Error processing enhanced type details (resumed):', error);
                typeDetailsSummary = 'Type details available but processing failed';
              }
            }
           
           // Build query context for enhanced prompt
           const queryContext = {
             queryName: selectedQueryName,
             queryDetails: queryDetailsResult?.output || 'No query details',
             typeDetails: existingTypeDetails?.data || 'No type details available',
             task: task.description
           };
           
           // Enhanced dynamic query prompt using MCP LLM guidance (resumption)
           const dynamicQueryPrompt = this.buildEnhancedQueryPrompt(
             selectedQueryName,
             queryContext,
             typeDetailsSummary,
             structuredPatterns,
             llmGuidance
           );

          const model = new ChatOpenAI({
            model: "gpt-4",
            temperature: 0,
          });

                      // Add timeout protection for LLM call
            console.log('🔍 QUERY AGENT - Generating query with LLM (resumed execution, with timeout protection)...');
            const queryResponse = await Promise.race([
              model.invoke([new HumanMessage(dynamicQueryPrompt)]),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Query generation timeout after 15 seconds')), 15000)
              )
            ]) as any;

          let query = typeof queryResponse.content === 'string' 
            ? queryResponse.content.trim()
            : JSON.stringify(queryResponse.content);

          query = query.replace(/```graphql\n?/g, '').replace(/```\n?/g, '').trim();
          
          console.log('Generated query (resumed execution):', query);

          // Handle placeholder replacement
          try {
            const invokeObject = await placeholderManager.buildInvokeObject(query, { state, config });
            
            const mustachePlaceholders = query.match(/\{\{([^}]+)\}\}/g) || [];
            const placeholderNames = mustachePlaceholders.map(match => match.slice(2, -2).trim());
            
            for (const placeholder of placeholderNames) {
              if (invokeObject[placeholder]) {
                const placeholderPattern = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
                query = query.replace(placeholderPattern, invokeObject[placeholder]);
              }
            }
            
            // Fix GraphQL syntax
            const fixGraphQLSyntax = (q: string): string => {
              let fixed = q;
              const enumValues = ['AND', 'OR', 'ASC', 'DESC', 'true', 'false', 'null'];
              enumValues.forEach(enumVal => {
                const quotedPattern = new RegExp(`"${enumVal}"`, 'g');
                fixed = fixed.replace(quotedPattern, enumVal);
              });
              return fixed;
            };
            
            query = fixGraphQLSyntax(query);
          } catch (error) {
            console.error('Error during placeholder replacement:', error);
          }

          const toolArgs = { query };
          const toolInvokeArgs = accessToken 
            ? { ...toolArgs, accessToken }
            : toolArgs;
          
          let result;
          try {
            // Add timeout protection for query execution
            console.log('🔍 QUERY AGENT - Executing query with timeout protection (resumed)...');
            result = await Promise.race([
              tool.invoke(toolInvokeArgs),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Query execution timeout after 30 seconds')), 30000)
              )
            ]);
          } catch (error: any) {
            console.log(`🔍 QUERY AGENT - Tool execution error (resumed):`, error.message);
            
            // Check if this is a field validation error (field doesn't exist on type) - resumed execution
            if (step.tool === 'execute-query' && 
                error.message && 
                (error.message.includes('Cannot query field') || 
                 error.message.includes('must have a selection of subfields'))) {
              
              console.log('🔍 QUERY AGENT - Detected field validation error in resumed execution, attempting auto-correction...');
              console.log('🔍 QUERY AGENT - Error message:', error.message);
              console.log('🔍 QUERY AGENT - DEBUG: Field correction logic triggered');
              
              const originalQuery = toolInvokeArgs.query || '';
              let fixedQuery = originalQuery;
              
              console.log('🔍 QUERY AGENT - Original query:', originalQuery);
              
              // Extract problematic field from error message
              const fieldMatch = error.message.match(/Field "([^"]+)"/);
              const problematicField = fieldMatch ? fieldMatch[1] : '';
              
              if (problematicField) {
                console.log('🔍 QUERY AGENT - Problematic field detected:', problematicField);
                
                                 // Apply intelligent field name corrections for common patterns
                 if (problematicField === 'results') {
                   // Replace 'results' with 'employees' for employee queries
                   fixedQuery = fixedQuery.replace(/\bresults\b/g, 'employees');
                   console.log('🔍 QUERY AGENT - Corrected "results" to "employees" (resumed)');
                 }
                 
                 if (problematicField === 'pageInfo') {
                   // Replace 'pageInfo' with 'pagination'
                   fixedQuery = fixedQuery.replace(/\bpageInfo\b/g, 'pagination');
                   console.log('🔍 QUERY AGENT - Corrected "pageInfo" to "pagination" (resumed)');
                 }
                 
                 if (problematicField === 'name') {
                   // Replace 'name' with 'firstName lastName' for employee queries
                   fixedQuery = fixedQuery.replace(/\bname\b/g, 'firstName lastName');
                   console.log('🔍 QUERY AGENT - Corrected "name" to "firstName lastName" (resumed)');
                 }
                 
                 if (problematicField === 'position') {
                   // Replace 'position' with 'jobTitle' for employee queries
                   fixedQuery = fixedQuery.replace(/\bposition\b/g, 'jobTitle');
                   console.log('🔍 QUERY AGENT - Corrected "position" to "jobTitle" (resumed)');
                 }
                 
                 if (problematicField === 'department') {
                   // Remove 'department' field as it doesn't exist in employee types
                   fixedQuery = fixedQuery.replace(/\bdepartment\b/g, '');
                   console.log('🔍 QUERY AGENT - Removed non-existent "department" field (resumed)');
                 }
                 
                                   if (problematicField === 'page') {
                    // Replace 'page' with 'currentPage' only in return fields, not in input arguments
                    // Look for 'page' that's not followed by ':' (which would be an input argument)
                    console.log('🔍 QUERY AGENT - DEBUG: Page field detected, original query:', originalQuery);
                    fixedQuery = fixedQuery.replace(/\bpage(?!\s*:)/g, 'currentPage');
                    console.log('🔍 QUERY AGENT - DEBUG: Page field corrected, fixed query:', fixedQuery);
                    console.log('🔍 QUERY AGENT - Corrected return field "page" to "currentPage" (resumed)');
                  }
                 
                 if (problematicField === 'data' && plan?.selectedQuery === 'employees') {
                   // For employees query, 'data' might need to be 'employees'
                   fixedQuery = fixedQuery.replace(/\bdata\b/g, 'employees');
                   console.log('🔍 QUERY AGENT - Corrected "data" to "employees" for employees query (resumed)');
                 }
                
                // Remove problematic field patterns if corrections don't work
                if (fixedQuery === originalQuery) {
                  const patterns = [
                    new RegExp(`\\s*${problematicField}\\s*\\{[^}]*\\}`, 'g'),  // field with block
                    new RegExp(`\\s*${problematicField}\\s*,?`, 'g'),           // field with optional comma
                    new RegExp(`\\s*,\\s*${problematicField}\\s*`, 'g'),        // comma then field
                  ];
                  
                  patterns.forEach(pattern => {
                    fixedQuery = fixedQuery.replace(pattern, ' ');
                  });
                  console.log(`🔍 QUERY AGENT - Removed problematic field "${problematicField}" (resumed)`);
                }
              }
              
              // Apply comprehensive complex field filtering
              const complexFields = [
                'dataStatus', 'events', 'incomeComponents', 'lastInviteLink',
                'missingFieldsBPO', 'missingFieldsEmployee', 'missingFieldsHR',
                'healthInsurance', 'contractData', 'paymentComponents',
                'permissions', 'roles', 'metadata', 'settings', 'preferences',
                'contractDataStatuses', 'employeeContractDataStatuses',
                'currentPage', 'totalPages', 'totalResults' // Add common wrong pagination fields
              ];
              
              complexFields.forEach(field => {
                const patterns = [
                  new RegExp(`\\s*${field}\\s*,?`, 'g'),
                  new RegExp(`\\s*,\\s*${field}\\s*`, 'g'),
                  new RegExp(`\\s*${field}\\s*`, 'g')
                ];
                patterns.forEach(pattern => {
                  fixedQuery = fixedQuery.replace(pattern, ' ');
                });
              });
              
              // Clean up the query thoroughly
              fixedQuery = fixedQuery
                .replace(/\s+/g, ' ')
                .replace(/\{\s+/g, '{ ')
                .replace(/\s+\}/g, ' }')
                .replace(/,\s*,/g, ',')
                .replace(/,\s*\}/g, ' }')
                .replace(/\{\s*,/g, '{ ')
                .replace(/\s*,\s*/g, ', ')
                .trim();
              
              console.log('🔍 QUERY AGENT - Retrying with corrected query (resumed):', fixedQuery);
              
              // Retry with the corrected query
              const retryArgs = accessToken 
                ? { query: fixedQuery, accessToken }
                : { query: fixedQuery };
              
              try {
                result = await tool.invoke(retryArgs);
                console.log('🔍 QUERY AGENT - Field validation error correction successful (resumed)!');
              } catch (retryError) {
                console.error('🔍 QUERY AGENT - Field validation error correction failed (resumed):', retryError);
                throw retryError;
              }
            } else {
              throw error;
            }
          }
          
          results.push({
            step: step.tool,
            input: toolArgs,
            output: result
          });

          console.log(`🔍 QUERY AGENT - Step ${step.tool} completed (resumed execution):`, result);
        }
      }

      // Generate final response
      const executeQueryResult = results.find(r => r.step === 'execute-query');
      let cleanData: any = null;
      let resultSummary = 'Query completed successfully (resumed execution).';
      
      if (executeQueryResult && executeQueryResult.output) {
        try {
          const queryOutput = typeof executeQueryResult.output === 'string' 
            ? JSON.parse(executeQueryResult.output) 
            : executeQueryResult.output;
          
          cleanData = queryOutput.data;
          
          // Generate dynamic summary
          const selectedQueryName = plan.selectedQuery || 'unknown';
          
          if (cleanData) {
            if (selectedQueryName === 'me') {
              const userData = cleanData[selectedQueryName];
              if (userData) {
                const name = userData.firstName || userData.email || userData.id || 'Unknown';
                resultSummary = `Successfully retrieved user data for ${name} (resumed execution).`;
              }
            } else if (selectedQueryName.includes('employees') && cleanData.employees?.employees) {
              const employeeCount = cleanData.employees.employees.length;
              resultSummary = `Successfully retrieved ${employeeCount} employee${employeeCount !== 1 ? 's' : ''} (resumed execution).`;
            } else {
              resultSummary = `Successfully executed ${selectedQueryName} query (resumed execution).`;
            }
          }
        } catch (error) {
          console.error('Error parsing execute-query result:', error);
          resultSummary = 'Query completed but data parsing failed (resumed execution).';
        }
      }

      return {
        success: true,
        task: task.description,
        data: cleanData,
        summary: resultSummary,
        executedAt: new Date().toISOString(),
        metadata: {
          resumedExecution: true,
          originalPlan: plan,
          typeDetailsUsed: savedState.needsTypeDetails.typeNames
        }
      };
    },

    /**
     * Builds a comprehensive type details summary from structured MCP pattern analysis
     */
    buildStructuredTypeDetailsSummary(patterns: any): string {
      if (!patterns) return 'No pattern analysis available';

      let summary = 'MCP Structured Pattern Analysis:\n';

      // Input Types Information
      if (patterns.inputTypes?.length > 0) {
        summary += `📥 Input Types (${patterns.inputTypes.length}):\n`;
        patterns.inputTypes.forEach((inputType: any) => {
          summary += `  • ${inputType.name}`;
          if (inputType.isFilter) summary += ' (Filter)';
          if (inputType.isAdvanced) summary += ' (Advanced)';
          if (inputType.requiredFields?.length > 0) {
            summary += ` - Required: ${inputType.requiredFields.join(', ')}`;
          }
          summary += '\n';
        });
      }

      // Common Arguments
      if (patterns.commonArguments) {
        const commonArgs = Object.entries(patterns.commonArguments)
          .filter(([_, value]) => value)
          .map(([key, _]) => key);
        if (commonArgs.length > 0) {
          summary += `🔧 Common Arguments: ${commonArgs.join(', ')}\n`;
        }
      }

      // Common Fields
      if (patterns.commonFields) {
        const commonFields = Object.entries(patterns.commonFields)
          .filter(([_, value]) => value)
          .map(([key, _]) => key);
        if (commonFields.length > 0) {
          summary += `🏷️ Common Fields: ${commonFields.join(', ')}\n`;
        }
      }

      // Union Types
      if (patterns.unionTypes?.length > 0) {
        summary += `🔀 Union Types (${patterns.unionTypes.length}):\n`;
        patterns.unionTypes.forEach((unionType: any) => {
          summary += `  • ${unionType.name}: ${unionType.possibleTypes?.join(', ') || 'Unknown members'}\n`;
        });
      }

      // Pagination Info
      if (patterns.pagination?.detected) {
        summary += `📄 Pagination: Available (${patterns.pagination.fields?.join(', ') || 'standard fields'})\n`;
      }

      // Query Hints
      if (patterns.queryHints?.length > 0) {
        summary += `💡 Query Hints:\n`;
        patterns.queryHints.forEach((hint: string) => {
          summary += `  • ${hint}\n`;
        });
      }

      return summary;
    },

    /**
     * Builds an enhanced query prompt using MCP LLM guidance and structured pattern analysis
     */
    buildEnhancedQueryPrompt(
      selectedQueryName: string,
      queryContext: any,
      typeDetailsSummary: string,
      structuredPatterns: any,
      llmGuidance?: string
    ): string {
      let prompt = `🚨 CRITICAL: Generate a GraphQL query using ONLY the exact field names provided in the schema analysis below.

Query: "${selectedQueryName}"
Task: ${queryContext.task}

Query Details: ${queryContext.queryDetails?.substring?.(0, 500) || 'No details'}...

⚠️ FIELD USAGE RULES:
1. Use ONLY the field names explicitly listed in the type definitions below
2. DO NOT invent or assume field names (like "name", "position", "department")
3. DO NOT use common field names unless they appear in the schema
4. If you're unsure about a field name, omit it entirely

🔄 FIELD CONSISTENCY RULES:
1. Input and output fields must use the same names
2. If input has pagination: { limit: 20, currentPage: 1 }, output must use: pagination { limit currentPage }
3. If input has companyId, output may not need companyId (it's a filter, not a return field)
4. Match field types exactly - don't mix scalar/complex fields

`;

      // Prioritize LLM guidance from MCP tool if available
      if (llmGuidance && llmGuidance.trim()) {
        prompt += `ENHANCED MCP GUIDANCE:
${llmGuidance}

`;
      } else {
        // Fallback to basic type analysis
        prompt += `Type Analysis:
${typeDetailsSummary}

`;

        // Add specific instructions based on structured patterns
        if (structuredPatterns) {
          prompt += `STRUCTURED GUIDANCE (from MCP analysis):

`;

          // Build field consistency mappings
          const fieldMappings = this.buildFieldConsistencyMappings(structuredPatterns);
          if (fieldMappings.length > 0) {
            prompt += `🔄 FIELD CONSISTENCY MAPPINGS:
${fieldMappings.join('\n')}

`;
          }

          // Input type guidance
          if (structuredPatterns.inputTypes?.length > 0) {
            prompt += `📥 INPUT TYPES DETECTED:\n`;
            structuredPatterns.inputTypes.forEach((inputType: any) => {
              prompt += `  • ${inputType.name}`;
              if (inputType.requiredFields?.length > 0) {
                prompt += ` requires: ${inputType.requiredFields.join(', ')}`;
              }
              prompt += '\n';
            });
            prompt += '\n';
          }

          // Argument structure guidance
          if (structuredPatterns.commonArguments) {
            const args: string[] = [];
            if (structuredPatterns.commonArguments.companyId) {
              args.push('companyId: "{{auto_companyid}}"');
            }
            if (structuredPatterns.commonArguments.conditionType) {
              args.push('conditionType: AND');
            }
            if (structuredPatterns.commonArguments.pagination) {
              args.push('pagination: { limit: 20, currentPage: 1 }');
            }
            
            if (args.length > 0) {
              prompt += `🔧 REQUIRED ARGUMENTS:\n  { ${args.join(', ')} }\n\n`;
            }
          }

          // Field selection guidance with consistency rules
          if (structuredPatterns.commonFields) {
            const fields = Object.entries(structuredPatterns.commonFields)
              .filter(([_, value]) => value)
              .map(([key, _]) => key);
            
            if (fields.length > 0) {
              prompt += `🏷️ RECOMMENDED FIELDS (ensure consistency with input args):\n  ${fields.join(', ')}\n\n`;
            }
          }

          // Union type guidance
          if (structuredPatterns.unionTypes?.length > 0) {
            prompt += `🔀 UNION TYPE HANDLING:\n`;
            structuredPatterns.unionTypes.forEach((unionType: any) => {
              prompt += `  • ${unionType.name}: Use inline fragments\n`;
              if (unionType.possibleTypes?.length > 0) {
                unionType.possibleTypes.forEach((type: string) => {
                  prompt += `    ... on ${type} { id email firstName lastName }\n`;
                });
              }
            });
            prompt += '\n';
          }

          // Custom query hints
          if (structuredPatterns.queryHints?.length > 0) {
            prompt += `💡 SPECIFIC HINTS:\n`;
            structuredPatterns.queryHints.forEach((hint: string) => {
              prompt += `  • ${hint}\n`;
            });
            prompt += '\n';
          }
        }
      }

      // Add core rules - but make them more concise if we have LLM guidance
      if (llmGuidance && llmGuidance.trim()) {
        prompt += `🎯 CRITICAL EXECUTION RULES:
1. Query name: "${selectedQueryName}"
2. Follow the MCP guidance above precisely  
3. Use ONLY field names that appear in the "Safe Scalar Fields" or type definitions above
4. DO NOT use: "name", "position", "department", "page", or any other fields not explicitly shown
5. ENSURE input/output field consistency (same field names in both places)
6. Generate ONLY the GraphQL query (no explanations)

REMINDER: The schema shows exact field names like "firstName", "lastName", "jobTitle" - use these EXACTLY as shown.

Target Query: "${selectedQueryName}"`;
      } else {
        prompt += `🎯 CRITICAL EXECUTION RULES:
1. Query name: "${selectedQueryName}"
2. Use ONLY field names that appear in the type analysis above
3. DO NOT invent field names like "name", "position", "department"
4. Use SCALAR fields only (avoid complex objects without subfield selection)
5. For nested objects, include proper structure (e.g., employees { employees { fields } pagination { fields } })
6. ENSURE field consistency: input pagination: { limit } → output pagination { limit }
7. AVOID these complex fields: dataStatus, events, incomeComponents, contractData, permissions, roles
8. For errors with "must have a selection of subfields", remove that field entirely

🚨 FIELD NAME RESTRICTIONS:
- Use "firstName" and "lastName", NOT "name"
- Use "jobTitle", NOT "position"  
- Use "email", "id", "status" as shown in schema
- DO NOT use "department" (it doesn't exist)
- For pagination: use "limit" and "page" consistently in both input and output
- DO NOT add "totalItems" to output if not in input

EXAMPLES:`;

        // Add context-aware examples
        if (selectedQueryName === 'me') {
          prompt += `
- me (union): query { me { ... on OnboardingAdmin { id email firstName lastName } ... on OnboardingEmployee { id email firstName lastName } } }`;
        } else if (selectedQueryName.includes('employee')) {
          prompt += `
- employees: query { employees(data: { companyId: "{{auto_companyid}}", conditionType: AND, pagination: { limit: 20 } }) { employees { id firstName lastName email status } pagination { limit } } }`;
        } else {
          prompt += `
- general: query { ${selectedQueryName}(data: { companyId: "{{auto_companyid}}" }) { id } }`;
        }

        prompt += `

Generate ONLY the GraphQL query (no explanations):`;
      }

      return prompt;
    },

    /**
     * Build field consistency mappings from structured patterns
     */
    buildFieldConsistencyMappings(structuredPatterns: any): string[] {
      const mappings: string[] = [];
      
      // Pagination consistency
      if (structuredPatterns.commonArguments?.pagination && structuredPatterns.pagination?.detected) {
        const inputFields = ['limit', 'page'];
        const outputFields = structuredPatterns.pagination.fields || [];
        
        // Find matching fields
        const consistentFields = inputFields.filter(field => 
          outputFields.includes(field) || outputFields.includes(field.toLowerCase())
        );
        
        if (consistentFields.length > 0) {
          mappings.push(`  pagination: { ${inputFields.join(', ')} } → pagination { ${consistentFields.join(' ')} }`);
        }
      }
      
      // Common field mappings
      const fieldMappings = {
        'companyId': 'Used in input only (filter), not in output',
        'conditionType': 'Used in input only (filter), not in output',
        'id': 'Available in both input (for filtering) and output',
        'email': 'Available in both input (for filtering) and output',
        'status': 'Available in both input (for filtering) and output'
      };
      
      Object.entries(fieldMappings).forEach(([field, description]) => {
        if (structuredPatterns.commonFields?.[field] || structuredPatterns.commonArguments?.[field]) {
          mappings.push(`  ${field}: ${description}`);
        }
      });
      
      return mappings;
    }
  };
}

/**
 * Checks if a query details result contains type names that need detailed introspection
 */
function checkIfTypeDetailsNeeded(result: any): { needed: boolean; typeNames: string[] } {
  const typeNames = new Set<string>();
  
  // Handle both string results and object results
  let text = '';
  if (typeof result === 'string') {
    text = result;
  } else if (result && typeof result === 'object') {
    if (result.content) {
      const content = Array.isArray(result.content) ? result.content[0]?.text || '' : result.content;
      text = typeof content === 'string' ? content : JSON.stringify(content);
    } else {
      text = JSON.stringify(result);
    }
  }
  
  if (!text) return { needed: false, typeNames: [] };
  
  console.log('🔍 QUERY AGENT - Analyzing text for type names:', text.substring(0, 200) + '...');
  
  // Look for type names in the query details
  // Pattern like "data: EmployeeAdvancedFilterForHrInput!" or "): EmployeeAdvancedFilterForHr!"
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
        if (typeName && !isGraphQLScalarType(typeName) && isComplexTypeName(typeName)) {
          typeNames.add(typeName);
          console.log(`🔍 QUERY AGENT - Found complex argument type: ${typeName}`);
        }
      });
    }
    
    // Look for return types - pattern like "): ReturnType!" 
    const returnTypeMatches = trimmedLine.match(/\):\s*([A-Z]\w+)(!|\s|$)/g);
    if (returnTypeMatches) {
      returnTypeMatches.forEach(match => {
        const typeName = match.replace(/\):\s*/, '').replace(/[!\s]/g, '');
        if (typeName && !isGraphQLScalarType(typeName) && isComplexTypeName(typeName)) {
          typeNames.add(typeName);
          console.log(`🔍 QUERY AGENT - Found complex return type: ${typeName}`);
        }
      });
    }
  }
  
  const result_types = Array.from(typeNames);
  console.log(`🔍 QUERY AGENT - Found ${result_types.length} types needing details:`, result_types);
  
  return {
    needed: result_types.length > 0,
    typeNames: result_types
  };
}

/**
 * Checks if a type name is a GraphQL scalar
 */
function isGraphQLScalarType(typeName: string): boolean {
  const scalars = ['String', 'Int', 'Float', 'Boolean', 'ID', 'JSON', 'DateTime', 'Date', 'Time'];
  return scalars.includes(typeName);
}

/**
 * Checks if a type name looks like a complex type that needs details
 */
function isComplexTypeName(typeName: string): boolean {
  // Types ending with Input, Filter, Data, or longer than 10 characters are likely complex
  return (
    typeName.endsWith('Input') ||
    typeName.endsWith('Filter') ||
    typeName.endsWith('Data') ||
    typeName.length > 10 ||
    typeName.includes('Advanced') ||
    typeName.includes('For')
  );
}

/**
 * Checks if type details already exist in completed tasks
 */
function checkForExistingTypeDetails(state: any, typeNames: string[]): { found: boolean; data?: any } {
  console.log(`🔍 QUERY AGENT - Checking for existing type details for: ${typeNames.join(', ')}`);
  
  // Check if state has memory with task state
  const taskState = state.memory?.get('taskState');
  if (!taskState || !taskState.tasks) {
    console.log(`🔍 QUERY AGENT - No task state found`);
    return { found: false };
  }
  
  // Look for completed type details tasks
  const completedTasks = taskState.tasks.filter((task: any) => 
    task.type === 'type_details' && 
    task.status === 'completed' && 
    task.result
  );
  
  console.log(`🔍 QUERY AGENT - Found ${completedTasks.length} completed type details tasks`);
  
  for (const task of completedTasks) {
    const result = task.result;
    if (result && result.data && result.data.typeDetails) {
      console.log(`🔍 QUERY AGENT - Checking task ${task.id} for type details`);
      
      // Check if this task has the type details we need
      const hasNeededTypes = typeNames.some(typeName => 
        Object.keys(result.data.typeDetails).some(key => 
          key.includes(typeName) || result.data.typeDetails[key]
        )
      );
      
      if (hasNeededTypes) {
        console.log(`🔍 QUERY AGENT - Found matching type details in task ${task.id}`);
        return { 
          found: true, 
          data: result.data.typeDetails 
        };
      }
    }
  }
  
  console.log(`🔍 QUERY AGENT - No matching type details found`);
  return { found: false };
}


