import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import {
  GraphQLResponseSchema,
  spawnReactAgent,
  spawnReactAgentWithPeerTools,
} from "../agents/reactAgent.js";
import { MemorySaver } from "@langchain/langgraph";
import { MergedAnnotation } from "../states/states.js";
import client from "../mcp/client.js";
import { AgentConfig, PeerCommunicationConfig } from "../placeholders/types.js";
import { createCustomSupervisor } from "../supervisors/customSupervisor.js";
import {
  createPeerHandoffTool,
  createReturnToSupervisorTool,
} from "../tools/handoffTools.js";
import { gqlPT } from "../tools/gqlPT.js";

/**
 * Create the dynamic multi-agent graph with full state control and peer communication
 * This is the main orchestration function that creates specialized agents
 * and coordinates them through a custom supervisor with optional peer-to-peer communication
 */
const createCustomDynamicMultiAgentGraph = async () => {
  const expensiveModelWithoutTools = new ChatOpenAI({
    model: "gpt-4o",
    temperature: 0.7,
    presencePenalty: 0,
    frequencyPenalty: 0,
    topP: 0.9,
  });

  const queryTools = await client.getTools(["execute-query"]);

  const sdlTools = await client.getTools(["get-tag-sdl"]);

  const gqlPTTools = gqlPT;

  const memory = new MemorySaver();

  // Configure peer-to-peer communication
  const peerCommunicationConfig: PeerCommunicationConfig = {
    enabled: true,
    alwaysReturnToSupervisor: false, // Force agents to return to supervisor for better control
    maxPeerHops: 5, // Reduce to 2 to prevent excessive peer-to-peer loops
  };

  const supervisorName = "custom_supervisor";

  const peerHandoffToolGraphQL = createPeerHandoffTool(
    "graphql_query_agent",
    supervisorName,
    peerCommunicationConfig,
    "Specialized in triggering correct GraphQL queries based on human language input. You MUST provide a task for this tool to complete, the task should be in human natural language."
  );

  // Create peer tools for each agent
  const userAgentPeerTools = [
    peerHandoffToolGraphQL,
    createReturnToSupervisorTool(supervisorName),
  ];

  const employeesAgentPeerTools = [
    peerHandoffToolGraphQL,
    createReturnToSupervisorTool(supervisorName),
  ];

  const graphqlQueryAgentPeerTools = [
    createPeerHandoffTool(
      "employees_agent",
      supervisorName,
      peerCommunicationConfig,
      "Specialized in retrieving company employee information using GraphQL queries. Requires user's company context."
    ),
    createPeerHandoffTool(
      "user_info_agent",
      supervisorName,
      peerCommunicationConfig,
      "Specialized in retrieving user information including profile details, preferences, and account data using GraphQL queries."
    ),
    createReturnToSupervisorTool(supervisorName),
  ];

  // Create agents with peer communication tools included
  const userAgent = spawnReactAgentWithPeerTools(
    {
      model: expensiveModelWithoutTools,
      tools: queryTools,
      prompt: new SystemMessage(
        `You are an AI assistant, you are highly specialized in introspection of GraphQL SDL schemas and using this information to build correct queries.
      If you fail to build a correct query, read the error message returned by your tool, the GraphQL SDL you can or have pulled has ALL information required to build a correct query.
            
      You are an AI assistant specialized in finding out information about the person that is talking to you.

      These are the steps you need to follow:
      - Reach out to the graphql_query_agent to build the correct query
          - MAKE SURE TO PASS ALL RELEVANT INFORMATION to the graphql_query_agent
      - Use the returned response from the graphql_query_agent to answer your supervisor

      ALWAYS:
      - Pass the information that is important to the next agent / tool as arguments.

      When working with peers:
      - Use peer_transfer_to_graphql_query_agent to request a specialist to build you the correct query
      - Use return_to_custom_supervisor when you need supervisor oversight or task completion`
      ),
      name: "user_info_agent",
      checkpointer: memory,
      stateSchema: MergedAnnotation,
    },
    userAgentPeerTools
  );

  const employeesAgent = spawnReactAgentWithPeerTools(
    {
      model: expensiveModelWithoutTools,
      tools: queryTools,
      prompt: new SystemMessage(
        `You are an AI assistant, you are highly specialized in introspection of GraphQL SDL schemas and using this information to build correct queries.
      If you fail to build a correct query, read the error message returned by your tool, the GraphQL SDL you can or have pulled has ALL information required to build a correct query.
            
      You are an AI assistant specialized in finding out information about the person that is talking to you.

      These are the steps you need to follow:
      - Reach out to the graphql_query_agent to build the correct query
          - MAKE SURE TO PASS ALL RELEVANT INFORMATION to the graphql_query_agent
      - Use the returned response from the graphql_query_agent to answer your supervisor

      ALWAYS:
      - Pass the information that is important to the next agent / tool as arguments.

      When working with peers:
      - Use peer_transfer_to_graphql_query_agent to request a specialist to build you the correct query
      - Use return_to_custom_supervisor when you need supervisor oversight or task completion`
      ),
      name: "employees_agent",
      checkpointer: memory,
      stateSchema: MergedAnnotation,
    },
    employeesAgentPeerTools
  );

  const graphqlQueryAgent = spawnReactAgentWithPeerTools(
    {
      model: expensiveModelWithoutTools,
      tools: [gqlPTTools], // ✅ Use the gqlPT tool instead of sdlTools
      prompt: new SystemMessage(
        `You are a specialized GraphQL query builder.
        Your peers or supervisor will reach out to you with a question
        Your task is to use the 'gql_pt' tool available to you to answer this question
        Send the information the user requested in full back to the peer or supervisor`
      ),
      name: "graphql_query_agent",
      checkpointer: memory,
      stateSchema: MergedAnnotation,
    },
    graphqlQueryAgentPeerTools
  );

  // Define agent configurations with peer communication setup
  const agentConfigs: AgentConfig[] = [
    {
      name: "user_info_agent",
      agent: userAgent,
      description:
        "Specialized in retrieving user information including profile details, preferences, and account data using GraphQL queries.",
      canTalkTo: ["employees_agent", "graphql_query_agent"], // User agent can collaborate with employees agent
    },
    {
      name: "employees_agent",
      agent: employeesAgent,
      description:
        "Specialized in retrieving company employee information using GraphQL queries. Requires company information of the user.",
      canTalkTo: ["user_info_agent", "graphql_query_agent"], // Employees agent can collaborate with user agent
    },
    {
      name: "graphql_query_agent",
      agent: graphqlQueryAgent,
      description:
        "Requires a human natural language task, will return data from the actual database through GraphQL",
      canTalkTo: ["employees_agent", "user_info_agent"], // User agent can collaborate with employees agent
    },
  ];

  console.log(`---CREATED AGENTS WITH PEER COMMUNICATION TOOLS---`);

  // Create the custom supervisor workflow with peer communication
  const workflow = createCustomSupervisor({
    agents: agentConfigs,
    llm: expensiveModelWithoutTools,
    supervisorName,
    prompt: `You are an AI supervisor, a user will ask you questions, you will need to delegate the task to the most appropriate agent.

    ALWAYS PASS TO YOUR AGENTS:
    - userId
    - companyId
    - fullName
    - email
    - <any additional information we pull earlier in the thread>

    AGENTS AVAILABLE:
    - employees_agent: Retrieves company employee information using GraphQL (requires user company context)
    - user_info_agent: Retrieves user information, profile details, and account data using GraphQL
    - graphql_query_agent: If the question is about data but it doesnt fall under the other available tools, ask the question to this agent / tool

    USER INFO:
    Full Name: Americo Turcotte
    Email: hradmin_one_turcotte_917034775@zfprmusw.mailosaur.net
    UserId: hradmin3
    CompanyId: companyclient3`,
    outputMode: "last_message", // Keep full conversation history
    addHandoffBackMessages: true,
    stateSchema: MergedAnnotation,
    peerCommunication: peerCommunicationConfig, // Enable peer communication
  });

  // Compile the graph with memory
  const graph = workflow.compile({
    checkpointer: memory,
    name: supervisorName,
  });

  return graph;
};

export { createCustomDynamicMultiAgentGraph };
