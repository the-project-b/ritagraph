import { Result, NotFoundError, PersistenceError } from "@the-project-b/types";
import { RitaThread, RitaThreadTriggerType, RitaThreadStatus } from "../entities/rita-thread.entity.js";
import { RitaThreadItem } from "../entities/rita-thread-item.entity.js";

/**
 * Repository interface for RitaThread operations
 */
export interface RitaThreadRepository {
  /**
   * Create a new thread
   */
  createThread(params: {
    triggerType: RitaThreadTriggerType;
    hrCompanyId: string;
    status: RitaThreadStatus;
    lcThreadId: string;
  }): Promise<Result<RitaThread, PersistenceError>>;

  /**
   * Get thread by ID
   */
  findById(id: string): Promise<Result<RitaThread, NotFoundError>>;

  /**
   * Get thread by LangGraph thread ID
   */
  findByLcThreadId(lcThreadId: string): Promise<Result<RitaThread, NotFoundError>>;

  /**
   * Get thread items
   */
  getThreadItems(threadId: string): Promise<Result<RitaThreadItem[], PersistenceError>>;

  /**
   * Update thread status
   */
  updateStatus(
    threadId: string,
    status: RitaThreadStatus,
  ): Promise<Result<void, PersistenceError>>;

  /**
   * Update thread title
   */
  updateTitle(
    threadId: string,
    title: string,
  ): Promise<Result<void, PersistenceError>>;
}