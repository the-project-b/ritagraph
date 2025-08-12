import { HumanMessage } from "@langchain/core/messages";
import { getContextFromConfig, Node } from "../graph-state";
import { createLogger } from "@the-project-b/logging";
import { generateThreadTitle } from "../../../tools/generate-thread-title/tool.js";
import { toolFactory } from "../../../tools/tool-factory.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "Nodes",
  node: "generateTitle",
});

type AssumedConfigurableType = {
  thread_id: string;
};

export const generateTitle: Node = async (state, config, getAuthUser) => {
  const { user, token, appdataHeader } = getAuthUser(config);
  const { backupCompanyId } = getContextFromConfig(config);
  const { thread_id } =
    config.configurable as unknown as AssumedConfigurableType;

  const companyId = user.company?.id ?? backupCompanyId;

  const userMessages = state.messages.filter(
    (msg) => msg instanceof HumanMessage,
  );

  if (userMessages.length === 1 && companyId) {
    const conversationSummary = state.messages
      .map((msg) => {
        if (msg instanceof HumanMessage) {
          return `User: ${msg.content}`;
        } else if (typeof msg.content === "string") {
          return msg.content;
        }
        return "";
      })
      .filter((content) => content.length > 0)
      .join("\n");

    if (conversationSummary.trim().length > 0) {
      const toolContext = {
        accessToken: token,
        selectedCompanyId: companyId,
        appdataHeader,
      };

      const tools = toolFactory<undefined>({
        toolDefintions: [generateThreadTitle],
        ctx: toolContext,
      });

      const titleTool = tools[0];

      try {
        await titleTool.invoke({
          threadId: thread_id,
          conversationSummary: conversationSummary.slice(0, 1000),
        });

        logger.info("Title generation completed", { threadId: thread_id });
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
