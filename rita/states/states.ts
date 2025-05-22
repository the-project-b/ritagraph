import { Annotation, MessagesAnnotation } from '@langchain/langgraph';

const StateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  needs_llm_postprocess: Annotation<boolean>,
});

// const HumanResponseStateAnnotation = Annotation.Root({
//   interruptResponse: Annotation<string>,
//   toolArgs: Annotation<Record<string, string>>,
// });

const MergedAnnotation = Annotation.Root({
  ...StateAnnotation.spec,
  needs_llm_postprocess: Annotation<boolean>,
  // ...HumanResponseStateAnnotation.spec, ->> Keeping this commented out for now for future reference
});

export { MergedAnnotation };
