import { BaseMessage, SystemMessage } from '@langchain/core/messages';
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';

const BaseStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
});

const StateAnnotation = Annotation.Root({
  ...BaseStateAnnotation.spec,
  accessToken: Annotation<string | undefined>,
  systemMessages: Annotation<SystemMessage[]>,
});

// const HumanResponseStateAnnotation = Annotation.Root({
//   interruptResponse: Annotation<string>,
//   toolArgs: Annotation<Record<string, string>>,
// });

const MergedAnnotation = Annotation.Root({
  ...StateAnnotation.spec,
  // ...HumanResponseStateAnnotation.spec, ->> Keeping this commented out for now for future reference
});

export { BaseStateAnnotation, MergedAnnotation };
