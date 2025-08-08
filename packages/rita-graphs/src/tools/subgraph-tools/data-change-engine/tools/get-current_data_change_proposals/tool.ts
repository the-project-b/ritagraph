import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  ToolContext,
  ToolFactoryToolDefintion,
} from "../../../../tool-factory";
import { Result } from "../../../../../utils/types/result";
import { GetThreadItemsByLanggraphThreadIdQuery } from "../../../../../generated/graphql";
import { createGraphQLClient } from "../../../../../utils/graphql/client";
import { DataChangeProposal } from "../../../../../graphs/shared-types/base-annotation";
import { createLogger } from "@the-project-b/logging";

const logger = createLogger({ service: "rita-graphs" }).child({ module: "Tools", tool: "get_current_data_change_proposals" });

export const getCurrentDataChangeProposals: ToolFactoryToolDefintion<
  ToolContext
> = (ctx) =>
  tool(
    async (_, { configurable }) => {
      const { thread_id } = configurable;
      const { accessToken } = ctx;

      logger.info("[TOOL > get_current_data_change_proposals]", {
        operation: "get_current_data_change_proposals",
        threadId: thread_id,
      });

      const threadItemsResult = await getThreadItemsByLanggraphThreadId(
        thread_id,
        accessToken,
      );

      if (Result.isFailure(threadItemsResult)) {
        return {
          info: "Failed to get thread items",
        };
      }

      // Filter with type guard
      const dataChangeProposals = Result.unwrap(threadItemsResult)
        .map((i) => i.data)
        .filter(isDataChangeProposal);

      return {
        instructions: `
These are the pending data change proposals. You can use them to approve the based on the confirmation of the user.
`,
        dataChangeProposals: dataChangeProposals
          .filter((mutation) => mutation.status === "pending")
          .map((mutation) => ({
            id: mutation.id,
            description: mutation.description,
          })),
      };
    },
    {
      name: "get_current_data_change_proposals",
      description:
        "All data change proposals have to be approved by the user. This tool will list all pending data change proposals, which then can be approved by using their id and the corresponding tool call",
      schema: z.object({}),
    },
  );

async function getThreadItemsByLanggraphThreadId(
  threadId: string,
  accessToken: string,
): Promise<
  Result<
    GetThreadItemsByLanggraphThreadIdQuery["threadByLanggraphId"]["threadItems"]
  >
> {
  try {
    const client = createGraphQLClient(accessToken);
    const threadItems = await client.getThreadItemsByLanggraphThreadId({
      langgraphId: threadId,
    });

    return Result.success(threadItems.threadByLanggraphId.threadItems);
  } catch (error) {
    return Result.failure(error as Error);
  }
}

function isDataChangeProposal(
  ritaThreadItem: GetThreadItemsByLanggraphThreadIdQuery["threadByLanggraphId"]["threadItems"][number]["data"],
): ritaThreadItem is DataChangeProposal {
  return ritaThreadItem.data?.type === "DATA_CHANGE_PROPOSAL";
}
