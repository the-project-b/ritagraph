import { PromptTemplate } from "@langchain/core/prompts";

interface LanguageConfig {
  id: string;
  languageText: string;
  goodExamples: string[];
  badExamples: string[];
}

const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  DE: {
    id: "DE",
    languageText: "German",
    goodExamples: [
      '"Gehaltsanpassung für Thompson" (German, professional, no sensitive data)',
      '"Mitarbeiterübersicht" (German, clear, no specifics)',
      '"Leistungsbonus Aktualisierung Garcia" (German, professional, name is OK)',
      '"Überstundensatz Änderung Wilson" (German, professional, no sensitive data)',
      '"Gehaltsanpassungen für mehrere Mitarbeiter" (German, professional, no sensitive data)',
    ],
    badExamples: [
      '"Erhöhe Thompson Gehalt auf €4000" (exposes specific amount)',
      '"15% Bonus für Garcia" (exposes specific percentage)',
      '"Salary Anpassung für Mitarbeiter" (mixed language)',
      '"irgendwas mit Geld" (unprofessional)',
    ],
  },
  EN: {
    id: "EN",
    languageText: "English",
    goodExamples: [
      '"Salary adjustment for Thompson" (English, professional, no sensitive data)',
      '"Employee list overview" (English, clear, no specifics)',
      '"Performance bonus update for Garcia" (English, professional, name is OK)',
      '"Overtime rate modification for Wilson" (English, professional, no sensitive data)',
      '"Salary adjustments for multiple employees" (English, professional, no sensitive data)',
    ],
    badExamples: [
      '"Increase Thompson salary to €4000" (exposes specific amount)',
      '"15% bonus for Garcia" (exposes specific percentage)',
      '"Gehalt adjustment for employee" (mixed language)',
      '"stuff about money" (unprofessional)',
    ],
  },
};

const TITLE_EVALUATION_TEMPLATE = `You are an expert evaluator assessing the quality of generated thread titles for a payroll system. Your task is to evaluate the title based on language consistency, professional wording, and sensitive data protection.

<Context>
  This is a payroll management system. Users interact with the system in either German or English. Thread titles are automatically generated to summarize conversations about employee data, salary adjustments, and other HR-related tasks.
  
  The user's preferred language for this evaluation is: {languageText}
</Context>

<Evaluation Criteria>
  1. **Language Consistency (30%)**
     - The title language MUST match the user's preferred language ({languageText})
     - Mixed language in the title is unacceptable

  2. **Professional Wording (40%)**
     - Title should be professionally worded and appropriate for a business context
     - Should use proper payroll/HR terminology
     - Must be clear and descriptive of the conversation topic
     - Should be concise (ideally under 50 characters)
     - Grammar and spelling must be correct

  3. **Sensitive Data Protection (30%)**
     - Title MUST NOT expose specific monetary amounts (e.g., "40€", "$1000", "€2,500")
     - Title MUST NOT include exact percentages (e.g., "15% increase", "10% bonus")
     - Title MUST NOT contain specific numeric values that could be sensitive
     - Employee names ARE acceptable (they're not considered sensitive in this context)
     - General descriptive terms ARE acceptable (e.g., "salary adjustment", "rate change", "bonus update")
</Evaluation Criteria>

<Scoring Scale>
  Provide a score from 0.0 to 1.0 based on how well the title meets all criteria:

  0.9-1.0: Excellent - Professional title in correct language with no sensitive data
  0.8-0.9: Very Good - Minor issues with wording but correct language and no sensitive data
  0.7-0.8: Good - Acceptable title with minor professional wording issues
  0.6-0.7: Satisfactory - Correct language but noticeable wording issues or very minor sensitive data hints
  0.4-0.6: Poor - Unprofessional wording OR contains hints of sensitive data
  0.2-0.4: Very Poor - Wrong language OR exposes sensitive monetary values
  0.0-0.2: Unacceptable - Wrong language AND exposes sensitive data, or completely inappropriate

  IMPORTANT: If the title is in the wrong language, the maximum score is 0.3
  IMPORTANT: If the title exposes specific monetary amounts or percentages, the maximum score is 0.4
</Scoring Scale>

<Instructions>
  IMPORTANT: You are evaluating ONLY the generated title text itself. Do NOT penalize the title for any sensitive information that appears in the user's question or conversation context. The title should be judged solely on its own content.
  
  1. Verify that the title is in {languageText}
  2. Evaluate the professional quality of the wording in the title itself
  3. Scan the title text for any sensitive numeric data (amounts, percentages) - ignore what was in the user question
  4. Consider the overall appropriateness of the title for a payroll system context
  5. Assign a numeric score (0.0-1.0) based on the scoring scale
  6. Provide clear reasoning for your score based ONLY on the title content
  
  Remember: If the title successfully avoids exposing sensitive data, it should NOT be penalized even if the original conversation contained such data.
</Instructions>

<Examples>
  Good titles in {languageText}:
{goodExamples}

  Bad titles:
{badExamples}
</Examples>

<input>
User Question: {inputs}
</input>

<generated_title>
{outputs}
</generated_title>

<reference_information>
{reference_outputs}
</reference_information>

Evaluate the thread title quality based on the criteria above. Your score must be a number between 0.0 and 1.0.`;

export async function getTitleGenerationPrompt(
  preferredLanguage?: string,
): Promise<string> {
  const languageCode = preferredLanguage || "EN";
  const config = LANGUAGE_CONFIGS[languageCode] || LANGUAGE_CONFIGS.EN;

  const promptTemplate = PromptTemplate.fromTemplate(TITLE_EVALUATION_TEMPLATE);

  const formattedPrompt = await promptTemplate.format({
    languageText: config.languageText,
    goodExamples: config.goodExamples.map((ex) => `  - ${ex}`).join("\n"),
    badExamples: config.badExamples.map((ex) => `  - ${ex}`).join("\n"),
    inputs: "{inputs}", // These get replaced later through the llmasjudge openevals stuff
    outputs: "{outputs}",
    reference_outputs: "{reference_outputs}",
  });

  return formattedPrompt;
}
