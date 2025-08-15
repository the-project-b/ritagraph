import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { buildDataRetrievalEngineGraph } from "./sub-graph";
import { ToolFactoryToolDefintion, toolFactory } from "../../tool-factory";
import { getPaymentsOfEmployee } from "../../get-payments-of-employee/tool";
import { Command } from "@langchain/langgraph";
import { changePaymentDetails } from "./tools/change-payment-details/tool";
import { getCurrentDataChangeProposals } from "./tools/get-current_data_change_proposals/tool";
import { findEmployeeByNameWithContract } from "./tools/find-employee-by-name-with-contract/tool";

/**
 * This is a special tool since it runs its own graph.
 * Wrapping this into a tool helps us to have clear segration of concerns.
 */
export const mutationEngine: ToolFactoryToolDefintion = (toolContext) =>
  tool(
    async ({ usersRequest }, config) => {
      const systemPrompt = await ChatPromptTemplate.fromTemplate(
        `
<instruction>
You are part of a payroll assistant system.
You job is it schedule data changes (mutations).
You get a vague request from the user and you have to resolve it using your tools.

IMPORTANT: When you are done please summarize the changes and mention which data change proposals were created.
</instruction>

<notes>
IMPORTANT: Do not assign the same change to multiple payments unless clearly stated.
- Employees can have multiple contracts and they are often directly linked by the job title. If you it is ambiguous please ask the user for clarification.
- People can have Wage and Salary so it can be fixed or hourly based payment.
- Bonuses and extra payments are likely directly addressed in the request whereas regular payments are just announced as change in amount.
- The title of a payment often reveals its not a standard payment.

Today is the {today}
</notes>
`,
      ).format({
        today: new Date().toISOString().split("T")[0],
      });

      const messagePrompt = ChatPromptTemplate.fromMessages([
        new SystemMessage(systemPrompt),
        new HumanMessage(usersRequest),
      ]);

      const tools = toolFactory<undefined>({
        toolDefintions: [
          findEmployeeByNameWithContract,
          getPaymentsOfEmployee,
          getCurrentDataChangeProposals,
          changePaymentDetails,
        ],
        ctx: toolContext,
      });

      const agent = buildDataRetrievalEngineGraph({ tools });

      const response = await agent.invoke({
        messages: await messagePrompt.formatMessages({
          usersRequest,
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
      name: "data_change_engine",
      description:
        "Takes a description of the data change and resolves it into a list of data change proposals that can be approved by the user. It is better to call this tool mutliple times for each employee that has changes. If the job title was mentioned please include it.",
      schema: z.object({
        usersRequest: z.string().describe("What the user wants to retrieve"),
      }),
    },
  );
