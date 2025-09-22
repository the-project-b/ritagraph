import { Result } from "../../utils/types/result";
import { GetThreadItemsByLanggraphThreadIdQuery } from "../../generated/graphql";
import { createGraphQLClient } from "../../utils/graphql/client";
import { DataChangeProposal } from "../../graphs/shared-types/base-annotation";

type GraphQLClientType = ReturnType<typeof createGraphQLClient>;

export async function getCurrentDataChangeProposals(
  threadId: string,
  graphqlClient: GraphQLClientType,
): Promise<Array<DataChangeProposal>> {
  const threadItemsResult = await getThreadItemsByLanggraphThreadId(
    threadId,
    graphqlClient,
  );

  if (Result.isFailure(threadItemsResult)) {
    console.error("Failed to get thread items", threadItemsResult);
    return [];
  }

  // Filter with type guard
  const dataChangeProposals: Array<DataChangeProposal> = Result.unwrap(
    threadItemsResult,
  )
    .map((i) => i.data)
    .filter(isDataChangeProposal)
    .map((i) => i.proposal);

  return dataChangeProposals;
}

async function getThreadItemsByLanggraphThreadId(
  threadId: string,
  graphqlClient: GraphQLClientType,
): Promise<
  Result<
    GetThreadItemsByLanggraphThreadIdQuery["threadByLanggraphId"]["threadItems"]
  >
> {
  try {
    const threadItems = await graphqlClient.getThreadItemsByLanggraphThreadId({
      langgraphId: threadId,
    });

    return Result.success(threadItems.threadByLanggraphId.threadItems);
  } catch (error) {
    return Result.failure(error as Error);
  }
}

type WrappedRitaThreadItem = {
  type: string;
  proposal: DataChangeProposal;
};

function isDataChangeProposal(
  ritaThreadItem: GetThreadItemsByLanggraphThreadIdQuery["threadByLanggraphId"]["threadItems"][number]["data"],
): ritaThreadItem is WrappedRitaThreadItem {
  return ritaThreadItem.type === "DATA_CHANGE_PROPOSAL";
}
