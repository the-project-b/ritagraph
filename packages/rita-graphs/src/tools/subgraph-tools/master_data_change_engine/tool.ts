import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { buildDataRetrievalEngineGraph } from "./sub-graph";
import { ToolFactoryToolDefintion, toolFactory } from "../../tool-factory";
import { Command, getCurrentTaskInput } from "@langchain/langgraph";
import { changeEmployeeBaseDetails } from "./tools/change-employee-base-details/tool";
import { changeEmployeeInsurance } from "./tools/change-employee-insurance/tool";
import { findInsuranceCompanyCodeByName } from "./tools/find-insurance-company-code-by-name/tool";
import { promptService } from "../../../services/prompts/prompt.service";

export type ExtendedToolContext = {
  originalMessageChain: Array<BaseMessage>;
  preferredLanguage: "EN" | "DE";
};

/**
 * This is a special tool since it runs its own graph.
 * Wrapping this into a tool helps us to have clear segration of concerns.
 */
export const masterDataChangeEngine: ToolFactoryToolDefintion = (toolContext) =>
  tool(
    async ({ usersChangeDescription, quote, employeeId }, config) => {
      // Fetch prompt from LangSmith
      const rawPrompt = await promptService.getRawPromptTemplateOrThrow({
        promptName: "ritagraph-master-data-change-engine",
        source: "langsmith",
      });
      const systemPrompt = await PromptTemplate.fromTemplate(
        rawPrompt.template,
      ).format({
        today: new Date().toISOString().split("T")[0],
      });

      // const systemPrompt = await PromptTemplate.fromTemplate(
      //   `
      // <instruction>
      // You are part of a payroll assistant system.
      // You job is it schedule data changes (mutations).
      // You get a vague request from the user and you have to resolve it using your tools.
      //
      // 1) Make sure you understand which fields have been mentioned and which tools have to be called.
      // 2) Schedule (propose) changes
      //
      // IMPORTANT: When you are done please summarize the changes and mention which data change proposals were created.
      // </instruction>
      //
      // <notes>
      // IMPORTANT: Do not make the same change multiple times.
      // Today is the {today}
      // </notes>
      //
      // <examples>
      // No examples yet.
      // </examples>
      // `,
      // ).format({
      //   today: new Date().toISOString().split("T")[0],
      // });

      const humanPrompt = await PromptTemplate.fromTemplate(
        `
Users request: {usersChangeDescription}
Quote: {quote}
Employee ID: {employeeId}

Remember to put those into the sanitize_quote_for_proposal tool to get a well formatted quote.
      `,
      ).format({
        usersChangeDescription,
        quote,
        employeeId,
      });

      // We need to know the original message chain to get the well formatted quote
      const callerGraphState = (await getCurrentTaskInput(config)) as {
        messages: Array<BaseMessage>;
        preferredLanguage: "EN" | "DE";
      };

      const messagePrompt = ChatPromptTemplate.fromMessages([
        new SystemMessage(systemPrompt),
        new HumanMessage(humanPrompt),
      ]);

      const toolDefinitions = [
        changeEmployeeBaseDetails,
        changeEmployeeInsurance,
        findInsuranceCompanyCodeByName,
      ];

      const tools = toolFactory<ExtendedToolContext>({
        toolDefinitions,
        ctx: {
          ...toolContext,
          extendedContext: {
            originalMessageChain: callerGraphState.messages,
            preferredLanguage: callerGraphState.preferredLanguage,
          },
        },
      });

      const agent = buildDataRetrievalEngineGraph({ tools });

      const response = await agent.invoke({
        messages: await messagePrompt.formatMessages({
          usersChangeDescription,
        }),
      });

      return new Command({
        update: {
          messages: [
            new ToolMessage({
              content: response.messages[response.messages.length - 1].content,
              tool_call_id: config.toolCall.id,
            }),
          ],
        },
      });
    },
    {
      name: "master_data_change_engine",
      description:
        "Takes a description of the data change and resolves it into a list of data change proposals that can be approved by the user. It is better to call this tool mutliple times for each employee that has changes. If the job title was mentioned please include it.",
      schema: z.object({
        usersChangeDescription: z
          .string()
          .describe("What the user wants to change"),
        employeeId: z
          .string()
          .describe(
            "The id (e.g. uuid) of the employee you want to change. Keep in mind you can get that id by finding the employee by name first",
          ),
        quote: z
          .string()
          .describe(
            "The quote of what the user said. Please use the sanitize_quote_for_proposal tool to refine the quote.",
          ),
      }),
    },
  );
