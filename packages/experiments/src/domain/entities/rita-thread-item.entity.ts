import {
  Result,
  ValidationError,
  ok,
  err,
  isOk,
  unwrap,
} from "@the-project-b/types";
import { DataChangeProposal } from "../value-objects/data-change-proposal.value-object.js";

export enum RitaThreadItemType {
  DataChangeProposal = "DATA_CHANGE_PROPOSAL",
  Message = "MESSAGE",
  Error = "ERROR",
}

export interface DataChangeProposalData {
  proposal: DataChangeProposal;
  [key: string]: unknown;
}

export interface MessageData {
  content: string;
  role?: string;
  [key: string]: unknown;
}

export interface ErrorData {
  message: string;
  code?: string;
  stack?: string;
  [key: string]: unknown;
}

export type RitaThreadItemData =
  | DataChangeProposalData
  | MessageData
  | ErrorData
  | string
  | Record<string, unknown>;

/**
 * RitaThreadItem entity - represents an item within a thread (e.g., data change proposal)
 */
export class RitaThreadItem {
  private constructor(
    public readonly id: string,
    public readonly threadId: string,
    public readonly type: RitaThreadItemType,
    public readonly data: RitaThreadItemData,
    public readonly createdAt?: Date,
    public readonly updatedAt?: Date,
  ) {}

  static create(props: {
    id: string;
    threadId: string;
    type: RitaThreadItemType;
    data: RitaThreadItemData;
    createdAt?: Date;
    updatedAt?: Date;
  }): Result<RitaThreadItem, ValidationError> {
    if (!props.id) {
      return err(new ValidationError("Thread item ID is required"));
    }

    if (!props.threadId) {
      return err(new ValidationError("Thread ID is required"));
    }

    if (!props.data) {
      return err(new ValidationError("Thread item data is required"));
    }

    return ok(
      new RitaThreadItem(
        props.id,
        props.threadId,
        props.type,
        props.data,
        props.createdAt,
        props.updatedAt,
      ),
    );
  }

  isDataChangeProposal(): boolean {
    return this.type === RitaThreadItemType.DataChangeProposal;
  }

  getDataChangeProposal(): DataChangeProposal | null {
    if (!this.isDataChangeProposal()) {
      return null;
    }

    try {
      const data =
        typeof this.data === "string" ? JSON.parse(this.data) : this.data;
      const proposalData = data.proposal;

      if (!proposalData) {
        return null;
      }

      // If it's already a DataChangeProposal instance, return it
      if (proposalData instanceof DataChangeProposal) {
        return proposalData;
      }

      // Otherwise, try to create from plain object
      const result = DataChangeProposal.fromPlainObject(proposalData);
      return isOk(result) ? unwrap(result) : null;
    } catch (error) {
      return null;
    }
  }
}
