import { getAuthUser } from "../../../security/auth.js";
import { Node } from "../graph-state.js";

/**
 * Responsible for initializing the settings for the graph.
 */
export const loadSettings: Node = async (state, config) => {
  const user = getAuthUser(config);

  return {
    preferredLanguage:
      state.preferredLanguage ?? user.user.preferredLanguage ?? "DE",
    // Just for development we are using a backup company id based on the config
    selectedCompanyId:
      state.selectedCompanyId ?? user.user.company.id ?? config.backupCompanyId,
  };
};
