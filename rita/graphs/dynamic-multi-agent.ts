import { ChatOpenAI } from "@langchain/openai";
import { createSupervisor } from "@langchain/langgraph-supervisor";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import client from "../mcp/client";
import { SystemMessage } from "@langchain/core/messages";
import { spawnReactAgent } from "../agents/reactAgent.js";
import { MemorySaver } from "@langchain/langgraph";
import { BaseStateAnnotation, MergedAnnotation } from "../states/states.js";

const create_dynamic_multi_agent_graph = async () => {
  const expensiveModelWithoutTools = new ChatOpenAI({
    model: "gpt-4o",
    temperature: 0.7,
    presencePenalty: 0,
    frequencyPenalty: 0,
    topP: 0.9,
  });

  const queryAndSDLTools = await client.getTools([
    "execute-query",
    "get-tag-sdl",
  ]);
  const userInfoTools = await client.getTools(["get-current-user"]);
  // const mutationTools = await client.getTools(["execute-mutation"]);

  const memory = new MemorySaver();

  // Create all of the agents
  const userAgent = spawnReactAgent({
    model: expensiveModelWithoutTools,
    tools: queryAndSDLTools,
    prompt: new SystemMessage(
      "You are an AI assistant specialized in finding out information about the person that is talking to you. You do this through learning about the GraphQL SDL using the 'get-tag-sdl' tool and based on that GraphQL Schema you use the 'execute-query' with a correctly structured query to pull the information needed."
    ),
    name: "user_agent",
    checkpointer: memory
  });

  const employeesAgent = spawnReactAgent({
    model: expensiveModelWithoutTools,
    tools: queryAndSDLTools,
    prompt: new SystemMessage(
      "You are an AI assistant specialized in finding out information about the employees of the company of the person that is talking to you, to be able to pull the list of employees you need to know about the users companyId. You do this through learning about the GraphQL SDL using the 'get-tag-sdl' tool and based on that GraphQL Schema you use the 'execute-query' with a correctly structured query to pull the information needed."
    ),
    name: "employees_agent",
    checkpointer: memory
  });

  // Create sub-supervisors
  const queryInfoSupervisor = createSupervisor<typeof MergedAnnotation>({
    agents: [userAgent, employeesAgent],
    llm: expensiveModelWithoutTools,
    outputMode: "last_message",
    supervisorName: "query_info_supervisor",
    prompt:
      "Your supervisor will give you a request to get specific information about the user, it's company and the employees of the company. You will need to use the user_agent to find out information about the user and the employees_agent to find out information about the employees of the company of the user.",
  }).compile({ name: "query_info_supervisor" });

  // Create top level supervisor
  const workflow = createSupervisor<typeof MergedAnnotation>({
    agents: [queryInfoSupervisor],
    llm: expensiveModelWithoutTools,
    prompt:
      "You are a team supervisor and your sole goal is helping the user with their request in a professional manner. You do this by using the user_agent to find out information about the user and the employees_agent to find out information about the employees of the company of the user.",
    outputMode: "full_history",
    supervisorName: "top_level_supervisor"
  });

  // Compile and run
  const graph = workflow.compile({ checkpointer: memory, name: "top_level_supervisor" });

  return graph;
};

export { create_dynamic_multi_agent_graph };
