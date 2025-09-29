import {
  NotFoundError,
  PersistenceError,
  Result,
  err,
  isOk,
  ok,
  unwrap,
  unwrapErr,
} from "@the-project-b/types";
import { GraphQLClient } from "graphql-request";
import { createLogger } from "@the-project-b/logging";
import {
  RitaThreadItem,
  RitaThreadItemType,
} from "../../../domain/entities/rita-thread-item.entity.js";
import {
  RitaThread,
  RitaThreadStatus,
  RitaThreadTriggerType,
} from "../../../domain/entities/rita-thread.entity.js";
import { RitaThreadRepository } from "../../../domain/repositories/rita-thread.repository.js";

const logger = createLogger({ service: "experiments" }).child({
  module: "GraphQLRitaThreadRepository",
});

// GraphQL queries and mutations
const CREATE_RITA_THREAD = `
  mutation createRitaThread($input: CreateRitaThreadInput!) {
    createRitaThread(input: $input) {
      id
      lcThreadId
      triggerType
      hrCompanyId
      status
      title
      createdAt
      updatedAt
    }
  }
`;

const GET_THREAD_BY_ID = `
  query getThreadById($threadId: String!) {
    thread(id: $threadId) {
      id
      lcThreadId
      triggerType
      hrCompanyId
      status
      title
      createdAt
      updatedAt
    }
  }
`;

const GET_THREAD_ITEMS = `
  query getThreadItemsByThreadId($threadId: String!) {
    thread(id: $threadId) {
      threadItems {
        id
        data
        createdAt
        updatedAt
      }
    }
  }
`;

/**
 * GraphQL implementation of RitaThreadRepository
 */
export class GraphQLRitaThreadRepository implements RitaThreadRepository {
  private client: GraphQLClient;

  constructor(
    private endpoint: string,
    private getAuthToken: () => string,
  ) {
    this.client = new GraphQLClient(endpoint);
  }

  private updateAuthHeaders(): void {
    const token = this.getAuthToken();
    this.client.setHeaders({
      authorization: token,
    });
  }

  async createThread(params: {
    triggerType: RitaThreadTriggerType;
    hrCompanyId: string;
    status: RitaThreadStatus;
    lcThreadId: string;
  }): Promise<Result<RitaThread, PersistenceError>> {
    try {
      this.updateAuthHeaders();

      const result: any = await this.client.request(CREATE_RITA_THREAD, {
        input: {
          triggerType: params.triggerType,
          hrCompanyId: params.hrCompanyId,
          status: params.status,
          lcThreadId: params.lcThreadId,
        },
      });

      const threadData = result.createRitaThread;

      const thread = RitaThread.create({
        id: threadData.id,
        lcThreadId: threadData.lcThreadId,
        triggerType: threadData.triggerType as RitaThreadTriggerType,
        hrCompanyId: threadData.hrCompanyId,
        status: threadData.status as RitaThreadStatus,
        title: threadData.title,
        createdAt: threadData.createdAt
          ? new Date(threadData.createdAt)
          : undefined,
        updatedAt: threadData.updatedAt
          ? new Date(threadData.updatedAt)
          : undefined,
      });

      if (!isOk(thread)) {
        return err(
          new PersistenceError(
            `Failed to create thread entity: ${unwrapErr(thread).message}`,
          ),
        );
      }

      return ok(unwrap(thread));
    } catch (error) {
      logger.error("Failed to create thread", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return err(
        new PersistenceError(
          `Failed to create thread: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
    }
  }

  async findById(id: string): Promise<Result<RitaThread, NotFoundError>> {
    try {
      this.updateAuthHeaders();

      const result: any = await this.client.request(GET_THREAD_BY_ID, {
        threadId: id,
      });

      if (!result.thread) {
        return err(new NotFoundError("RitaThread", id));
      }

      const threadData = result.thread;

      const thread = RitaThread.create({
        id: threadData.id,
        lcThreadId: threadData.lcThreadId,
        triggerType: threadData.triggerType as RitaThreadTriggerType,
        hrCompanyId: threadData.hrCompanyId,
        status: threadData.status as RitaThreadStatus,
        title: threadData.title,
        createdAt: threadData.createdAt
          ? new Date(threadData.createdAt)
          : undefined,
        updatedAt: threadData.updatedAt
          ? new Date(threadData.updatedAt)
          : undefined,
      });

      if (!isOk(thread)) {
        return err(new NotFoundError("RitaThread", id));
      }

      return ok(unwrap(thread));
    } catch (error) {
      return err(new NotFoundError("RitaThread", id));
    }
  }

  async findByLcThreadId(
    lcThreadId: string,
  ): Promise<Result<RitaThread, NotFoundError>> {
    // This would need a specific GraphQL query to find by lcThreadId
    // For now, returning not found
    return err(new NotFoundError("RitaThread by lcThreadId", lcThreadId));
  }

  async getThreadItems(
    threadId: string,
  ): Promise<Result<RitaThreadItem[], PersistenceError>> {
    try {
      this.updateAuthHeaders();

      const result: any = await this.client.request(GET_THREAD_ITEMS, {
        threadId,
      });

      if (!result.thread?.threadItems) {
        return ok([]);
      }

      const items: RitaThreadItem[] = [];

      for (const itemData of result.thread.threadItems as any[]) {
        // Determine the type based on the data structure
        let type = RitaThreadItemType.Message;
        try {
          const data =
            typeof itemData.data === "string"
              ? JSON.parse(itemData.data)
              : itemData.data;
          if (data.type === "DATA_CHANGE_PROPOSAL") {
            type = RitaThreadItemType.DataChangeProposal;
          }
        } catch (e) {
          // If we can't parse, treat as message
        }

        const item = RitaThreadItem.create({
          id: itemData.id,
          threadId,
          type,
          data: itemData.data,
          createdAt: itemData.createdAt
            ? new Date(itemData.createdAt)
            : undefined,
          updatedAt: itemData.updatedAt
            ? new Date(itemData.updatedAt)
            : undefined,
        });

        if (isOk(item)) {
          items.push(unwrap(item));
        }
      }

      return ok(items);
    } catch (error) {
      logger.error("Failed to get thread items", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return err(
        new PersistenceError(
          `Failed to get thread items: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
    }
  }

  async updateStatus(
    threadId: string,
    status: RitaThreadStatus,
  ): Promise<Result<void, PersistenceError>> {
    // TODO: Implement GraphQL mutation for updating status
    return ok(undefined);
  }

  async updateTitle(
    threadId: string,
    title: string,
  ): Promise<Result<void, PersistenceError>> {
    // TODO: Implement GraphQL mutation for updating title
    return ok(undefined);
  }
}
