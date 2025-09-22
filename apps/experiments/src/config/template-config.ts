import { TemplateProcessor } from "../evaluators/helpers/template-processor.js";

/**
 * Configure template delimiters for the experiments app
 *
 * Options:
 * - "{{" and "}}" (default) - Avoids LangSmith conflicts
 * - "[" and "]" - Clean alternative if no square bracket usage
 * - "{" and "}" - Single braces if you're sure there's no LangSmith conflict
 * - Custom delimiters of your choice
 */
export function configureTemplateDelimiters() {
  // Default: {{}}
  // Example to change from default:
  // TemplateProcessor.setDelimiters({ start: "[", end: "]" });
  // Check out:
  // [private static delimiters: TemplateDelimiters = {](https://github.com/the-project-b/ritagraph/blob/74c1e5316aba6c612e99cf72fa43ce9278005cea/apps/experiments/src/evaluators/helpers/template-processor.ts#L41-L44)
}

// Export the current configuration for reference
export function getCurrentDelimiters() {
  return TemplateProcessor.getDelimiters();
}
