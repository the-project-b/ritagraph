import { Node } from "../graph-state";

/**
 * At the moment just a pass through node
 */
export const router: Node = async (state) => {
  console.log("🔄 Router - state:", state);

  return null;
};
