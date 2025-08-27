import { HumanMessage } from "@langchain/core/messages";
import { appendMessageAsThreadItem } from "../../../utils/append-message-as-thread-item";
import { getContextFromConfig, Node } from "../graph-state";
import { createLogger } from "@the-project-b/logging";

type AssumedConfigurableType = {
  thread_id: string;
};

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "Nodes",
  node: "loadSettings",
});

/**
 * Responsible for initializing the settings for the graph.
 */
export const loadSettings: Node = async (state, config, getAuthUser) => {
  const { user, token, appdataHeader } = getAuthUser(config);
  const { backupCompanyId } = getContextFromConfig(config);
  const { thread_id } =
    config.configurable as unknown as AssumedConfigurableType;

  const lastMessage = state.messages.at(-1);

  logger.log("state", state);

  await appendMessageAsThreadItem({
    message: new HumanMessage(lastMessage.content.toString(), {
      ...lastMessage.additional_kwargs,
      isEmail: state.isTriggeredByEmail ?? false,
      subject: lastMessage.additional_kwargs.subject,
    }),
    langgraphThreadId: thread_id,
    context: {
      accessToken: token,
      selectedCompanyId: state.selectedCompanyId,
      appdataHeader,
    },
  });

  const returnObject = {
    preferredLanguage:
      state.preferredLanguage ?? user.preferredLanguage ?? "DE",
    // Just for development we are using a backup company id based on the config
    selectedCompanyId:
      state.selectedCompanyId ?? user.company.id ?? backupCompanyId,
  };

  logger.info("Loaded settings", {
    threadId: thread_id,
    returnObject,
    state,
    user,
    backupCompanyId,
  });

  return returnObject;
};
