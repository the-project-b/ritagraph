import { BaseMessage } from "@langchain/core/messages";

export const onBaseMessages = (i) => i instanceof BaseMessage;

export const onHumanAndAiMessage = (i: BaseMessage) => {
  return i.getType() === "human" || i.getType() === "ai";
};

export const onNoThoughtMessages = (i: BaseMessage) => {
  if (!i.additional_kwargs?.tags) {
    return true;
  }

  if (!Array.isArray(i.additional_kwargs?.tags)) {
    return true;
  }

  return !i.additional_kwargs?.tags?.includes("THOUGHT");
};

export const onHumanMessage = (i: BaseMessage) => {
  return i.getType() === "human";
};
