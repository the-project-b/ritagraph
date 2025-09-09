// #region Domain Exports
// Entities
export { Prompt } from "./domain/entities/prompt.entity.js";
export type {
  CreatePromptParams,
  FormattedPrompt,
} from "./domain/entities/prompt.entity.js";

// Value Objects
export { LanguageCode } from "./domain/value-objects/language-code.value-object.js";
export { PromptId } from "./domain/value-objects/prompt-id.value-object.js";
export {
  PromptCategory,
  PromptMetadata,
} from "./domain/value-objects/prompt-metadata.value-object.js";
export { PromptTemplate } from "./domain/value-objects/prompt-template.value-object.js";
export { PromptVariables } from "./domain/value-objects/prompt-variables.value-object.js";
export type { VariableDefinition } from "./domain/value-objects/prompt-variables.value-object.js";

// Services
export { PromptFormatterService } from "./domain/services/prompt-formatter.service.js";
export type { FormattingResult } from "./domain/services/prompt-formatter.service.js";

// Repositories
export type {
  PromptFilter,
  PromptRepository,
} from "./domain/repositories/prompt.repository.js";
// #endregion

// #region Application Exports
// Use Cases
export { CreateChatPromptUseCase } from "./application/use-cases/create-chat-prompt.use-case.js";
export { FormatSimplePromptUseCase } from "./application/use-cases/format-simple-prompt.use-case.js";

// DTOs
export type {
  ChatMessage,
  ChatPromptConfig,
  ChatPromptResponse,
  CreateChatPromptParams,
  FormatChatMessagesParams,
  MessageRole,
  MessageSpec,
} from "./application/dto/chat-prompt.dto.js";
export type {
  FormatSimplePromptParams,
  FormattedPromptResponse,
  FormatWithTruncationParams,
} from "./application/dto/format-prompt.dto.js";
export type {
  RawPromptResponse,
  GetRawPromptParams,
} from "./application/dto/raw-prompt.dto.js";

// Services
export { PromptRegistryService } from "./application/services/prompt-registry.service.js";
export { PromptService } from "./application/services/prompt.service.js";
export type {
  FormatPromptParams,
  PromptServiceConfig,
  PromptSource,
  RegisterPromptParams,
} from "./application/services/prompt.service.js";
// #endregion

// #region Infrastructure Exports
// Adapters
export { LangChainChatAdapter } from "./infrastructure/adapters/langchain-chat.adapter.js";
export type {
  LangChainCompatibleChatPrompt,
  LangChainMessage,
} from "./infrastructure/adapters/langchain-chat.adapter.js";
export { LangChainPromptAdapter } from "./infrastructure/adapters/langchain-prompt.adapter.js";
export type { LangChainCompatiblePrompt } from "./infrastructure/adapters/langchain-prompt.adapter.js";

// Factories
export {
  MessageBuilder,
  MessageFactory,
} from "./infrastructure/factories/message.factory.js";

// Repositories
export { InMemoryPromptRepository } from "./infrastructure/repositories/in-memory-prompt.repository.js";
export { LangSmithPromptRepository } from "./infrastructure/repositories/langsmith-prompt.repository.js";

// Clients
export { LangSmithClientAdapter } from "./infrastructure/clients/langsmith-client.adapter.js";
export type {
  LangSmithClient,
  LangSmithConfig,
  LangSmithMessage,
  LangSmithPrompt,
  LangSmithPullOptions,
} from "./infrastructure/clients/langsmith-client.types.js";
// #endregion

// #region Shared Exports
// Result Pattern
export { Result } from "./shared/types/result.js";
export type { Failure, Success } from "./shared/types/result.js";

// Errors
export {
  DomainError,
  FormatError,
  LanguageNotSupportedError,
  NotFoundError,
  PersistenceError,
  PromptCreationError,
  ValidationError,
} from "./shared/errors/domain.errors.js";
// #endregion
