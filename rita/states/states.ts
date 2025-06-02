import { AIMessage, BaseMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';

/**
 * Base state annotation that includes message handling and authentication.
 */
const StateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  accessToken: Annotation<string | undefined>,
  systemMessages: Annotation<SystemMessage[]>,
});

/**
 * Extended state type that includes memory management for task state and other persistent data.
 */
export type ExtendedState = {
  accessToken?: string;
  systemMessages: AIMessage[];
  messages: (AIMessage | ToolMessage)[];
  memory?: Map<string, any>;
};

/**
 * Merged state annotation that combines all state features.
 * Includes message handling, authentication, and memory management.
 */
const MergedAnnotation = Annotation.Root({
  ...StateAnnotation.spec,
  memory: Annotation<Map<string, any> | undefined>,
});

export { MergedAnnotation };
