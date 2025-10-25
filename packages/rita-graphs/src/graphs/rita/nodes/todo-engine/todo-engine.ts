import { ChatOpenAI } from "@langchain/openai";
import { GraphStateType, Node } from "../../graph-state.js";

import {
  from,
  bufferCount,
  filter,
  map,
  concatMap,
  toArray,
  lastValueFrom,
  tap,
} from "rxjs";
import { BASE_MODEL_CONFIG } from "../../../model-config.js";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";

import { ToolNode } from "@langchain/langgraph/prebuilt";
import { randomUUID } from "crypto";
import { isHumanMessage } from "@langchain/core/messages";
import z from "zod";
import { createLogger } from "@the-project-b/logging";
import { addMultipleTodosTool } from "./tools/add-multiple-todos-tool/tool.js";
import { filterDuplicates } from "./util/detect-duplicates.js";

const WINDOW_SIZE = 5;
const OVERLAP = 2;

const INFINITE_LOOP_COUNTER_INTERVAL = 2;
const MAX_AMOUNT_OF_WORDS_PER_LINE = 10;

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

const PROMPT_EXTRACT_GENERAL_CONTEXT = `You are part of a payroll agent system.
Your successor will be responsible to extract todos. I want you to give him a general context of the whole email.
So that it is clear what the email is about. Add details like effective date but mention that this is just a general context
and not the actual user request. Also mention if the user request is an email chain or a single message.
Do not mention the employee names or the actual precise change description but only the general context.

{userMessage}
`;

const PROMPT_TEMPLATE_EXTRACT_TODOS = `You are part of a payroll agent system.
You will be given text step by step so you might even see partial sentences.
If there is no todo left just say "No more tool calls".

Your task is to extract todos from the following text (if any are present):
Do not repeat existing todos.

<context>
# IMPORTANT: Use this context to understand the overall picture not to extract todos.
# IMPORTANT: DO NOT USE THIS CONTEXT TO EXTRACT TODOS.
{context}
</context>


This is the user message:
# USE THIS AS REFERENCE TO EXTRACT TODOS.
<userMessage>
{input}
</userMessage>


# DO NOT REPEAT EXISTING TODOS.
# HERE THE EXISTING TODOS ARE LISTED.
<existingTodos>
{existingTodos}
</existingTodos>
`;

