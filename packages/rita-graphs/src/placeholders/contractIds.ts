import { PlaceholderResolver, PlaceholderContext } from "./types.js";
import { userService } from "../utils/user-service.js";

export const contractIdsResolver: PlaceholderResolver = {
  name: "auto_contractIds",
  resolve: async (context: PlaceholderContext): Promise<string> => {
    const contractIds = await userService.getContractIds(context);
    return contractIds.join(", ");
  },
};
