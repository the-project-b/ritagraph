import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ToolContext } from "../../../../tool-factory";
import { createLogger } from "@the-project-b/logging";
import { ExtendedToolContext } from "../../tool";
import { onHumanMessage } from "../../../../../utils/message-filter";
import { PromptTemplate } from "@langchain/core/prompts";
import { BASE_MODEL_CONFIG } from "../../../../../graphs/model-config";
import { ChatOpenAI } from "@langchain/openai";
import { promptService } from "../../../../../services/prompts/prompt.service";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "Tools",
  tool: "sanitize_quote_for_proposal",
});

const translatedExamples = {
  EN: `
<example>
#Unchanged user message:
Starting september: Robby 20 hours (Software Architect contract), Stefan 20 hours, Indigo 40 hours
#Valid Quotes:
Starting september: Robby works 20 hours (Software Architect contract)
Starting september: Stefan 20 hours
Starting september: Indigo 40 hours
</example>

<example>
#Unchanged user message:
Starting september: Robby 20 hours (Software Architect contract), Stefan 50 hours, Indigo 40 hours
#Valid Quotes:
Starting september: Robby works 20 hours (Software Architect contract)
Starting september: Stefan 50 hours
Starting september: Indigo 40 hours
</example>
`,
  DE: `
<example>
Unchanged user message:
Ab September: Robby 20 Stunden (Software Architekt Vertrag), Stefan 20 Stunden, Indigo 40 Stunden
Valid Quotes:
Ab September: Robby 20 Stunden (Software Architekt Vertrag)
Ab September: Stefan 20 Stunden
Ab September: Indigo 40 Stunden
</example>

<example>
#Unchanged user message:
Im September: Robby 20 Stunden (Software Architekt Vertrag), Stefan 50 Stunden, Indigo 40 Stunden
#Valid Quotes:
Im September: Robby 20 Stunden (Software Architekt Vertrag)
Im September: Stefan 50 Stunden
Im September: Indigo 40 Stunden
</example>
  `,
};

const structuredOutput = z.object({
  reasoning: z.string().describe(
    `FOLLOW THIS REASONING PATTERN:
I have to follow the rules and examples and hence I have to omit irrelevant parts of the text.
In order to quote the users request.
`,
  ),
  sanitizedQuote: z.string(),
});

export const sanitizeQuoteForProposal = (
  ctx: ToolContext<ExtendedToolContext>,
) =>
  tool(
    async ({ draftedQuote, usersRequest }) => {
      logger.info("[TOOL > sanitize_quote_for_proposal]", {
        operation: "sanitize_quote_for_proposal",
        companyId: ctx.selectedCompanyId,
      });
      const { originalMessageChain, preferredLanguage } = ctx.extendedContext;
      const lastUserMessage = originalMessageChain
        .filter(onHumanMessage)
        .slice(-1)[0];

      // Fetch prompt from LangSmith
      const rawPrompt = await promptService.getRawPromptTemplateOrThrow({
        promptName: "ritagraph-sanitize-quote-proposal",
        source: "langsmith",
      });
      const prompt = await PromptTemplate.fromTemplate(
        rawPrompt.template,
      ).format({
        lastUserMessage: lastUserMessage.content,
        usersRequest,
        draftedQuote,
        examples: translatedExamples[preferredLanguage],
      });

      // const prompt = await PromptTemplate.fromTemplate(
      //   `You are part of a Payroll Specialist system.
      // Your counterparts are proposing payroll generated changes based on user inputs.
      // The user often puts multiple changes into one message.
      // It is uterly important to know why a change was proposed, hence precise quotations.
      //
      // Context:
      // <context>
      //
      // The original untouched user message:
      // {lastUserMessage}
      // --------------------------------
      // Since one quote only refers to one change you need to create a quote for this:
      // Intepreted user request: {usersRequest}
      // Draft for the quote: {draftedQuote}
      //
      // </context>
      //
      // <rules>
      //  - A quote should adhere to this format: "Starting september [...] Robby works 20 hours [...] (Software Architect contract)"
      //  - If temporals are defined they need to be included in the quote.
      //  - Only the parts relevant to a change should be included in the quote.
      //  - DO NOT FORGET THE NAME OF THE EMPLOYEE
      //  - IF MENTIONED DO NOT FORGET THE CONTRACT / JOB TITLE
      //  - IF JOB TITLE IS NOT MENTIONED DO NOT IMPLY IT
      //  - if there is a list of employees often there are common related changes e.g. starting september [...] all employees get a raise.
      //  - IMPORTANT: If there is text in between your quote segments make sure you imply that by using "[...]".
      //  - DO NOT FORGET to use "[...]" to imply text in between your quote segments.
      //  - Example for [...]: "This is a long text that has some relevant parts like relevant" -> "long text [...] relevant"
      //  - Use eliptical quotes (chicago style)
      // </rules>
      //
      // {examples}
      // `,
      // ).format({
      //   lastUserMessage: lastUserMessage.content,
      //   usersRequest,
      //   draftedQuote,
      //   examples: translatedExamples[preferredLanguage],
      // });

      const llm = new ChatOpenAI({
        ...BASE_MODEL_CONFIG,
        temperature: 0.1,
      });

      const response = await llm
        .withStructuredOutput<
          z.infer<typeof structuredOutput>
        >(structuredOutput)
        .invoke(prompt);

      return {
        sanitizedQuote: response.sanitizedQuote,
      };
    },
    {
      name: "sanitize_quote_for_proposal",
      description:
        "Uses the conversation history to create a well formatted quote for data changes and creations",
      schema: z.object({
        usersRequest: z.string().describe("What the user wants to do"),
        draftedQuote: z
          .string()
          .describe(
            "A well formatted quote for the user's request which is to be refined",
          ),
      }),
    },
  );
