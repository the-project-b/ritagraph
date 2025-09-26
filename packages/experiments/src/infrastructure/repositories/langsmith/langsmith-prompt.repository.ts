import {
  err,
  NotFoundError,
  ok,
  PersistenceError,
  Result,
} from "@the-project-b/types";
import {
  PromptContent,
  PromptFilter,
  PromptInfo,
  PromptRepository,
} from "../../../domain/index.js";
import { LangSmithAdapter } from "../../adapters/langsmith.adapter.js";

/**
 * LangSmith implementation of PromptRepository
 */
export class LangSmithPromptRepository implements PromptRepository {
  constructor(private adapter: LangSmithAdapter) {}

  async list(
    filter?: PromptFilter,
  ): Promise<Result<PromptInfo[], PersistenceError>> {
    try {
      if (!this.adapter.listPrompts) {
        return ok([]);
      }

      const prompts = await this.adapter.listPrompts({
        tags: filter?.tags,
        limit: filter?.limit,
      });

      const promptInfos: PromptInfo[] = prompts.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        isPublic: p.metadata?.isPublic || false,
        owner: p.metadata?.owner || "unknown",
        fullName: p.metadata?.fullName || p.name,
        tags: p.metadata?.tags || [],
        updatedAt: p.metadata?.updatedAt
          ? new Date(p.metadata.updatedAt)
          : new Date(),
        metadata: p.metadata,
      }));

      return ok(promptInfos);
    } catch (error) {
      return err(
        new PersistenceError(
          `Failed to list prompts: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
    }
  }

  async pull(name: string): Promise<Result<PromptContent, NotFoundError>> {
    try {
      if (!this.adapter.pullPrompt) {
        return err(new NotFoundError("Prompt", name));
      }

      const prompt = await this.adapter.pullPrompt(name);

      if (!prompt) {
        return err(new NotFoundError("Prompt", name));
      }

      const content: PromptContent = {
        id: prompt.id,
        name: prompt.name,
        template: prompt.template,
        variables: prompt.variables,
        metadata: prompt.metadata,
      };

      return ok(content);
    } catch (error) {
      return err(
        new NotFoundError("Prompt", name, {
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }
  }

  async convertToText(
    promptData: any,
  ): Promise<Result<string, PersistenceError>> {
    try {
      // Simple conversion logic
      if (typeof promptData === "string") {
        return ok(promptData);
      }

      if (promptData?.template) {
        return ok(promptData.template);
      }

      if (Array.isArray(promptData)) {
        return ok(promptData.map((p) => p.content || p.text || "").join("\n"));
      }

      return ok(JSON.stringify(promptData, null, 2));
    } catch (error) {
      return err(
        new PersistenceError(
          `Failed to convert prompt to text: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
    }
  }

  async save(prompt: PromptContent): Promise<Result<void, PersistenceError>> {
    // LangSmith doesn't support creating prompts through the client library
    return err(
      new PersistenceError(
        "Creating prompts is not supported through LangSmith adapter",
      ),
    );
  }

  async delete(name: string): Promise<Result<void, PersistenceError>> {
    // LangSmith doesn't support deleting prompts through the client library
    return err(
      new PersistenceError(
        "Deleting prompts is not supported through LangSmith adapter",
      ),
    );
  }
}
