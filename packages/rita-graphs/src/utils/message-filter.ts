import { BaseMessage } from "@langchain/core/messages";

export const onBaseMessages = (i) => i instanceof BaseMessage;

export const onHumanAndAiMessage = (i: BaseMessage) => {
  return i.getType() === "human" || i.getType() === "ai";
};

export const onHumanMessage = (i: BaseMessage) => {
  return i.getType() === "human";
};
