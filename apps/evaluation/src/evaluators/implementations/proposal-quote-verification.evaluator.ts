import { createEvaluationLogger } from "../core/evaluation-context.js";
import {
  EvaluationOptions,
  EvaluationResult,
  EvaluatorParams,
  TextEvaluationInputs,
  TextEvaluationOutputs,
  TypedEvaluator,
} from "../core/types.js";
import { getProposalQuoteVerificationPrompt } from "../prompts/proposal-quote-verification.prompt.js";
import { DataChangeProposal } from "./types.js";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";

const logger = createEvaluationLogger(
  "experiments",
  "ProposalQuoteVerificationEvaluator",
);
interface ProposalQuoteVerificationInputs extends TextEvaluationInputs {
  readonly question: string;
}

interface ProposalQuoteVerificationOutputs extends TextEvaluationOutputs {
  readonly answer: string;
  readonly dataChangeProposals?: Array<DataChangeProposal>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ProposalQuoteVerificationReferenceOutputs {}

const ProposalQuoteEvaluationOutput = z.object({
  reasoning: z.string().describe("Detailed explanation of the evaluation"),
  score: z.number().min(0.5).max(1.0).describe("Score between 0.5 and 1.0"),
});

export const proposalQuoteVerificationEvaluator: TypedEvaluator<
  "PROPOSAL_QUOTE_VERIFICATION",
  ProposalQuoteVerificationInputs,
  ProposalQuoteVerificationOutputs,
  ProposalQuoteVerificationReferenceOutputs
> = {
  config: {
    type: "PROPOSAL_QUOTE_VERIFICATION",
    name: "Verification of the quotes attached to proposals",
    description:
      "This evaluator will run if and only if data change proposals have been created during the run, it will then verify that these proposals ALWAYS have a usersQuotedRequest and that this string is not empty and in line with the original description of what this value should represent in the context of the conversation",
    defaultModel: "openai:gpt-4o",
    supportsCustomPrompt: true,
    supportsReferenceKey: false,
  } as const,

  async evaluate(
    params: EvaluatorParams<
      ProposalQuoteVerificationInputs,
      ProposalQuoteVerificationOutputs,
      ProposalQuoteVerificationReferenceOutputs
    >,
    options: EvaluationOptions = {},
  ): Promise<EvaluationResult> {
    const { customPrompt } = options;

    const dataChangeProposals = params.outputs?.dataChangeProposals;
    if (!dataChangeProposals || dataChangeProposals.length === 0) {
      logger.info(
        "[PROPOSAL_QUOTE_VERIFICATION] No data change proposals found, skipping evaluation",
        {
          operation: "evaluate.skip",
          evaluatorType: "PROPOSAL_QUOTE_VERIFICATION",
          hasOutputs: !!params.outputs,
          hasAnswer: !!params.outputs?.answer,
          hasQuestion: !!params.inputs?.question,
        },
      );
      return {
        key: "proposal_quote_verification",
        score: null,
        comment:
          "No data change proposals found in the output. Evaluation skipped.",
      };
    }

    const proposalAnalysis = analyzeProposalQuotes(dataChangeProposals);

    logger.info("[PROPOSAL_QUOTE_VERIFICATION] Analyzing proposal quotes", {
      operation: "evaluate.analyze",
      evaluatorType: "PROPOSAL_QUOTE_VERIFICATION",
      totalProposals: dataChangeProposals.length,
      proposalsWithQuotes: proposalAnalysis.proposalsWithQuotes,
      proposalsWithoutQuotes: proposalAnalysis.proposalsWithoutQuotes,
      proposalsWithEmptyQuotes: proposalAnalysis.proposalsWithEmptyQuotes,
    });

    const baseScore = calculateBaseScore(proposalAnalysis);
    if (
      proposalAnalysis.proposalsWithoutQuotes === dataChangeProposals.length
    ) {
      logger.warn(
        "[PROPOSAL_QUOTE_VERIFICATION] All proposals missing quote field",
        {
          operation: "evaluate.missing_quotes",
          evaluatorType: "PROPOSAL_QUOTE_VERIFICATION",
          totalProposals: dataChangeProposals.length,
        },
      );
      return {
        key: "proposal_quote_verification",
        score: 0,
        comment: `All ${dataChangeProposals.length} proposal(s) are missing the quote field entirely. The 'quote' field must be present in all data change proposals.`,
      };
    }

    if (baseScore >= 0.5) {
      try {
        const dynamicPrompt =
          customPrompt || (await getProposalQuoteVerificationPrompt());

        const llm = new ChatOpenAI({
          model: "gpt-4o-mini",
        });

        const proposalsForEvaluation = dataChangeProposals.map(
          (proposal) => proposal.quote || "",
        );

        const prompt = await ChatPromptTemplate.fromTemplate(
          dynamicPrompt,
        ).invoke({
          inputs: params.inputs?.question || params.inputs,
          outputs: proposalsForEvaluation,
        });

        const response = await llm
          .withStructuredOutput<
            z.infer<typeof ProposalQuoteEvaluationOutput>
          >(ProposalQuoteEvaluationOutput)
          .invoke(prompt);

        const { score, reasoning } = response;

        if (typeof score !== "number" || score < 0.5 || score > 1.0) {
          throw new Error(
            `Invalid score returned: ${score}. Expected number between 0.5 and 1.0`,
          );
        }

        logger.info("[PROPOSAL_QUOTE_VERIFICATION] Evaluation completed", {
          operation: "evaluate.complete",
          evaluatorType: "PROPOSAL_QUOTE_VERIFICATION",
          baseScore,
          llmScore: score,
          totalProposals: dataChangeProposals.length,
          hasReasoning: !!reasoning,
        });

        return {
          key: "proposal_quote_verification",
          score,
          comment: reasoning || "",
          value: {
            baseScore,
            proposalAnalysis,
            llmScore: score,
          },
        };
      } catch (error) {
        logger.error(
          "[PROPOSAL_QUOTE_VERIFICATION] LLM evaluation failed, returning base score",
          {
            operation: "evaluate.llm_error",
            evaluatorType: "PROPOSAL_QUOTE_VERIFICATION",
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            baseScore,
            totalProposals: dataChangeProposals.length,
          },
        );

        const comment = `LLM evaluation failed. Base score: ${baseScore.toFixed(2)}. ${generateBaseScoreComment(proposalAnalysis, baseScore)}`;

        return {
          key: "proposal_quote_verification",
          score: baseScore,
          comment,
          value: {
            baseScore,
            proposalAnalysis,
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    } else {
      logger.info(
        "[PROPOSAL_QUOTE_VERIFICATION] Returning base score (no LLM evaluation needed)",
        {
          operation: "evaluate.base_score",
          evaluatorType: "PROPOSAL_QUOTE_VERIFICATION",
          baseScore,
          totalProposals: dataChangeProposals.length,
        },
      );

      const comment = generateBaseScoreComment(proposalAnalysis, baseScore);

      return {
        key: "proposal_quote_verification",
        score: baseScore,
        comment,
        value: {
          baseScore,
          proposalAnalysis,
        },
      };
    }
  },
} as const;

interface ProposalAnalysis {
  totalProposals: number;
  proposalsWithQuotes: number;
  proposalsWithoutQuotes: number;
  proposalsWithEmptyQuotes: number;
  proposalsWithValidQuotes: number;
  quotes: Array<{ proposalId: string; quote: string | undefined }>;
}

function analyzeProposalQuotes(
  proposals: Array<DataChangeProposal>,
): ProposalAnalysis {
  const analysis: ProposalAnalysis = {
    totalProposals: proposals.length,
    proposalsWithQuotes: 0,
    proposalsWithoutQuotes: 0,
    proposalsWithEmptyQuotes: 0,
    proposalsWithValidQuotes: 0,
    quotes: [],
  };

  for (const proposal of proposals) {
    const { quote } = proposal;
    analysis.quotes.push({
      proposalId: proposal.id,
      quote,
    });

    if (!quote) {
      analysis.proposalsWithoutQuotes++;
    } else {
      analysis.proposalsWithQuotes++;
      if (quote.trim().length === 0) {
        analysis.proposalsWithEmptyQuotes++;
      } else {
        analysis.proposalsWithValidQuotes++;
      }
    }
  }

  return analysis;
}

function calculateBaseScore(analysis: ProposalAnalysis): number {
  const totalProposals = analysis.totalProposals;
  if (totalProposals === 0) return 1;

  const existenceRatio = analysis.proposalsWithQuotes / totalProposals;
  const existenceScore = existenceRatio * 0.2;

  const nonEmptyRatio = analysis.proposalsWithValidQuotes / totalProposals;
  const nonEmptyScore = nonEmptyRatio * 0.3;

  return existenceScore + nonEmptyScore;
}

function generateBaseScoreComment(
  analysis: ProposalAnalysis,
  baseScore: number,
): string {
  const issues: string[] = [];

  if (analysis.proposalsWithoutQuotes > 0) {
    issues.push(
      `${analysis.proposalsWithoutQuotes} proposal(s) missing the quote field`,
    );
  }

  if (analysis.proposalsWithEmptyQuotes > 0) {
    issues.push(
      `${analysis.proposalsWithEmptyQuotes} proposal(s) have empty quote text`,
    );
  }

  if (issues.length === 0) {
    return `All ${analysis.totalProposals} proposal(s) have valid quote fields. Score: ${baseScore.toFixed(2)}`;
  }

  return `Issues found: ${issues.join(", ")}. Base score: ${baseScore.toFixed(2)} (out of 0.5 max for deterministic checks)`;
}
