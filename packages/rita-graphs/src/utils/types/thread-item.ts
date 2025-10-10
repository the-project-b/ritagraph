import { BaseMessage } from "@langchain/core/messages";

import { DataChangeProposal } from "../../graphs/shared-types/base-annotation";
import type { EmailCompany, EmailMessage, EmailPerson } from "./email";

export type RitaThreadItemData =
  | {
      type: "MESSAGE";
      message: BaseMessage;
      order: number;
      runId?: string;
      emails: EmailMessage[];
      people: EmailPerson[];
      company?: EmailCompany;
      accessRoles?: Array<number>;
    }
  | {
      type: "MESSAGE";
      message: BaseMessage;
      order: number;
      runId?: string;
      accessRoles?: Array<number>;
    }
  | {
      type: "DATA_CHANGE_PROPOSAL";
      proposal: DataChangeProposal;
      order: number;
      accessRoles?: Array<number>;
    };
