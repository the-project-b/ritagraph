/**
 * Email Context Builder
 *
 * Builds rich context for LLM by combining the trigger message with
 * historical email messages from the structured emails array.
 */

import type { EmailMessage } from "./types/email";

interface BuildEmailContextParams {
  triggerContent: string;
  emails: EmailMessage[];
}

/**
 * Builds enriched email content for LLM processing.
 * Combines the trigger message with historical context from the emails array.
 */
export function buildEmailContextForLLM({
  triggerContent,
  emails,
}: BuildEmailContextParams): string {
  const contextMessages = emails.filter((m) => m.role === "context");

  if (contextMessages.length === 0) {
    return triggerContent;
  }

  let enrichedContent = triggerContent;

  enrichedContent += "\n\n---\n\n";
  enrichedContent += "**HISTORICAL EMAIL CONTEXT**\n\n";
  enrichedContent +=
    "Below are previous messages in this email thread for context:\n\n";

  enrichedContent += buildContextMessagesHtml(contextMessages);

  return enrichedContent;
}

function buildContextMessagesHtml(messages: EmailMessage[]): string {
  const sortedMessages = [...messages].sort((a, b) => a.depth - b.depth);

  const lines: string[] = [];

  for (const message of sortedMessages) {
    const prefix =
      message.type === "forward"
        ? "FW"
        : message.type === "reply"
          ? "RE"
          : "ORIGINAL";
    const date = message.timestamp
      ? new Date(message.timestamp).toISOString().split("T")[0]
      : "";
    const from = message.from || "";
    const subject = message.subject || "";
    const contentWithoutNewlines = message.content.replace(/\n/g, " ");

    const line = `[${prefix}] ${date} From: ${from} | Subject: ${subject} | ${contentWithoutNewlines}`;

    lines.push(line);
  }

  return lines.join("\n");
}
