import { BaseMessage } from "@langchain/core/messages";
import { Result } from "./types/result";
import { createGraphQLClient, GraphQLClientType } from "./graphql/client";
import {
  CreateRitaThreadItemMutation,
  GetThreadItemsByLanggraphThreadIdQuery,
} from "../generated/graphql";
import { DataChangeProposal } from "../graphs/shared-types/base-annotation";
import { ToolContext } from "../tools/tool-factory";
import type { EmailCompany, EmailMessage, EmailPerson } from "./types/email";
import type { RitaThreadItemData } from "./types/thread-item";

type AppendDataChangeProposalsAsThreadItemsParams = {
  dataChangeProposals: Array<DataChangeProposal>;
  langgraphThreadId: string;
  context: Omit<ToolContext, "agentActionLogger">;
  orderOffset?: number;
  rolesRitaShouldBeVisibleTo: Array<number> | null;
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
  rolesRitaShouldBeVisibleTo,
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
        createThreadItemForProposal(
          client,
          langgraphThreadId,
          proposal,
          order,
          rolesRitaShouldBeVisibleTo,
        ),
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
  ownerId: string | null;
  runId?: string;
  emails?: EmailMessage[];
  people?: EmailPerson[];
  company?: EmailCompany;
  rolesRitaShouldBeVisibleTo: Array<number> | null;
};

export async function appendMessageAsThreadItem({
  message,
  langgraphThreadId,
  context,
  orderOffset = 100,
  ownerId,
  runId,
  emails,
  people,
  company,
  rolesRitaShouldBeVisibleTo,
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

    const data: RitaThreadItemData =
      emails && people
        ? {
            type: "MESSAGE",
            message,
            order,
            runId,
            emails,
            people,
            company,
            accessRoles: rolesRitaShouldBeVisibleTo ?? undefined, // converting null to undefined
          }
        : {
            type: "MESSAGE",
            message,
            order,
            runId,
            accessRoles: rolesRitaShouldBeVisibleTo ?? undefined, // converting null to undefined
          };

    await client.createRitaThreadItem({
      input: {
        langgraphThreadId,
        data,
        ownerId,
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
  rolesRitaShouldBeVisibleTo: Array<number> | null,
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
          accessRoles: rolesRitaShouldBeVisibleTo ?? undefined, // converting null to undefined
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
