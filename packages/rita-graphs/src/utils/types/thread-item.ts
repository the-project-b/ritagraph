import { BaseMessage } from "@langchain/core/messages";

import { DataChangeProposal } from "../../graphs/shared-types/base-annotation";
import type { EmailMessage, EmailPerson } from "./email";

export type RitaThreadItemData =
  | {
      type: "MESSAGE";
      message: BaseMessage;
      order: number;
      runId?: string;
      emails: EmailMessage[];
      people: EmailPerson[];
    }
  | {
      type: "MESSAGE";
      message: BaseMessage;
      order: number;
      runId?: string;
    }
  | {
      type: "DATA_CHANGE_PROPOSAL";
      proposal: DataChangeProposal;
      order: number;
    };
