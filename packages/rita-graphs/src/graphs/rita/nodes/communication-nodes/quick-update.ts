import { ChatOpenAI } from "@langchain/openai";
import { createLogger } from "@the-project-b/logging";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { localeToLanguage } from "../../../../utils/format-helpers/locale-to-language.js";
import { WorkflowEngineNode } from "../../../shared-sub-graphs/workflow-engine-react/sub-graph.js";
import { Tags } from "../../../tags.js";
import { BASE_MODEL_CONFIG } from "../../../model-config.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "CommunicationNodes",
  node: "quickUpdate",
});

/**
 * At the moment just a pass through node
 */
export const quickUpdate: WorkflowEngineNode = async (
  { messages, taskEngineMessages, preferredLanguage, selectedCompanyId },
  config,
) => {
  logger.info("💬 Quick Update - state:", {
    operation: "quickUpdate",
    threadId: config?.configurable?.thread_id || "unknown",
    messageCount: messages.length,
    taskEngineMessageCount: taskEngineMessages.length,
    preferredLanguage,
    companyId: selectedCompanyId,
  });

  const llm = new ChatOpenAI({
    ...BASE_MODEL_CONFIG,
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
In german use "du" and "deine" instead of "Sie" and "Ihre".
Always End the message with a new line so that the consecutive string concatenation works.
NEVER Address the user directly you are just representing the thought process of the system.
NEVER MENTION IDs or UUIDs.
DO NOT MENTION "<List>" tags. Just say "list" instead.
NEVER SAY Changes are applied they are always only prepared.

------
Initial user message: {initialUserMessage}

Your last message was: {lastMessage}

The task engine messages were: {taskEngineMessages}

------

<Examples>
- Looking for information, calling tools, etc.
- Hmm I don't know x yet I need search for it.
- Okay found it, now I can do y
- I continue to do y
- In order to do y I need to find z
- I need to find z in order to do y
- I am looking for information about the user's payroll
- I found some employees that match the criteria
</Examples>

Give brief updates. Not more then 1 sentence. You can connect the previous thought with the current one.
Speak in {language}.
`,
  ).format({
    initialUserMessage: initialUserMessage?.content.toString() ?? "No message",
    taskEngineMessages: taskEngineMessages
      .slice(-4)
      .map(
        (i) => `
Thought: ${i.content.toString()}
tool called: ${i.lc_kwargs.tool_calls?.map((i) => i.name).join(", ") ?? "none"}
      `,
      )
      .join("\n"),

    language: localeToLanguage(preferredLanguage),
    lastMessage: lastAiMessage?.content.toString() ?? "No message",
  });

  const prompt = await ChatPromptTemplate.fromMessages([
    new SystemMessage(systemPrompt),
    ...messages
      .filter(isThoughtMessage)
      .map((i) => i.content.toString())
      .slice(-2),
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

function isThoughtMessage(message: AIMessage) {
  if (!message.additional_kwargs) {
    return false;
  }

  return (message.additional_kwargs as { tags: string[] }).tags?.includes(
    Tags.THOUGHT,
  );
}
