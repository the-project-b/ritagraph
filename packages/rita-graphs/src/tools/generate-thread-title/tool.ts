import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  createGraphQLClient,
  GraphQLClientType,
} from "../../utils/graphql/client.js";
import { ToolContext } from "../tool-factory.js";
import { Result } from "../../utils/types/result.js";
import { createLogger } from "@the-project-b/logging";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "Tools",
  tool: "generate_thread_title",
});

export const generateThreadTitle = (ctx: ToolContext) =>
  tool(
    async ({ threadId, conversationSummary }) => {
      logger.info("[TOOL > generate_thread_title]", {
        operation: "generate_thread_title",
        companyId: ctx.selectedCompanyId,
      });

      const client = createGraphQLClient(ctx);

      if (!conversationSummary || conversationSummary.trim().length === 0) {
        return {
          success: false,
          instructions: "Cannot generate title from empty conversation",
        };
      }

      const llm = new ChatOpenAI({
        model: "gpt-4o-mini",
        temperature: 0.3,
      });

      const systemPrompt = new SystemMessage(
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
- "Überstundensatz Änderung Wilson"`,
      );

      const userPrompt = new HumanMessage(
        `Generate a title for this conversation:
${conversationSummary}`,
      );

      const response = await llm.invoke([systemPrompt, userPrompt]);
      const generatedTitle = response.content
        .toString()
        .trim()
        .replace(/^["']|["']$/g, "");

      const persistResult = await persistTitle(
        client,
        threadId,
        generatedTitle,
      );

      if (Result.isFailure(persistResult)) {
        return {
          success: false,
          instructions: "Failed to save the generated title",
        };
      }

      return {
        success: true,
        instructions: `Title updated: "${generatedTitle}"`,
        generatedTitle,
      };
    },
    {
      name: "generate_thread_title",
      description:
        "Generate and save a professional title for the conversation thread",
      schema: z.object({
        threadId: z.string().describe("The LangGraph thread ID"),
        conversationSummary: z
          .string()
          .describe("Summary of the conversation to generate title from"),
      }),
    },
  );

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
