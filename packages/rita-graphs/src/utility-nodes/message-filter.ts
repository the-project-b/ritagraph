import { BaseMessage } from "@langchain/core/messages";

export function filterMessagesByTag(messages: BaseMessage[], tag: string) {
  return messages.filter((i) => i.lc_kwargs?.tags?.includes(tag));
}

export const buildMessageFilterByTag =
  (tag: string) => (message: BaseMessage) =>
    (Array.isArray(message.additional_kwargs?.tags)
      ? message.additional_kwargs?.tags
      : []
    )?.includes(tag);

export const buildExcludeMessageFilterByTag =
  (tag: string) => (message: BaseMessage) =>
    !(
      Array.isArray(message.additional_kwargs?.tags)
        ? message.additional_kwargs?.tags
        : []
    )?.includes(tag);

export const noTagsFilter = (message: BaseMessage) =>
  !message.additional_kwargs?.tags;
