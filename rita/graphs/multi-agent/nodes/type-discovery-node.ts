// Type Discovery Node - Step 3: Analyze Input and Output Types
// Your prompt: "You are a GraphQL type analyzer. Your task is to discover and analyze the structure of input and output types for the selected query."

import { Command } from "@langchain/langgraph";
import client from "../../../mcp/client.js";
import { ExtendedState } from "../../../states/states";
import { AgentType } from "../types/agents";
import { logEvent } from "../agents/supervisor-agent";

/**
 * Type Discovery Node - Fetches type details for the selected query
 */
export const typeDiscoveryNode = async (state: ExtendedState, config: any) => {
  const startTime = Date.now();
  logEvent('info', AgentType.TOOL, 'type_discovery_start', { startTime });

  try {
    // Get the selected query from state
    const selectedQuery = state.memory?.get('selectedQuery');
    if (!selectedQuery) {
      throw new Error('No selected query found. Intent matching node should run first.');
    }

    logEvent('info', AgentType.TOOL, 'discovering_types', {
      queryName: selectedQuery.name,
      inputType: selectedQuery.inputType,
      outputType: selectedQuery.outputType
    });

    // Get MCP tools
    const mcpTools = await client.getTools();
    const getTypeDetailsTool = mcpTools.find(tool => 
      tool.name === 'graphql-get-type-details'
    );

    if (!getTypeDetailsTool) {
      throw new Error('graphql-get-type-details tool not found');
    }

    // Extract access token from state or config
    const authUser =
      (config as any)?.user ||
      (config as any)?.langgraph_auth_user ||
      ((config as any)?.configurable && (config as any).configurable.langgraph_auth_user);
    const authAccessToken = authUser?.token;
    const accessToken = state.accessToken || authAccessToken;

    // Collect all types to analyze
    const typesToAnalyze = new Set<string>();
    
    // If types are Unknown, use the query name itself
    if (selectedQuery.inputType === "Unknown" && selectedQuery.outputType === "Unknown") {
      typesToAnalyze.add(selectedQuery.name);
      logEvent('info', AgentType.TOOL, 'using_query_name_as_type', {
        queryName: selectedQuery.name
      });
    } else {
      if (selectedQuery.inputType) typesToAnalyze.add(selectedQuery.inputType);
      if (selectedQuery.outputType) typesToAnalyze.add(selectedQuery.outputType);
    }

    if (typesToAnalyze.size === 0) {
      throw new Error('No types to analyze found in selected query');
    }

    // Prepare type names for the tool
    const typeNames = Array.from(typesToAnalyze).join(',');
    console.log('🔍 TYPE DISCOVERY: Analyzing types:', typeNames);

    // Prepare tool parameters
    const toolParams = {
      typeNames,
      includeRelatedTypes: true,
      accessToken: accessToken || undefined
    };

    console.log('🔍 TYPE DISCOVERY: Tool parameters:', toolParams);
    console.log('🔍 TYPE DISCOVERY: Calling getTypeDetailsTool...');

    // Call the tool to get type details
    let typeDetails = await getTypeDetailsTool.invoke(toolParams);
    console.log('🔍 TYPE DISCOVERY: Tool response received');

    // Validate type details response
    if (!typeDetails || typeof typeDetails === 'string' && typeDetails.includes('No types found')) {
      logEvent('warn', AgentType.TOOL, 'no_types_found', {
        queryName: selectedQuery.name,
        typeNames
      });
      
      // If we used the query name and got no results, try with the output type from signature
      if (selectedQuery.signature?.output?.type && selectedQuery.signature.output.type !== 'Unknown') {
        logEvent('info', AgentType.TOOL, 'retrying_with_signature_type', {
          type: selectedQuery.signature.output.type
        });
        
        const retryParams = {
          ...toolParams,
          typeNames: selectedQuery.signature.output.type
        };
        
        const retryDetails = await getTypeDetailsTool.invoke(retryParams);
        if (retryDetails && !(typeof retryDetails === 'string' && retryDetails.includes('No types found'))) {
          typeDetails = retryDetails;
        }
      }
    }

    // Store the raw type details in the selected query
    const updatedMemory = new Map(state.memory || new Map());
    selectedQuery.rawTypeDetails = typeDetails;
    updatedMemory.set('selectedQuery', selectedQuery);

    logEvent('info', AgentType.TOOL, 'type_discovery_completed', {
      queryName: selectedQuery.name,
      duration: Date.now() - startTime,
      typesFound: typeDetails && !(typeof typeDetails === 'string' && typeDetails.includes('No types found'))
    });

    // Continue to type processing node
    return new Command({
      goto: "TYPE_PROCESSING",
      update: {
        messages: state.messages,
        memory: updatedMemory
      }
    });

  } catch (error) {
    logEvent('error', AgentType.TOOL, 'type_discovery_error', { 
      error: error.message,
      queryName: state.memory?.get('selectedQuery')?.name
    });
    throw new Error(`Failed to get type details: ${error.message}`);
  }
};
