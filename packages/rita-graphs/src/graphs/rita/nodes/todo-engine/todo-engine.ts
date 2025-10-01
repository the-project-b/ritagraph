import { ChatOpenAI } from "@langchain/openai";
import { Node } from "../../graph-state.js";

import {
  from,
  bufferCount,
  filter,
  map,
  concatMap,
  toArray,
  lastValueFrom,
} from "rxjs";
import { BASE_MODEL_CONFIG } from "../../../model-config.js";
import { PromptTemplate } from "@langchain/core/prompts";

import { ToolNode } from "@langchain/langgraph/prebuilt";
import { randomUUID } from "crypto";
import { isHumanMessage } from "@langchain/core/messages";
import { addTodoTool } from "./add-todo-tool/tool.js";

const WINDOW_SIZE = 5;
const OVERLAP = 2;

export type AgentTodoItem = {
  id: string; // Id that is first four letters of a UUID and then an index number
  taskDescription: string;
  translatedTaskDescription: string;
  relatedEmployeeName: string;
  effectiveDate: string;
  createdAt: string;
  status: "pending" | "completed" | "cancled";
  runId: string;
  iteration: number;
};

const PROMPT_TEMPLATE = `You are part of a payroll agent system.
You will be given text step by step so you might even see partial sentences.
If there is no todo left just say "No more tool calls".

Your task is to extract todos from the following text (if any are present):
Do not repeat existing todos.

<existingTodos>
{existingTodos}
</existingTodos>

This is the user message:
<userMessage>
{input}
</userMessage>
`;

/**
 * The todo engine is responsible for extracting the todos from the users request.
 * Especially for large requests this is helpful to break down the request into smaller parts.
 *
 * The core logic is simply a loop where an agent can create new todos given the input and the list of already created todos.
 * Furthermore it has a tool called "scrollFurther" that can be used to scroll further in the request (in case its a bigger one)
 *
 * The best way to do that actually will be rxjs streams of messages
 */
export const todoEngine: Node = async (state, config, getAuthUser) => {
  const { token } = getAuthUser(config);
  const { preferredLanguage } = state;

  const llm = new ChatOpenAI({ ...BASE_MODEL_CONFIG, temperature: 0.1 });

  const existingTodos: AgentTodoItem[] = [];
  const addTodo = (todo: Omit<AgentTodoItem, "id">) => {
    const uuid = randomUUID();
    const todoId = `${uuid.slice(0, 4)}-${existingTodos.length}`;
    existingTodos.push({ ...todo, id: todoId });
  };
  const tools = [
    addTodoTool({
      extendedContext: { addTodo, locale: preferredLanguage },
      accessToken: token,
      selectedCompanyId: state.selectedCompanyId,
      agentActionLogger: state.agentActionLogger,
    }),
  ];

  const handleChunkWithLLM = async ({
    chunk,
  }: {
    chunk: Array<string>;
    index: number;
  }) => {
    const input = chunk.join("\n");

    while (true) {
      const promptTemplate = await PromptTemplate.fromTemplate(
        PROMPT_TEMPLATE,
      ).format({
        input,
        existingTodos: existingTodos
          .map(
            (todo) =>
              `${todo.taskDescription} for ${todo.relatedEmployeeName} - Effective at: ${todo.effectiveDate}`,
          )
          .join("\n"),
      });
      const response = await llm.bindTools(tools).invoke(promptTemplate);

      // If the LLM decided to call a tool, execute it via a ToolNode
      const maybeToolCalls = response?.tool_calls;

      if (maybeToolCalls?.length === 0) {
        break;
      }

      if (Array.isArray(maybeToolCalls) && maybeToolCalls.length > 0) {
        const toolNode = new ToolNode(tools);
        try {
          await toolNode.invoke({ messages: [response] });
        } catch (e) {
          console.error("[todo-engine] tool execution failed", e);
        }
      }
    }

    return "No more tool calls";
  };

  const lastUserMessage = state.messages
    .filter(isHumanMessage)
    .at(-1)
    ?.content.toString();

  const stride = Math.max(1, WINDOW_SIZE - OVERLAP);
  const exampleLines = lastUserMessage
    .split(/\r?\n/)
    .filter((l) => l.length > 0);

  const processing$ = from(exampleLines).pipe(
    bufferCount(WINDOW_SIZE, stride),
    filter((chunk) => chunk.length > 0),
    map((chunk, index) => ({ chunk, index })),
    concatMap((payload) => handleChunkWithLLM(payload)),
    toArray(),
  );

  try {
    await lastValueFrom(processing$);
  } catch (err) {
    console.error("[todo-engine rxjs] error", err);
  }

  return { todos: existingTodos };
};