const PROMPT_TEMPLATE_LOOP_CHECKS = `
You are double checking your counter part who has the job to extract todos from the user message.
You will be given the rest of messages and you have to decide if the counter part is repeating itself.

Tool calls:
{toolCalls}

Rest of the messages:
{restOfMessages}
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
  const lastUserMessage = state.messages
    .filter(isHumanMessage)
    .at(-1)
    ?.content.toString();

  const generalContext = await generateContextOfMessage(lastUserMessage);

  const todos = await extractTodos({
    preferredLanguage,
    token,
    state,
    lastUserMessage,
    generalContext,
  });

  return { todos };
};

async function extractTodos({
  preferredLanguage,
  token,
  state,
  lastUserMessage,
  generalContext,
}: {
  preferredLanguage: "EN" | "DE";
  token: string;
  state: GraphStateType;
  lastUserMessage: string;
  generalContext: string;
}) {
  const logger = createLogger({ service: "rita-graphs" }).child({
    module: "TodoEngine",
    node: "extractTodos",
  });

  const llm = new ChatOpenAI({ ...BASE_MODEL_CONFIG, temperature: 0.1 });

  const existingTodos: AgentTodoItem[] = [];
  const addTodo = (todo: Omit<AgentTodoItem, "id">) => {
    const uuid = randomUUID();
    const todoId = `${uuid.slice(0, 4)}-${existingTodos.length}`;
    existingTodos.push({ ...todo, id: todoId });
  };
  const addMultipleTodos = (todos: Omit<AgentTodoItem, "id">[]) => {
    todos.forEach(addTodo);
  };

  const tools = [
    /*
    addTodoTool({
      extendedContext: { addTodo, locale: preferredLanguage },
      accessToken: token,
      selectedCompanyId: state.selectedCompanyId,
      agentActionLogger: state.agentActionLogger,
      rolesRitaShouldBeVisibleTo: state.rolesRitaShouldBeVisibleTo,
    }),
    */
    addMultipleTodosTool({
      extendedContext: { addMultipleTodos, locale: preferredLanguage },
      accessToken: token,
      selectedCompanyId: state.selectedCompanyId,
      agentActionLogger: state.agentActionLogger,
      rolesRitaShouldBeVisibleTo: state.rolesRitaShouldBeVisibleTo,
    }),
  ];

  const handleChunkWithLLM = async ({
    chunk,
  }: {
    chunk: Array<string>;
    index: number;
  }) => {
    const input = chunk.join("\n");

    // Repeat until the LLM decides to stop calling tools but check if its repeating itself
    let loopCounter = 0;
    const toolCallHistory = [];

    while (true) {
      loopCounter++;
      const formattedTodos = existingTodos
        .map(
          (todo) =>
            `${todo.taskDescription} for ${todo.relatedEmployeeName} - Effective at: ${todo.effectiveDate}`,
        )
        .join("\n");

      const promptTemplate = await PromptTemplate.fromTemplate(
        PROMPT_TEMPLATE_EXTRACT_TODOS,
      ).format({
        input,
        context: generalContext,
        existingTodos: formattedTodos,
      });

      const response = await llm.bindTools(tools).invoke(promptTemplate);

      // If the LLM decided to call a tool, execute it via a ToolNode
      const maybeToolCalls = response?.tool_calls;

      if (maybeToolCalls?.length === 0) {
        break;
      }

      if (Array.isArray(maybeToolCalls) && maybeToolCalls.length > 0) {
        toolCallHistory.push(...maybeToolCalls);
        const toolNode = new ToolNode(tools);
        try {
          await toolNode.invoke({ messages: [response] });
        } catch (e) {
          console.error("[todo-engine] tool execution failed", e);
        }
      }

      if (loopCounter % INFINITE_LOOP_COUNTER_INTERVAL === 0) {
        const systemPromptForLoopCheck = await PromptTemplate.fromTemplate(
          PROMPT_TEMPLATE_LOOP_CHECKS,
        ).format({
          toolCalls: JSON.stringify(toolCallHistory),
          restOfMessages: input,
        });
        const responseForLoopCheck = await llm
          .withStructuredOutput(
            z.object({
              decision: z.enum(["LOOP", "NO_REPEATS"]),
            }),
          )
          .invoke(systemPromptForLoopCheck);

        if (responseForLoopCheck.decision === "LOOP") {
          break;
        }
      }
    }

    return "No more tool calls";
  };

  const stride = Math.max(1, WINDOW_SIZE - OVERLAP);
  const userMessageSlices = lastUserMessage
    .split(/\r?\n/)
    .filter((l) => l.length > 0);

  logger.info("🚀🚀🚀 userMessageSlices %s \n\n", {
    messageSlices: userMessageSlices,
  });

  const extractionProcess = from(userMessageSlices).pipe(
    concatMap(ensureLineBreaks),
    bufferCount(WINDOW_SIZE, stride),
    filter((chunk) => chunk.length > 0),
    tap((windows) => logger.info("🚀🚀🚀 windows \n\n", { windows })),
    map((chunk, index) => ({ chunk, index })),
    concatMap(handleChunkWithLLM),
    toArray(),
  );

  try {
    await lastValueFrom(extractionProcess);
  } catch (err) {
    console.error("[todo-engine rxjs] error", err);
  }

  const filteredTodos = filterDuplicates(existingTodos, logger);

  return filteredTodos;
}

async function generateContextOfMessage(lastUserMessage: string) {
  const generalContextLlm = new ChatOpenAI({
    ...BASE_MODEL_CONFIG,
    temperature: 0.1,
  });

  const createContextPrompt = await ChatPromptTemplate.fromTemplate(
    PROMPT_EXTRACT_GENERAL_CONTEXT,
  ).format({ userMessage: lastUserMessage });

  const generalContext = await generalContextLlm.invoke(createContextPrompt);
  return generalContext.content.toString();
}

/**
 * If a line has more then MAX_AMOUNT_OF_WORDS_PER_LINE words we should split it into multiple lines.
 */
function ensureLineBreaks(line: string) {
  const words = line.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += MAX_AMOUNT_OF_WORDS_PER_LINE) {
    chunks.push(words.slice(i, i + MAX_AMOUNT_OF_WORDS_PER_LINE).join(" "));
  }
  return from(chunks);
}
