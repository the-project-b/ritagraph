import { HumanMessage } from "@langchain/core/messages";
import { appendMessageAsThreadItem } from "../../../utils/append-message-as-thread-item";
import { getContextFromConfig, GraphStateType, Node } from "../graph-state";
import AgentActionLogger from "../../../utils/agent-action-logger/AgentActionLogger";
import type {
  EmailCompany,
  EmailMessage,
  EmailPerson,
} from "../../../utils/types/email";
import { buildEmailContextForLLM } from "../../../utils/email-context-builder";

type AssumedConfigurableType = {
  thread_id: string;
};

/**
 * Responsible for initializing the settings for the graph.
 */
export const loadSettings: Node = async (state, config, getAuthUser) => {
  const { user, token, appdataHeader } = getAuthUser(config);
  const { backupCompanyId } = getContextFromConfig(config);
  const { thread_id } =
    config.configurable as unknown as AssumedConfigurableType;

  const lastMessage = state.messages.at(-1);

  const parsedEmail = lastMessage.additional_kwargs?.parsedEmail as
    | {
        messages: EmailMessage[];
        people: EmailPerson[];
        company?: EmailCompany;
      }
    | undefined;

  const cleanContent = lastMessage.content.toString();

  if (parsedEmail?.messages && parsedEmail.messages.length > 0) {
    const enrichedContent = buildEmailContextForLLM({
      triggerContent: cleanContent,
      emails: parsedEmail.messages,
    });

    lastMessage.content = enrichedContent;
  }

  await appendMessageAsThreadItem({
    message: new HumanMessage(cleanContent, {
      ...lastMessage.additional_kwargs,
      isEmail: lastMessage.additional_kwargs.isRepresentingEmail ?? false,
      subject: lastMessage.additional_kwargs.subject,
    }),
    langgraphThreadId: thread_id,
    context: {
      accessToken: token,
      selectedCompanyId: state.selectedCompanyId,
      appdataHeader,
    },
    ownerId: user.id,
    emails: parsedEmail?.messages,
    people: parsedEmail?.people,
    company: parsedEmail?.company,
  });

  return {
    preferredLanguage:
      state.preferredLanguage ?? user.preferredLanguage ?? "DE",
    selectedCompanyId:
      state.selectedCompanyId ?? user.company.id ?? backupCompanyId,
    agentActionLogger: AgentActionLogger.fromLogs(state.agentActionEvents),
  };
};

export function routingDecision(state: GraphStateType) {
  const userMessages = state.messages.filter(
    (msg) => msg instanceof HumanMessage,
  );

  const shouldGenerateTitle =
    userMessages.length === 1 || userMessages.length % 10 === 0;

  if (shouldGenerateTitle && !state.isTriggeredByEmail) {
    return ["generateTitle", "router"];
  }

  return ["router"];
}
