// #region Domain Exports
// Entities
export { Prompt } from "./domain/entities/prompt.entity.js";
export type {
  CreatePromptParams,
  FormattedPrompt,
} from "./domain/entities/prompt.entity.js";

// Value Objects
export { PromptId } from "./domain/value-objects/prompt-id.value-object.js";
export { PromptTemplate } from "./domain/value-objects/prompt-template.value-object.js";
export { LanguageCode } from "./domain/value-objects/language-code.value-object.js";
export { PromptVariables } from "./domain/value-objects/prompt-variables.value-object.js";
export type { VariableDefinition } from "./domain/value-objects/prompt-variables.value-object.js";
export {
  PromptMetadata,
  PromptCategory,
} from "./domain/value-objects/prompt-metadata.value-object.js";

// Services
export { PromptFormatterService } from "./domain/services/prompt-formatter.service.js";
export type { FormattingResult } from "./domain/services/prompt-formatter.service.js";

// Repositories
export type {
  PromptRepository,
  PromptFilter,
} from "./domain/repositories/prompt.repository.js";
// #endregion

// #region Application Exports
// Use Cases
export { FormatSimplePromptUseCase } from "./application/use-cases/format-simple-prompt.use-case.js";
export { CreateChatPromptUseCase } from "./application/use-cases/create-chat-prompt.use-case.js";

// DTOs
export type {
  FormatSimplePromptParams,
  FormattedPromptResponse,
  FormatWithTruncationParams,
} from "./application/dto/format-prompt.dto.js";
export type {
  ChatMessage,
  ChatPromptConfig,
  ChatPromptResponse,
  CreateChatPromptParams,
  MessageRole,
  MessageSpec,
  FormatChatMessagesParams,
} from "./application/dto/chat-prompt.dto.js";

// Services
export { PromptRegistryService } from "./application/services/prompt-registry.service.js";
// #endregion

// #region Infrastructure Exports
// Adapters
export { LangChainPromptAdapter } from "./infrastructure/adapters/langchain-prompt.adapter.js";
export type { LangChainCompatiblePrompt } from "./infrastructure/adapters/langchain-prompt.adapter.js";
export { LangChainChatAdapter } from "./infrastructure/adapters/langchain-chat.adapter.js";
export type {
  LangChainCompatibleChatPrompt,
  LangChainMessage,
} from "./infrastructure/adapters/langchain-chat.adapter.js";

// Factories
export {
  MessageFactory,
  MessageBuilder,
} from "./infrastructure/factories/message.factory.js";

// Repositories
export { InMemoryPromptRepository } from "./infrastructure/repositories/in-memory-prompt.repository.js";
// #endregion

// #region Shared Exports
// Result Pattern
export { Result } from "./shared/types/result.js";
export type { Success, Failure } from "./shared/types/result.js";

// Errors
export {
  DomainError,
  ValidationError,
  NotFoundError,
  PersistenceError,
  FormatError,
  PromptCreationError,
  LanguageNotSupportedError,
} from "./shared/errors/domain.errors.js";
// #endregion
