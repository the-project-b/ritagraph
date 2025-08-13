import { HumanMessage } from "@langchain/core/messages";
import { getContextFromConfig, Node } from "../graph-state";
import { createLogger } from "@the-project-b/logging";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import {
  createGraphQLClient,
  GraphQLClientType,
} from "../../../utils/graphql/client.js";
import { Result } from "../../../utils/types/result.js";
import { getConversationMessages } from "../../../utils/format-helpers/message-filters.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "Nodes",
  node: "generateTitle",
});

type AssumedConfigurableType = {
  thread_id: string;
};

const TitleGenerationOutput = z.object({
  title: z
    .string()
    .max(50)
    .describe("The generated title for the conversation, max 50 characters"),
  reasoning: z
    .string()
    .describe("Brief explanation of why this title was chosen"),
});

export const generateTitle: Node = async (state, config, getAuthUser) => {
  const { user, token, appdataHeader } = getAuthUser(config);
  const { backupCompanyId } = getContextFromConfig(config);
  const { thread_id } =
    config.configurable as unknown as AssumedConfigurableType;

  const companyId = user.company?.id ?? backupCompanyId;

  const userMessages = state.messages.filter(
    (msg) => msg instanceof HumanMessage,
  );

  const shouldGenerateTitle =
    userMessages.length === 1 || userMessages.length % 10 === 0;

  if (shouldGenerateTitle && companyId) {
    const firstUserMessage = userMessages[0];
    const firstUserContent = firstUserMessage
      ? `Initial request: ${firstUserMessage.content}\n\n`
      : "";

    const recentConversation = getConversationMessages(state.messages, 10);

    const conversationContext = firstUserContent + recentConversation;

    if (conversationContext.trim().length > 0) {
      try {
        const systemPrompt = await PromptTemplate.fromTemplate(
          `You are a professional payroll system assistant. Generate a concise, descriptive title for this conversation.

The title should:
- Be maximum 50 characters
- Summarize the main topic or request
- Use professional, clear language
- Maintain the same language as the conversation
- Be informative but NOT include specific numbers or amounts
- Focus on the type of change or request, not the exact values

Good examples:
- "Adjustment of Thompson's hourly rate"
- "Employee list overview"
- "Performance bonus update for Garcia"
- "Overtime rate modification for Wilson"
- "Salary adjustments for multiple employees"
- "Gehaltanpassung für mehrere Mitarbeiter"
- "Überstundensatz Änderung Wilson"

Conversation context (including initial request):
{conversationContext}`,
        ).format({
          conversationContext: conversationContext.slice(0, 2500),
        });

        const prompt = await ChatPromptTemplate.fromMessages([
          ["system", systemPrompt],
        ]).invoke({});

        const llm = new ChatOpenAI({
          model: "gpt-4o-mini",
          temperature: 0.3,
        });

        const response = await llm
          .withStructuredOutput<
            z.infer<typeof TitleGenerationOutput>
          >(TitleGenerationOutput)
          .invoke(prompt);

        logger.info("Generated title", {
          threadId: thread_id,
          title: response.title,
          reasoning: response.reasoning,
          userMessageCount: userMessages.length,
        });

        const client = createGraphQLClient({
          accessToken: token,
          selectedCompanyId: companyId,
          appdataHeader,
        });

        const persistResult = await persistTitle(
          client,
          thread_id,
          response.title,
        );

        if (Result.isFailure(persistResult)) {
          const error = Result.unwrapFailure(persistResult);
          logger.warn("Failed to persist title", {
            threadId: thread_id,
            error: error.message,
          });
        } else {
          logger.info("Title persisted successfully", {
            threadId: thread_id,
            title: response.title,
          });
        }
      } catch (error) {
        logger.warn("Title generation failed", {
          threadId: thread_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {};
};

async function persistTitle(
  client: GraphQLClientType,
  threadId: string,
  title: string,
): Promise<Result<void, Error>> {
  try {
    const { threadByLanggraphId } = await client.getThreadByLanggraphId({
      langgraphId: threadId,
    });

    if (!threadByLanggraphId?.id) {
      return Result.failure(new Error("Thread not found"));
    }

    await client.updateRitaThread({
      input: {
        threadId: threadByLanggraphId.id,
        title,
      },
    });

    return Result.success(undefined);
  } catch (e) {
    return Result.failure(e as Error);
  }
}
