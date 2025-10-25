import { createFileExtractionGraph } from "@the-project-b/rita-graphs";
import { getAuthUser, auth } from "../../security/auth.js";

export const graph = createFileExtractionGraph(getAuthUser)();

export { auth };
