import { Annotation, MessagesAnnotation } from '@langchain/langgraph';

const StateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  accessToken: Annotation<string | undefined>,
});

// const HumanResponseStateAnnotation = Annotation.Root({
//   interruptResponse: Annotation<string>,
//   toolArgs: Annotation<Record<string, string>>,
// });

const MergedAnnotation = Annotation.Root({
  ...StateAnnotation.spec,
  // ...HumanResponseStateAnnotation.spec, ->> Keeping this commented out for now for future reference
});

export { MergedAnnotation };
