/**
 * This is just some bogus tool to test tool interactions and human approval flows
 *
 */
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
import { Command, getCurrentTaskInput } from "@langchain/langgraph";
import { DataChangeProposal } from "../../../graphs/shared-types/base-annotation";
import { changePaymentDetails } from "./tools/change-payment-details/tool";
import { listDataChangeProposals as listDataChangeProposalsTool } from "./tools/list-pending-mutations/tool";

export type ExtendedToolContext = {
  addDataChangeProposal: (mutation: DataChangeProposal) => void;
  listDataChangeProposals: () => Array<DataChangeProposal>;
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
      `;

      const messagePrompt = ChatPromptTemplate.fromMessages([
        new SystemMessage(systemPrompt),
        new HumanMessage(usersRequest),
      ]);

      const existingProposals =
        (getCurrentTaskInput(config) as any).mutations ?? [];

      const addDataChangeProposal = (proposal: DataChangeProposal): void => {
        existingProposals.push(proposal);
      };

      const listDataChangeProposals = (): Array<DataChangeProposal> => {
        return existingProposals;
      };

      const tools = toolFactory<ExtendedToolContext>({
        toolDefintions: [
          getActiveEmployeesWithContracts,
          getPaymentsOfEmployee,
          listDataChangeProposalsTool,
          changePaymentDetails,
        ],
        ctx: {
          ...toolContext,
          extendedContext: { addDataChangeProposal, listDataChangeProposals },
        },
      });

      const agent = buildDataChangeEngineGraph({ tools });

      const response = await agent.invoke(
        {
          messages: await messagePrompt.formatMessages({
            usersRequest,
          }),
        },
        {
          runId: config.toolCall.id,
        }
      );

      return new Command({
        update: {
          mutations: [...existingProposals],
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
        "Takes a description of the data change and resolves it into a list of mutations that can be approved by the user",
      schema: z.object({
        usersRequest: z.string().describe("What the user wants to change"),
      }),
    }
  );
