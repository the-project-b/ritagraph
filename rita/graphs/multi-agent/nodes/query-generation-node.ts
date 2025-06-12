// Query Generation Node - Generates GraphQL queries based on type information
// 
// ENHANCED PARAMETER RESOLUTION SYSTEM:
// 
// This node now uses context gathered by the Context Gathering Node which handles:
// 
// 1. STATIC PARAMETER EXTRACTION from user requests
// 2. DYNAMIC PARAMETER RESOLUTION from previous tasks  
// 3. USER CONTEXT INTEGRATION from authentication
// 4. PLACEHOLDER SYSTEM for unresolved parameters
// 
// USAGE EXAMPLES:
// 
// User Request: "get payments for contracts id1, id2"
// Generated Query: payments(data: {companyId: "{{companyId}}", contractIds: ["id1", "id2"]})
// 
// User Request: "show active payments"
// Generated Query: payments(data: {companyId: "{{companyId}}", contractIds: {{contractIds}}, status: ACTIVE})
// 
// User Request: "get payments for company acme"
// Generated Query: payments(data: {companyId: "acme", contractIds: {{contractIds}}})
//
import { Command } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ExtendedState } from "../../../states/states";
import { AgentType } from "../types/agents";
import { logEvent } from "../agents/supervisor-agent";
import { placeholderManager } from "../../../placeholders/manager";
import { Task } from "../types";
import { GatheredContext, ContextUtils } from "./context-gathering-node";

/**
 * Generate parameter resolution strategies description for the LLM prompt
 */
function generateParameterStrategies(gatheredContext: GatheredContext): string {
  const strategies = [];
  
  if (Object.keys(gatheredContext.staticContext).length > 0) {
    strategies.push(`STATIC VALUES: ${JSON.stringify(gatheredContext.staticContext)}`);
  }
  
  if (Object.keys(gatheredContext.userContext).length > 0) {
    strategies.push(`USER CONTEXT: ${JSON.stringify(gatheredContext.userContext)}`);
  }
  
  if (Object.keys(gatheredContext.dynamicContext).length > 0) {
    strategies.push(`DYNAMIC DATA: Available from previous queries - ${Object.keys(gatheredContext.dynamicContext).join(', ')}`);
  }

  // Add resolution strategies
  if (gatheredContext.resolutionStrategies.length > 0) {
    const strategiesDesc = gatheredContext.resolutionStrategies.map(strategy => 
      `${strategy.parameter}: confidence ${strategy.confidence} from [${strategy.sources.join(', ')}]${strategy.fallback ? ` fallback: ${strategy.fallback}` : ''}`
    ).join('\n');
    strategies.push(`RESOLUTION STRATEGIES:\n${strategiesDesc}`);
  }
  
  return strategies.length > 0 ? strategies.join('\n\n') : 'No context data available';
}

/**
 * Query Generation Node - Generates GraphQL queries based on type information
 */
