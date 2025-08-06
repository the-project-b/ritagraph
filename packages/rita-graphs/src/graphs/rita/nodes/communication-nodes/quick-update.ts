import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { localeToLanguage } from "../../../../utils/format-helpers/locale-to-language.js";
import { WorkflowEngineNode } from "../../../shared-sub-graphs/workflow-engine-react/sub-graph.js";
import { onBaseMessages } from "../../../../utils/message-filter.js";
import { Tags } from "../../../tags.js";

/**
 * At the moment just a pass through node
 */
export const quickUpdate: WorkflowEngineNode = async ({
  messages,
  taskEngineMessages,
  preferredLanguage,
}) => {
  console.log("💬 Quick Update - state:");

  const llm = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0.1,
    tags: [Tags.THOUGHT],
  });

  const lastAiMessage = messages.filter((i) => i instanceof AIMessage).at(-1);
  const initialUserMessage = messages
    .filter((i) => i instanceof HumanMessage)
    .at(-1);

  const systemPrompt = await PromptTemplate.fromTemplate(
    `You are a Payroll Specialist Assistant.
You are part of a bigger system. 
Your job is to update the user on what the system is doing at the moment.

------
Initial user message: {initialUserMessage}

Your last message was: {lastMessage}

The last few thought messages were: {taskEngineMessages}
------

Rough examples:
- Looking for information, calling tools, etc.
- I am looking for information about the user's payroll
- I found some employees that match the criteria

Give brief updates. Not more then 1 sentence.
Speak in {language}.
`,
  ).format({
    initialUserMessage: initialUserMessage?.content.toString() ?? "No message",
    taskEngineMessages: taskEngineMessages
      .map((i) => i.content.toString())
      .join("\n")
      .slice(-3),
    language: localeToLanguage(preferredLanguage),
    lastMessage: lastAiMessage?.content.toString() ?? "No message",
  });

  const prompt = await ChatPromptTemplate.fromMessages([
    new SystemMessage(systemPrompt),
    ...messages.slice(-2).filter(onBaseMessages),
  ]).invoke({});

  const response = await llm.invoke(prompt);

  return {
    messages: [
      ...messages,
      new AIMessage(response.content.toString(), {
        tags: ["THOUGHT"],
      }),
    ],
  };
};
