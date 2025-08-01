import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { buildDataChangeEngineGraph } from "./sub-graph";
import { toolFactory, ToolFactoryToolDefintion } from "../../tool-factory";
import { getActiveEmployeesWithContracts } from "../../get-active-employees-with-contracts/tool";
import { getPaymentsOfEmployee } from "../../get-payments-of-employee/tool";
import { Command } from "@langchain/langgraph";
import { changePaymentDetails } from "./tools/change-payment-details/tool";
import { getCurrentDataChangeProposals } from "./tools/get-current_data_change_proposals/tool";

export type ExtendedToolContext = {
  // empty for now
};

/**
 * This is a special tool since it runs its own graph.
 * Wrapping this into a tool helps us to have clear segration of concerns.
 */
export const mutationEngine: ToolFactoryToolDefintion = (toolContext) =>
  tool(
    async ({ usersRequest }, config) => {
      const systemPrompt = `
You are part of a Payroll assistant system.
You job is it schedule data changes (mutations). 
You get a vague request from the user and you have to resolve it using your tools.

Employees can have multiple contracts and per contract multiple payments so it is important to figure out which contract was meant.
      `;

      const messagePrompt = ChatPromptTemplate.fromMessages([
        new SystemMessage(systemPrompt),
        new HumanMessage(usersRequest),
      ]);

      const tools = toolFactory<ExtendedToolContext>({
        toolDefintions: [
          getActiveEmployeesWithContracts,
          getPaymentsOfEmployee,
          getCurrentDataChangeProposals,
          changePaymentDetails,
        ],
        ctx: {
          ...toolContext,
          extendedContext: {},
        },
      });

      const agent = buildDataChangeEngineGraph({ tools });

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
        "Takes a description of the data change and resolves it into a list of data change proposals that can be approved by the user",
      schema: z.object({
        usersRequest: z.string().describe("What the user wants to change"),
      }),
    }
  );
