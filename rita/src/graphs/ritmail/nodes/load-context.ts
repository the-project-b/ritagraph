import { getAuthUser } from "../../../security/auth.js";
import { Node } from "../graph-state.js";

/**
 * Responsible for initializing the user context for the graph.
 */
export const loadContext: Node = async (state, config) => {
  const user = getAuthUser(config);

  return {
    preferredLanguage: user.user.preferredLanguage ?? "DE",
    // Just for development we are using a backup company id based on the config
    selectedCompanyId:
      state.selectedCompanyId ?? user.user.company.id ?? config.backupCompanyId,
  };
};
