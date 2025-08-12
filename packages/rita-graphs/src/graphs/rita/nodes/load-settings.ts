import { appendMessageAsThreadItem } from "../../../utils/append-message-as-thread-item";
import { getContextFromConfig, Node } from "../graph-state";

type AssumedConfigurableType = {
  thread_id: string;
};

/**
 * Responsible for initializing the settings for the graph.
 */
export const loadSettings: Node = async (state, config, getAuthUser) => {
  const { user, token, appdataHeader } = getAuthUser(config);
  const { backupCompanyId } = getContextFromConfig(config);
  const { thread_id } =
    config.configurable as unknown as AssumedConfigurableType;

  const selectedCompanyId =
    state.selectedCompanyId ?? user.company.id ?? backupCompanyId;

  await appendMessageAsThreadItem({
    message: state.messages.at(-1),
    langgraphThreadId: thread_id,
    ctx: { accessToken: token, selectedCompanyId, appdataHeader },
  });

  return {
    preferredLanguage:
      state.preferredLanguage ?? user.preferredLanguage ?? "DE",
    // Just for development we are using a backup company id based on the config
    selectedCompanyId:
      state.selectedCompanyId ?? user.company.id ?? backupCompanyId,
  };
};
