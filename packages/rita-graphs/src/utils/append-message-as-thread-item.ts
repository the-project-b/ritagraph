import { BaseMessage } from "@langchain/core/messages";
import { Result } from "./types/result";
import { createGraphQLClient, GraphQLClientType } from "./graphql/client";
import {
  CreateRitaThreadItemMutation,
  GetThreadItemsByLanggraphThreadIdQuery,
} from "../generated/graphql";
import { DataChangeProposal } from "../graphs/shared-types/base-annotation";
import { ToolContext } from "../tools/tool-factory";

type AppendDataChangeProposalsAsThreadItemsParams = {
  dataChangeProposals: Array<DataChangeProposal>;
  langgraphThreadId: string;
  context: Omit<ToolContext, "agentActionLogger">;
  orderOffset?: number;
};

type AppendDataChangeProposalAsThreadItemReturnType = Promise<
  Result<
    Array<Result<CreateRitaThreadItemMutation, FailedToCreateThreadItemError>>,
    Error
  >
>;

export async function appendDataChangeProposalsAsThreadItems({
  dataChangeProposals,
  langgraphThreadId,
  context,
  orderOffset = 150,
}: AppendDataChangeProposalsAsThreadItemsParams): Promise<AppendDataChangeProposalAsThreadItemReturnType> {
  try {
    const client = createGraphQLClient(context);

    const { threadByLanggraphId } =
      await client.getThreadItemsByLanggraphThreadId({
        langgraphId: langgraphThreadId,
      });
    const { threadItems } = threadByLanggraphId;
    const onlyMessages = threadItems?.filter((i) => i.data?.type === "MESSAGE");
    const order = getOrderOfLatestInOrder(onlyMessages) + orderOffset;

    const results = await Promise.all(
      dataChangeProposals.map((proposal) =>
        createThreadItemForProposal(client, langgraphThreadId, proposal, order),
      ),
    );

    return Result.success(results);
  } catch (error: unknown) {
    return Result.failure(error as Error);
  }
}

type AppendMessageAsThreadItemParams = {
  message: BaseMessage;
  langgraphThreadId: string;
  context: Omit<ToolContext, "agentActionLogger">;
  orderOffset?: number;
};

export async function appendMessageAsThreadItem({
  message,
  langgraphThreadId,
  context,
  orderOffset = 100,
}: AppendMessageAsThreadItemParams): Promise<Result<void, Error>> {
  try {
    const client = createGraphQLClient(context);

    // Determine the order of the message
    const { threadByLanggraphId } =
      await client.getThreadItemsByLanggraphThreadId({
        langgraphId: langgraphThreadId,
      });
    const { threadItems } = threadByLanggraphId;
    const onlyMessages = threadItems?.filter((i) => i.data?.type === "MESSAGE");
    const order = getOrderOfLatestInOrder(onlyMessages) + orderOffset;

    await client.createRitaThreadItem({
      input: {
        langgraphThreadId,
        data: {
          type: "MESSAGE",
          message,
          order,
        },
      },
    });

    return Result.success(undefined);
  } catch (error) {
    return Result.failure(error as Error);
  }
}

function getOrderOfLatestInOrder(
  threadItems?: GetThreadItemsByLanggraphThreadIdQuery["threadByLanggraphId"]["threadItems"],
): number {
  if (!threadItems) {
    return 0;
  }

  return (
    threadItems
      .map((i) => i.data)
      .sort((a, b) => a.order - b.order)
      .at(-1)?.order ?? 0
  );
}

async function createThreadItemForProposal(
  client: GraphQLClientType,
  threadId: string,
  proposal: DataChangeProposal,
  order: number,
): Promise<
  Result<CreateRitaThreadItemMutation, FailedToCreateThreadItemError>
> {
  try {
    const threadItem = await client.createRitaThreadItem({
      input: {
        langgraphThreadId: threadId,
        data: {
          type: "DATA_CHANGE_PROPOSAL",
          proposal,
          order,
        },
      },
    });

    return Result.success(threadItem);
  } catch (error: unknown) {
    return Result.failure(new FailedToCreateThreadItemError(error as Error));
  }
}

// MARK: Errors

class FailedToCreateThreadItemError extends Error {
  constructor(error: Error) {
    super("Failed to create thread item", { cause: error });
    this.name = "FailedToCreateThreadItemError";
  }
}
