import { PromptTemplate } from "@langchain/core/prompts";

const PROPOSAL_QUOTE_VERIFICATION_TEMPLATE = `Evaluate if quotes in proposals accurately represent the user's original request.

<Rubric>
  Base 50% achieved (quotes exist).
  Score remaining 50%:
  
  - Context (25%): Preserves critical elements
    * Temporal ("starting November", "next quarter")
    * Scope ("all employees", "department-wide")
    * Conditions ("if targets met", "pending approval")
    * Causality ("due to promotion")
  
  - Relevance (15%): Relates to specific change
  - Attribution (10%): From user, not system
</Rubric>

<Examples>
  GOOD: "Starting next November, increase Thompson's salary to 4000"
  → Quote: "Starting next November, increase Thompson's salary to 4000" ✓
  
  BAD: "Starting next November, increase Thompson's salary to 4000"
  → Quote: "increase Thompson's salary to 4000" ✗ (lost temporal)
  
  BAD: "Give all senior engineers a 10% raise if Q4 targets are met"
  → Quote: "Give a 10% raise" ✗ (lost scope & condition)
</Examples>

<Scoring>
  0.9-1.0: Complete context preserved
  0.7-0.9: Minor omissions, understanding intact
  0.5-0.7: Critical context lost
  0.5: Minimal - lacks essential context
</Scoring>

<Instructions>
  1. Identify what context EXISTS in original request
  2. Check quotes preserve ONLY the context that was present:
     - If no temporal markers in original, don't penalize for missing them
     - If no conditions in original, don't penalize for missing them
     - Only deduct for losing context that WAS there
  3. Perfect score if quote preserves ALL original context
  4. Return:
     - Score: 0.5, 0.6, 0.7, 0.8, 0.9, or 1.0
     - Reasoning: what original context was preserved/lost
</Instructions>

Original Request: {inputs}

Quotes to evaluate: {outputs}

Focus on CONTEXTUAL COMPLETENESS - does the quote preserve all critical information?
Penalize missing context heavily.
Return score between 0.5 and 1.0.`;

export async function getProposalQuoteVerificationPrompt(): Promise<string> {
  const promptTemplate = PromptTemplate.fromTemplate(
    PROPOSAL_QUOTE_VERIFICATION_TEMPLATE,
  );

  const formattedPrompt = await promptTemplate.format({
    inputs: "{inputs}",
    outputs: "{outputs}",
  });

  return formattedPrompt;
}
