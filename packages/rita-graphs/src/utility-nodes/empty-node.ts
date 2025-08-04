import { Node } from "../graphs/shared-types/node-types.js";

export const emptyNode: Node<any, any> = async (state) => {
  return state;
};
