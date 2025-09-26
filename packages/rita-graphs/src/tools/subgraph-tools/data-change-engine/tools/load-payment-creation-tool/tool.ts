import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { ToolContext } from "../../../../tool-factory";

import { createLogger } from "@the-project-b/logging";
import { AgentActionType } from "../../../../../utils/agent-action-logger/AgentActionLogger";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "Tools",
  tool: "find_employee",
});

const RETURNED_INSTRUCTION_PROMPT = `
In order to create payments you need to understand which type is requested.

Base wage: Monhtly hours, hourly wage (amount), frequency = mostly monthly
Salary: Amount, frequency = mostly monthly
Bonus: Amount, frequency = mostly one time
Extra payment: Amount, frequency = mostly one time
Other: Amount, frequency = mostly one time

If it is not decuable you can ask the user for clarification and not call the tool.
ONLY RESORT TO THIS IF YOU HAVE NO OTHER CHOICE.

The amount of "13th salary Bonus" is often just the regular salary amount.
`;

/**
 * Payment creation requires a lot of additional context.
 * To address this, we intended to create a tool that would dynamically enable the paymentCreationTool,
 * and use its output to provide clear instructions on how to use it.
 *
 * However, this approach is currently disabled because LangGraph makes it difficult to implement truly dynamic tools.
 * For now, we are compensating by increasing the complexity of the prompt instead.
 * Further exploration of the LangGraph documentation may help us enable this feature in the future.
 */
export const loadPaymentCreationTool = (ctx: ToolContext) =>
  tool(
    async (_, config) => {
      logger.info("[TOOL > load_payment_creation_tool]", {
        operation: "load_payment_creation_tool",
        companyId: ctx.selectedCompanyId,
      });
      const { agentActionLogger } = ctx;

      const { toolCall } = config;
      const { run_id } = config.configurable;

      agentActionLogger.appendLog({
        description: `Loading payment creation tool`,
        actionName: "load_payment_creation_tool",
        actionType: AgentActionType.TOOL_LOAD_REQUESTED,
        relationId: toolCall.id,
        runId: run_id,
        payload: {
          toolName: "payment_creation_tool",
        },
      });

      return RETURNED_INSTRUCTION_PROMPT;
    },
    {
      name: "load_payment_creation_tool",
      description:
        "Makes the payment creation tool available. You can use it to create payments like bonuses, salary, base wage etc.",
      schema: z.object({}),
    },
  );
