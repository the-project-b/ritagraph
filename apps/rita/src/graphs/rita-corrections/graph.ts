import { createRitaCorrectionsGraph } from "@the-project-b/rita-graphs";
import { getAuthUser, auth } from "../../security/auth.js";

// Create graph instance with local auth function
export const graph = createRitaCorrectionsGraph(getAuthUser)();

// CRITICAL: Export auth from same module so LangGraph can discover it
export { auth };
