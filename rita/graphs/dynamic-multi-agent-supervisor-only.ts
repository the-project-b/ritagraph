import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import {
  spawnReactAgent,
} from "../agents/reactAgent.js";
import { MemorySaver } from "@langchain/langgraph";
import { MergedAnnotation } from "../states/states.js";
import client from "../mcp/client.js";
import { AgentConfig } from "../placeholders/types.js";
import { createCustomSupervisor } from "../supervisors/customSupervisor.js";

/**
 * Create the dynamic multi-agent graph with simplified supervisor-only pattern
 * This uses a hub-and-spoke model with just two agents:
 * - communication_agent: Handles user interaction and response formatting
 * - graphql_query_agent: Handles all data fetching using Neo4j Vector RAG
 */
const createSupervisorOnlyMultiAgentGraph = async () => {
  const expensiveModelWithoutTools = new ChatOpenAI({
    model: "gpt-4o",
    temperature: 0,
    presencePenalty: 0,
    frequencyPenalty: 0,
    topP: 0.9,
  });

  // Get MCP tools including the new Neo4j Vector RAG query tool
  const queryAndSDLTools = await client.getTools([
    "execute-query",
    "get-tag-sdl",
    "get-available-tags",
  ]);
  const memory = new MemorySaver();
  const supervisorName = "supervisor";

  // Communication agent - handles user interaction and formatting
  const communicationAgent = spawnReactAgent({
    model: expensiveModelWithoutTools,
    tools: [], // No tools needed - just for communication and formatting
    prompt: new SystemMessage(
      `You are a communication specialist agent responsible for user interaction and response formatting.
      
      Your role is to:
      1. Take raw data from other agents and format it in a user-friendly way
      2. Provide clear, well-structured responses to users
      3. Handle follow-up questions and clarifications
      4. Ensure responses are in the language and tone appropriate for the user
      
      You will receive data from other agents via your supervisor and should:
      - Format the data clearly and professionally
      - Add context and explanations where helpful
      - Structure responses logically
      - Make technical data accessible to non-technical users
      - Present query results in tables, lists, or other appropriate formats
      
      Your supervisor will provide you with raw data and ask you to format it for the user.
      Do not try to fetch data yourself - focus on communication and presentation.`
    ),
    name: "communication_agent",
    checkpointer: memory,
    stateSchema: MergedAnnotation,
  });

  // GraphQL query agent - handles all data fetching using SDL tree shaking
  const graphqlQueryAgent = spawnReactAgent({
    model: expensiveModelWithoutTools,
    tools: queryAndSDLTools, // SDL tree shaking tools
    prompt: new SystemMessage(
      `You are a GraphQL query specialist using SDL tree shaking for efficient data retrieval.

      WORKFLOW (follow these steps in order):
      1. Use 'get-available-tags' to see all available tags
      2. Select relevant tags that match the data request (e.g., 'employee,query,list,hr' for employee data)
      3. Use 'get-tag-sdl' with your selected tags to get the filtered GraphQL schema
      4. Build a GraphQL query based on the filtered SDL
      5. Use 'execute-query' to run the query and return the data

      TAG SELECTION EXAMPLES:
      - "Get all employees" → tags: 'employee,query,list,hr'
      - "Get user profile" → tags: 'user,query,profile'
      - "Get employee details" → tags: 'employee,query,detail'
      - "Update user settings" → tags: 'user,mutation,settings'

      Always start with 'get-available-tags' to understand what's available, then build your tag combination strategically.`
    ),
    name: "graphql_query_agent",
    checkpointer: memory,
    stateSchema: MergedAnnotation,
  });

  // Define agent configurations (no peer communication)
  const agentConfigs: AgentConfig[] = [
    {
      name: "communication_agent",
      agent: communicationAgent,
      description:
        "Handles user interaction, response formatting, and communication. Takes raw data and presents it in a user-friendly format with tables, summaries, and clear explanations.",
      canTalkTo: [], // No peer communication
    },
    {
      name: "graphql_query_agent",
      agent: graphqlQueryAgent,
      description:
        "Fetches data using SDL tree shaking: first gets available tags, selects appropriate tag combinations (e.g., 'employee,query,list,hr'), gets filtered SDL schema, then builds and executes GraphQL queries.",
      canTalkTo: [], // No peer communication
    },
  ];

  console.log(`---CREATED SIMPLIFIED SUPERVISOR-ONLY AGENTS WITH SDL TREE SHAKING---`);

  // Create the custom supervisor workflow without peer communication
  const workflow = createCustomSupervisor({
    agents: agentConfigs,
    llm: expensiveModelWithoutTools,
    supervisorName,
    prompt: `You are an AI supervisor coordinating two agents to answer user questions efficiently.

    WORKFLOW:
    User question → graphql_query_agent (fetch data via SDL tree shaking) → communication_agent (format response) → User

    AGENTS:
    - graphql_query_agent: Uses SDL tree shaking workflow (get tags → select tags → get filtered SDL → query → execute)
    - communication_agent: Formats responses beautifully for users

    USER CONTEXT (include in requests to graphql_query_agent):
    - userId: hradmin3
    - companyId: companyclient3  
    - fullName: Americo Turcotte
    - email: hradmin_one_turcotte_917034775@zfprmusw.mailosaur.net

    DELEGATION EXAMPLES:
    ✅ "Get employee list for company companyclient3" → graphql_query_agent will use tags like 'employee,query,list,hr'
    ✅ "Get user profile for hradmin3" → graphql_query_agent will use tags like 'user,query,profile'

    Always provide context and let graphql_query_agent handle the technical SDL tree shaking workflow.`,
    outputMode: "last_message",
    addHandoffBackMessages: true,
    stateSchema: MergedAnnotation,
    // No peerCommunication config = traditional supervisor pattern
  });

  // Compile the graph with memory
  const graph = workflow.compile({
    checkpointer: memory,
    name: supervisorName,
  });

  return graph;
};

export { createSupervisorOnlyMultiAgentGraph }; 