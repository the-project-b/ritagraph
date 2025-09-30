import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { ToolContext } from "../tool-factory";

import { createLogger } from "@the-project-b/logging";
import { AgentActionType } from "../../utils/agent-action-logger/AgentActionLogger";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "Tools",
  tool: "find_employee",
});

export const askUserAQuestion = (ctx: ToolContext) =>
  tool(
    async ({ question }, config) => {
      logger.info("[TOOL > ask_user_a_question]", {
        operation: "ask_user_a_question",
        companyId: ctx.selectedCompanyId,
      });
      const { agentActionLogger } = ctx;

      const { toolCall } = config;
      const { run_id } = config.configurable;

      agentActionLogger.appendLog({
        description: `Asking user a question: ${question}`,
        actionName: "ask_user_a_question",
        actionType: AgentActionType.AGENT_QUESTION_TO_USER,
        relationId: toolCall.id,
        runId: run_id,
      });

      return `
Question is scheduled to be asked together with final response. You can continue with the rest of the request if there is anything else to do.
`;
    },
    {
      name: "ask_user_a_question",
      description:
        "Stores the question to ask the user and will be added to the final response. You can continue with the rest of the conversation. ONLY RESORT TO THIS TOOL IF YOU HAVE NO OTHER CHOICE.",
      schema: z.object({
        question: z
          .string()
          .describe(
            "e.g. Ask the question and make sure what it is related to (e.g. the thing that you tried to do)",
          ),
      }),
    },
  );