export const queryGenerationNode = async (state: ExtendedState, config: any) => {
  const startTime = Date.now();
  logEvent('info', AgentType.TOOL, 'query_generation_start', { startTime });

  try {
    // Get data from previous nodes
    const taskState = state.memory?.get('taskState');

    if (!taskState) {
      throw new Error('No task state found');
    }

    const currentTaskIndex = taskState.tasks.findIndex(task => task.status === 'in_progress');
    const currentTask: Task = taskState.tasks[currentTaskIndex];
    if (!currentTask) {
      throw new Error('No current task found');
    }

    // Use improved context retrieval with fallback options
    let gatheredContext = ContextUtils.getMostRelevantContext(state, currentTask.id);
    
    if (!gatheredContext) {
      // Fallback: try to get from conversation memory (backward compatibility)
      gatheredContext = state.memory?.get('gatheredContext') as GatheredContext;
    }

    // Debug logging for context issues
    console.log('🔍 Query Generation - Context Debug:', {
      hasTaskContext: !!currentTask.context?.gatheredContext,
      hasConversationContext: !!state.memory?.get('gatheredContext'),
      taskId: currentTask.id,
      contextFromUtils: !!ContextUtils.getMostRelevantContext(state, currentTask.id),
      memoryKeys: Array.from(state.memory?.keys() || [])
    });

    if (!gatheredContext) {
      throw new Error('No gathered context found. Context gathering node should run first.');
    }

    const userRequest = state.memory?.get('userRequest');
    const selectedQuery = currentTask.queryDetails;
    
    if (!selectedQuery || !userRequest) {
      throw new Error('No selected query found. Intent matching node should run first.');
    }

    // Generate parameter strategies description
    const parameterStrategies = generateParameterStrategies(gatheredContext);

    logEvent('info', AgentType.TOOL, 'generating_query', {
      queryName: selectedQuery.selectedQueryName,
      userRequest: userRequest?.substring(0, 100),
      hasStaticContext: Object.keys(gatheredContext.staticContext).length > 0,
      hasUserContext: Object.keys(gatheredContext.userContext).length > 0,
      hasDynamicContext: Object.keys(gatheredContext.dynamicContext).length > 0,
      resolutionStrategies: gatheredContext.resolutionStrategies.length,
      contextSource: currentTask.context?.gatheredContext ? 'task_specific' : 'conversation_level'
    });

    // Use LLM to generate the query
    const model = new ChatOpenAI({ model: "gpt-4.1", temperature: 0 });
    // const model = new ChatAnthropic({ model: "claude-3-5-sonnet-20240620", temperature: 0 });
    
    const prompt = `You are a GraphQL query construction professional. CRITICAL: Return ONLY the raw query string, nothing else. Analyze the following type information and construct a query:

User Request: "${userRequest}"
Selected Query: ${selectedQuery.selectedQueryName}

Query Signature:
${selectedQuery.rawQueryDetails}

Type Information:
${selectedQuery?.rawTypeDetails}

Original Type Signatures:
- Input Type: ${selectedQuery.originalInputType || selectedQuery.signature?.input?.type}
- Output Type: ${selectedQuery.originalOutputType || selectedQuery.signature?.output?.type}

PARAMETER RESOLUTION CONTEXT:
${parameterStrategies}

SPECIAL OUTPUT TYPE HANDLING:
${selectedQuery.originalOutputType === 'EmployeeBasicData' ? `
🔍 DETECTED EmployeeBasicData OUTPUT TYPE:
- This type includes optional employeeContract fields with rich contract information
- ALWAYS include employeeContract subfields to provide comprehensive employee data
- Include key contract fields: id, personalNumber, personalNumberPayroll
- Example: employeeContract { id personalNumber personalNumberPayroll }
` : ''}

PARAMETER RESOLUTION STRATEGIES:
1. For required parameters, try to resolve in this order:
   a) Static values from user request or context
   b) User context (user ID, company ID, etc.)
   c) Dynamic data from previous query results
   d) Use placeholder syntax {{parameter_name}} for missing required values
   e) Use reasonable defaults for optional parameters

2. Common parameter patterns:
   - companyId: Use from user context or static context
   - contractIds: Use from dynamic context or placeholder {{contractIds}}
   - userId: Use from user context
   - status filters: Extract from user request (e.g., "active", "pending")
   - date ranges: Extract from user request or use reasonable defaults

3. For array parameters like contractIds:
   - If specific IDs mentioned in request, use them: ["id1", "id2"]  
   - If "all" or no specific IDs, use placeholder: {{contractIds}}
   - If user context has contracts, reference them dynamically

4. Placeholder syntax examples:
   - {{contractIds}} - will be resolved dynamically
   - {{companyId}} - will be resolved from user context
   - {{userId}} - will be resolved from user context

FIELD SELECTION RULES:
1. Follow the EXACT query signature for argument names (e.g., if signature shows 'data:', use 'data:', not 'input:')
2. Extract the union type information and available fields
3. Use the common fields provided in the type information
4. Include __typename in the query for union types
5. Follow the query hints provided
6. Ensure all required fields are included
7. Handle array types (marked with []) and non-nullable types (marked with !) appropriately
8. For EmployeeBasicData output type: ALWAYS include employeeContract { id personalNumber personalNumberPayroll }
9. For input arguments:
   - Use proper GraphQL argument syntax (not JSON)
   - For enum values, use them directly without quotes
   - For arrays, use square brackets without quotes around enum values
   - For strings, use double quotes
   - For missing required parameters, use placeholder syntax {{parameter_name}}

Example of correct argument syntax:
- For arrays of enums: [ACTIVE, PENDING]
- For string values: "some string"
- For missing required arrays: {{contractIds}}
- For missing required strings: {{companyId}}

CRITICAL: Return ONLY the raw GraphQL query string. Do not include:
- Any explanations
- Any markdown formatting
- Any code blocks
- Any additional text
- Any notes or comments

CRITICAL: Return ONLY the raw query string, nothing else.`;

    const response = await model.invoke([new HumanMessage(prompt)]);
    let query = typeof response.content === 'string' ? response.content.trim() : '';
    
    // Clean up the query
    query = query.replace(/```graphql\n?/g, '').replace(/```\n?/g, '').trim();

    // Enhanced placeholder replacement with gathered context
    try {
      const invokeObject = await placeholderManager.buildInvokeObject(query, { state: state as any, config });
      
      // Add gathered context to invoke object with explicit mapping
      Object.assign(invokeObject, gatheredContext.staticContext, gatheredContext.userContext);
      
      // CRITICAL FIX: Force resolution of auto_companyid even if not in query
      // The buildInvokeObject only resolves placeholders found in the query string,
      // but we need auto_companyid to be available for mapping to companyId
      if (!invokeObject.auto_companyid) {
        try {
          // Import the companyId resolver directly
          const { companyIdResolver } = await import('../../../placeholders/companyId');
          const autoCompanyId = await companyIdResolver.resolve({ state: state as any, config });
          if (autoCompanyId) {
            invokeObject.auto_companyid = autoCompanyId;
            console.log('🔍 Query Generation: Force-resolved auto_companyid:', autoCompanyId);
          }
        } catch (error) {
          console.warn('🔍 Query Generation: Failed to force-resolve auto_companyid:', error.message);
        }
      }
      
      // CRITICAL FIX: Force resolution of auto_contractIds even if not in query
      // The buildInvokeObject only resolves placeholders found in the query string,
      // but we need auto_contractIds to be available for mapping to contractIds
      if (!invokeObject.auto_contractIds) {
        try {
          // Import the contractIds resolver directly
          const { contractIdsResolver } = await import('../../../placeholders/contractIds');
          const autoContractIds = await contractIdsResolver.resolve({ state: state as any, config });
          if (autoContractIds && autoContractIds.trim()) {
            invokeObject.auto_contractIds = autoContractIds;
            console.log('🔍 Query Generation: Force-resolved auto_contractIds:', autoContractIds);
          }
        } catch (error) {
          console.warn('🔍 Query Generation: Failed to force-resolve auto_contractIds:', error.message);
        }
      }
      
      // Map placeholder resolver keys to expected placeholder names
      if (invokeObject.auto_companyid && !invokeObject.companyId) {
        invokeObject.companyId = invokeObject.auto_companyid;
        console.log('🔍 Query Generation: Mapped auto_companyid to companyId:', invokeObject.companyId);
      }
      
      if (invokeObject.auto_contractIds && !invokeObject.contractIds) {
        // Convert comma-separated string to array if needed
        const contractIdsValue = invokeObject.auto_contractIds;
        if (typeof contractIdsValue === 'string' && contractIdsValue.includes(',')) {
          invokeObject.contractIds = contractIdsValue.split(',').map(id => id.trim()).filter(id => id);
        } else {
          invokeObject.contractIds = contractIdsValue;
        }
        console.log('🔍 Query Generation: Mapped auto_contractIds to contractIds:', invokeObject.contractIds);
      }
      
      // Explicitly ensure critical placeholders are mapped correctly from gathered context
      if (gatheredContext.userContext.companyId) {
        invokeObject.companyId = gatheredContext.userContext.companyId;
        console.log('🔍 Query Generation: Using companyId from gathered context:', gatheredContext.userContext.companyId);
      }
      
      // Handle mustache placeholders
      const mustachePlaceholders = query.match(/\{\{([^}]+)\}\}/g) || [];
      
      for (const placeholder of mustachePlaceholders) {
        const placeholderName = placeholder.slice(2, -2).trim();
        
        console.log('🔍 Processing placeholder:', placeholderName, 'Raw value:', invokeObject[placeholderName]);
        
        if (invokeObject[placeholderName]) {
          // Check if placeholder is already quoted in the query
          const quotedPlaceholderRegex = new RegExp(`"\\{\\{${placeholderName}\\}\\}"`, 'g');
          const isAlreadyQuoted = quotedPlaceholderRegex.test(query);
          
          // Format the value properly for GraphQL
          let value = invokeObject[placeholderName];
          
          if (Array.isArray(value)) {
            // Format array values
            const formattedArray = value.map(v => 
              typeof v === 'string' ? `"${v}"` : v
            ).join(', ');
            value = `[${formattedArray}]`;
          } else if (typeof value === 'string') {
            if (isAlreadyQuoted) {
              // Placeholder is already quoted in query, use raw value
              value = value;
            } else {
              // Placeholder is not quoted, add quotes for GraphQL
              value = `"${value}"`;
            }
          }
          
          console.log('🔍 Formatted value for', placeholderName, ':', value, 'isAlreadyQuoted:', isAlreadyQuoted);
          
          // Replace placeholder with formatted value
          if (isAlreadyQuoted) {
            // Replace "{{placeholder}}" with "value"
            query = query.replace(quotedPlaceholderRegex, `"${value}"`);
          } else {
            // Replace {{placeholder}} with formatted value
            query = query.replace(new RegExp(`\\{\\{${placeholderName}\\}\\}`, 'g'), value);
          }
        } else {
          logEvent('info', AgentType.TOOL, 'unresolved_placeholder', {
            placeholder: placeholderName,
            availableParams: Object.keys(invokeObject),
            resolutionStrategies: gatheredContext.resolutionStrategies.filter(s => s.parameter === placeholderName)
          });
        }
      }
    } catch (error) {
      console.warn('🔍 Query Generation: Placeholder replacement failed:', error.message);
    }

    console.log('🔍 Query Generation: Generated query:', query);

    // Store the generated query
    const updatedMemory = new Map(state.memory || new Map());
    selectedQuery.generatedQuery = query;
    updatedMemory.set('taskState', taskState);

    logEvent('info', AgentType.TOOL, 'query_generation_completed', {
      queryName: selectedQuery.selectedQueryName,
      duration: Date.now() - startTime,
      hasUnresolvedPlaceholders: query.includes('{{'),
      contextUsed: {
        static: Object.keys(gatheredContext.staticContext).length,
        dynamic: Object.keys(gatheredContext.dynamicContext).length,
        user: Object.keys(gatheredContext.userContext).length
      },
      contextTimestamp: gatheredContext.timestamp
    });

    // Continue to query execution
    return new Command({
      goto: "QUERY_EXECUTION",
      update: {
        messages: state.messages,
        memory: updatedMemory
      }
    });

  } catch (error) {
    logEvent('error', AgentType.TOOL, 'query_generation_error', { error: error.message });
    throw new Error(`Query generation failed: ${error.message}`);
  }
}; 