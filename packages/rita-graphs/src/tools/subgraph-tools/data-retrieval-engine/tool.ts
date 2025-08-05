import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { buildDataChangeEngineGraph } from "./sub-graph";
import { ToolFactoryToolDefintion, toolFactory } from "../../tool-factory";
import { getPaymentsOfEmployee } from "../../get-payments-of-employee/tool";
import { Command, getCurrentTaskInput } from "@langchain/langgraph";
import { getEmployeeById } from "../../get-employee-by-id/tool";
import { findEmployee } from "../../find-employee/tool";
import { getActiveEmployeesWithContracts } from "../../get-active-employees-with-contracts/tool";
import { DataRepresentationLayerEntity } from "../../../utils/data-representation-layer";
import { getAllEmployees } from "../../get-all-employees-drl/tool";
import { dataRepresentationLayerPrompt } from "../../../utils/data-representation-layer/prompt-helper";

export type ExtendedToolContext = {
  addItemToDataRepresentationLayer: (
    key: string,
    value: DataRepresentationLayerEntity,
  ) => void;
};

/**
 * This is a special tool since it runs its own graph.
 * Wrapping this into a tool helps us to have clear segration of concerns.
 */
export const dataRetrievalEngine: ToolFactoryToolDefintion = (toolContext) =>
  tool(
    async ({ usersRequest }, config) => {
      const systemPrompt = `
You are part of a Payroll assistant system.
Your job is to retrieve data from the database about employees, contracts payments and more.
You get a vague request from the user and you have to resolve it using your tools.
Employees can have multiple contracts and per contract multiple payments so it is important to figure out which contract was meant.

Only your final response will be shown to the rest of the system. Make sure it includes the relevant data (e.g. <List .../> or other placeholders that you plan to show)

${dataRepresentationLayerPrompt}
      `;

      const messagePrompt = ChatPromptTemplate.fromMessages([
        new SystemMessage(systemPrompt),
        new HumanMessage(usersRequest),
      ]);

      const newDataRepresentationLayerStorage: Record<
        string,
        DataRepresentationLayerEntity
      > = {};

      const addItemToDataRepresentationLayer = (
        key: string,
        value: DataRepresentationLayerEntity,
      ) => {
        newDataRepresentationLayerStorage[key] = value;
      };

      const tools = toolFactory<ExtendedToolContext>({
        toolDefintions: [
          getPaymentsOfEmployee,
          getEmployeeById,
          findEmployee,
          getActiveEmployeesWithContracts,
          getAllEmployees,
        ],
        ctx: {
          ...toolContext,
          extendedContext: {
            addItemToDataRepresentationLayer,
          },
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
          dataRepresentationLayerStorage: {
            ...(getCurrentTaskInput(config) as any)
              .dataRepresentationLayerStorage,
            ...newDataRepresentationLayerStorage,
          },
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
      name: "data_retrieval_engine",
      description:
        "Takes a description of the data and tries to retrieve it from the database",
      schema: z.object({
        usersRequest: z.string().describe("What the user wants to change"),
      }),
    },
  );
