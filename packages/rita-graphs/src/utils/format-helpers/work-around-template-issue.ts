import { BaseMessage, HumanMessage } from "@langchain/core/messages";

export function workAroundTemplateIssue(messages: Array<BaseMessage>) {
  return messages.map((i) => [
    i instanceof HumanMessage ? "user" : "ai",
    i.content.toString(),
  ]) as Array<[string, string]>;
}
