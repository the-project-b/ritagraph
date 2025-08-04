import { Node } from "../graph-state.js";

/**
 * Responsible for initializing the settings for the graph.
 */
export const loadSettings = (state: any, config: any, getAuthUser: (config: any) => any) => {
  const { user } = getAuthUser(config);

  return {
    preferredLanguage: user.preferredLanguage ?? "DE",
    // Just for development we are using a backup company id based on the config
    selectedCompanyId:
      state.selectedCompanyId ?? user.company.id ?? config.backupCompanyId,
  };
};
