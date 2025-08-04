import { tool } from "@langchain/core/tools";
import {
  createGraphQLClient,
  GraphQLClientType,
} from "../../utils/graphql/client";
import { ToolContext } from "../tool-factory";
import { Result } from "../../utils/types/result";
import { GetCurrentUserQuery } from "../../generated/graphql";

export const getCurrentUser = (ctx: ToolContext) =>
  tool(
    async () => {
      console.log("[TOOL > get_current_user]", ctx.selectedCompanyId);
      const client = createGraphQLClient(ctx.accessToken);

      const currentUser = await fetchCurrentUser(client);

      if (Result.isFailure(currentUser)) {
        return {
          instructions: `Could not find information about the person you are talking to.`,
        };
      }

      return {
        instructions: `
These are the information about the person you are talking to.
`,
        currentUser: Result.unwrap(currentUser),
      };
    },
    {
      name: "get_current_user",
      description: "Get information about the person you are talking to",
    }
  );

async function fetchCurrentUser(
  client: GraphQLClientType
): Promise<Result<GetCurrentUserQuery["me"], Error>> {
  try {
    const { me } = await client.getCurrentUser();
    // The GraphQL query returns { employees: { employees: [...] } }
    return Result.success(me);
  } catch (e) {
    return Result.failure(e as Error);
  }
}
