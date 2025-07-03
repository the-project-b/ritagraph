import { BaseMessage } from "@langchain/core/messages";

export const onBaseMessages = (i) => i instanceof BaseMessage;
