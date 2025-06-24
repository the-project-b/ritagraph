import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import {
  getEmployeeById,
  findEmployeeByName,
  getAllEmployees,
  getEmployeesBySalary,
  getEmployeeContracts,
  getEmployeesWithIncompleteInfo,
  getDepartmentStats,
} from "../tools";
import { WorkflowEngineNode } from "../sub-graph";
import { searchForInformation } from "../../../tools/search-for-information";

// Task executor node - executes individual tasks using available tools
export const taskExecutor: WorkflowEngineNode = async (state) => {
  console.log("🔧 Task Executor - Executing task", state.taskIndex);

  const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  // Get the current task description based on taskIndex
  const currentTaskDescription = state.taskDescriptionsDraft[state.taskIndex];

  if (!currentTaskDescription) {
    console.log("❌ No task description found for index:", state.taskIndex);
    return {
      taskExecutionLog: state.taskExecutionLog || [],
    };
  }

  console.log("📋 Executing task:", currentTaskDescription);

  // Create a list of available tools for the LLM
  const availableTools = [
    getEmployeeById,
    findEmployeeByName,
    getAllEmployees,
    getEmployeesBySalary,
    getEmployeeContracts,
    getEmployeesWithIncompleteInfo,
    getDepartmentStats,
    searchForInformation,
  ];

  const taskPrompt =
    PromptTemplate.fromTemplate(`You are a task executor with access to database tools. 
Execute the following task using the available tools.

Previous task execution log:
{taskExecutionLog}

Task to execute: {taskDescription}

Execute this task step by step. If you need to use multiple tools, do so in sequence.
Provide a clear summary of what you found and any relevant data.`);

  const formattedPrompt = await taskPrompt.format({
    taskDescription: currentTaskDescription,
    taskExecutionLog: JSON.stringify(state.taskExecutionLog || [], null, 2),
  });

  // Create a tool-calling chain
  const chain = llm.bindTools(availableTools);

  const response = await chain.invoke(formattedPrompt);

  // Execute any tool calls that were made
  let toolResults = [];
  if (response.tool_calls && response.tool_calls.length > 0) {
    console.log("🔧 Executing tool calls:", response.tool_calls.length);

    for (const toolCall of response.tool_calls) {
      try {
        const tool = availableTools.find((t) => t.name === toolCall.name);
        if (tool) {
          const result = await tool.func(toolCall.args as any);
          toolResults.push({
            toolName: toolCall.name,
            result: result,
          });
          console.log("✅ Tool executed:", toolCall.name, result);
        }
      } catch (error) {
        console.error("❌ Tool execution failed:", toolCall.name, error);
        toolResults.push({
          toolName: toolCall.name,
          error: error.message,
        });
      }
    }
  }

  // Create a summary of the task execution
  const summaryPrompt = PromptTemplate.fromTemplate(
    `Based on the task execution results, store the result in the JSON format. 
Task description: 
{taskDescription}

Tool results: 
{toolResults}

LLM response: 
{llmResponse}`
  );

  const summaryResponse = await llm
    .withStructuredOutput(
      z.object({
        taskDescription: z.string(),
        result: z.string(),
        error: z.string(),
      })
    )
    .invoke(
      await summaryPrompt.format({
        taskDescription: currentTaskDescription,
        toolResults: JSON.stringify(toolResults, null, 2),
        llmResponse: response.content,
      })
    );

  // Add the result to existing results
  const updatedTaskResults = [
    ...(state.taskExecutionLog || []),
    {
      taskDescription: currentTaskDescription,
      result: summaryResponse.result,
      error: summaryResponse.error,
    },
  ];

  return {
    taskExecutionLog: updatedTaskResults,
    taskIndex: state.taskIndex + 1,
  };
};
