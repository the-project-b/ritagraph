import { z } from "zod";

/**
 * Conversation message schema (OpenAI format / LangSmith standard)
 * Note: This is duplicated from langsmith.types.ts for domain layer independence
 * Consider extracting to shared schemas if reused more broadly
 */
export const ConversationMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  userId: z.string().optional(),
  name: z.string().optional(),
  metadata: z
    .object({
      turnNumber: z.number().optional(),
      timestamp: z.string().optional(),
    })
    .catchall(z.unknown())
    .optional(),
});

/**
 * Language enum
 */
export const LanguageSchema = z.enum(["EN", "DE"]);

/**
 * Single-turn example inputs schema
 */
export const SingleTurnInputsSchema = z.object({
  question: z.string().min(1, "Question cannot be empty"),
  preferredLanguage: LanguageSchema.optional(),
});

/**
 * Multi-turn example inputs schema
 */
export const MultiTurnInputsSchema = z.object({
  messages: z
    .array(ConversationMessageSchema)
    .min(1, "Messages array cannot be empty"),
  preferredLanguage: LanguageSchema.optional(),
});

/**
 * Union schema for example inputs - discriminated by presence of question vs messages
 */
export const ExampleInputsSchema = z.union([
  SingleTurnInputsSchema,
  MultiTurnInputsSchema,
]);

/**
 * Expected data proposal schema (from current LangSmith output schema)
 */
export const ExpectedDataProposalSchema = z.object({
  newValue: z.string(),
  changedField: z.string(),
  relatedUserId: z.string().optional(),
  mutationQueryPropertyPath: z.string().optional(),
});

/**
 * Example outputs schema (from current LangSmith output schema)
 */
export const ExampleOutputsSchema = z.object({
  expected_result_description: z.string(),
  expectedLanguage: LanguageSchema.optional(),
  expectedDataProposal: z
    .union([ExpectedDataProposalSchema, z.array(ExpectedDataProposalSchema)])
    .optional(),
  // New fields for multi-turn
  expectedConversationFlow: z.string().optional(),
  expectedTurnCount: z.number().int().positive().optional(),
});

/**
 * Example metadata schema (extensible)
 */
export const ExampleMetadataSchema = z
  .object({
    category: z.string().optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    conversationType: z.string().optional(),
    dataset_split: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .catchall(z.unknown()); // Allow additional fields

/**
 * Inferred TypeScript types from schemas
 */
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
export type Language = z.infer<typeof LanguageSchema>;
export type SingleTurnInputs = z.infer<typeof SingleTurnInputsSchema>;
export type MultiTurnInputs = z.infer<typeof MultiTurnInputsSchema>;
export type ExampleInputs = z.infer<typeof ExampleInputsSchema>;
export type ExpectedDataProposal = z.infer<typeof ExpectedDataProposalSchema>;
export type ExampleOutputs = z.infer<typeof ExampleOutputsSchema>;
export type ExampleMetadata = z.infer<typeof ExampleMetadataSchema>;
