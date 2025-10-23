#!/usr/bin/env node
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { createLogger, normalizeError } from "@the-project-b/logging";
import { isErr } from "@the-project-b/types";
import dotenv from "dotenv";
import { writeFileSync } from "fs";
import { GraphQLClient } from "graphql-request";
import { join } from "path";
import prompts from "prompts";
import { ExtractAttachmentsUseCase } from "../application/use-cases/ExtractAttachments.use-case.js";
import { S3Client } from "../infrastructure/clients/S3Client.js";
import { ExtractionAdapterFactory } from "../infrastructure/factories/ExtractionAdapterFactory.js";
import { S3DocumentStorageRepository } from "../infrastructure/repositories/S3DocumentStorageRepository.js";

// Load environment variables
dotenv.config();

const logger = createLogger({ service: "file-extraction-cli" });

async function login(email: string, password: string): Promise<string> {
  const endpoint = process.env.PROJECTB_GRAPHQL_ENDPOINT;
  if (!endpoint) {
    throw new Error(
      "PROJECTB_GRAPHQL_ENDPOINT environment variable is not set",
    );
  }

  logger.info("Logging in...", { email });

  let authToken: string | null = null;

  // Parse endpoint to get origin for CORS headers
  const url = new URL(endpoint);
  const origin = `${url.protocol}//${url.host}`;

  const client = new GraphQLClient(endpoint, {
    headers: {
      Origin: origin,
      Referer: `${origin}/auth/login`,
    },
    responseMiddleware: (response) => {
      // Extract access token from Set-Cookie header
      if (response && typeof response === "object" && "headers" in response) {
        const headers = response.headers as Headers;
        const setCookie = headers.get("set-cookie");

        if (setCookie) {
          // Parse accessToken from Set-Cookie header (note: accessToken, not access_token)
          const accessTokenMatch = setCookie.match(/accessToken=([^;]+)/);
          if (accessTokenMatch) {
            authToken = accessTokenMatch[1];
          }
        }
      }
    },
  });

  try {
    await client.request(
      `query Login($data: LoginInput!) { login(data: $data) }`,
      {
        data: {
          email,
          password,
        },
      },
    );

    if (!authToken) {
      throw new Error("No authentication token found in Set-Cookie header");
    }

    logger.info("Login successful");
    return authToken;
  } catch (error) {
    const { error: normalizedError, message } = normalizeError(error);
    logger.error("Login failed", normalizedError);
    throw new Error(`Login failed: ${message}`);
  }
}

async function runExtraction(attachmentIds: string[], authToken: string) {
  const graphqlEndpoint = process.env.PROJECTB_GRAPHQL_ENDPOINT;
  if (!graphqlEndpoint) {
    throw new Error(
      "PROJECTB_GRAPHQL_ENDPOINT environment variable is not set",
    );
  }

  logger.info("Initializing extraction...", {
    attachmentCount: attachmentIds.length,
  });

  const region = process.env.AWS_REGION || "eu-central-1";

  // Initialize S3 client and repository
  const s3Client = new S3Client(region);
  const documentStorageRepository = new S3DocumentStorageRepository(
    s3Client,
    process.env.AWS_S3_EMAIL_ATTACHMENTS_BUCKET_NAME ||
      process.env.AWS_S3_FILES_BUCKET_NAME!,
  );

  // Create extraction adapter (factory creates its own clients internally)
  const extractionAdapter = ExtractionAdapterFactory.create({
    type: "textract",
    region,
  });

  // Create use case
  const useCase = new ExtractAttachmentsUseCase(
    graphqlEndpoint,
    documentStorageRepository,
    extractionAdapter,
  );

  // Execute extraction
  const result = await useCase.execute({
    attachmentIds,
    authToken,
    companyId: "cli-extraction", // Not used for now
    userId: "cli-user", // Not used for now
  });

  if (isErr(result)) {
    logger.error("Extraction failed", result.error);
    throw new Error(`Extraction failed: ${result.error.message}`);
  }

  logger.info("Extraction completed successfully", {
    resultCount: result.value.length,
  });

  return result.value;
}

async function main() {
  console.log("\n📄 File Extraction CLI\n");

  // Get command line arguments
  const args = process.argv.slice(2);
  let attachmentId = args[0];
  let authToken = args[1];

  // Interactive mode if arguments not provided
  if (!attachmentId || !authToken) {
    console.log(
      "Interactive mode - please provide the following information:\n",
    );

    // Prompt for attachment ID
    if (!attachmentId) {
      const attachmentResponse = await prompts({
        type: "text",
        name: "attachmentId",
        message: "Enter attachment ID:",
        validate: (value) =>
          value.trim() ? true : "Attachment ID is required",
      });

      if (!attachmentResponse.attachmentId) {
        console.log("\n❌ Cancelled");
        process.exit(0);
      }

      attachmentId = attachmentResponse.attachmentId;
    }

    // Prompt for authentication
    if (!authToken) {
      const authChoice = await prompts({
        type: "select",
        name: "authMethod",
        message: "How would you like to authenticate?",
        choices: [
          { title: "Login with email & password", value: "login" },
          { title: "Provide OAuth token directly", value: "token" },
        ],
      });

      if (!authChoice.authMethod) {
        console.log("\n❌ Cancelled");
        process.exit(0);
      }

      if (authChoice.authMethod === "login") {
        const credentials = await prompts([
          {
            type: "text",
            name: "email",
            message: "Email:",
            validate: (value) =>
              value.includes("@") ? true : "Valid email is required",
          },
          {
            type: "password",
            name: "password",
            message: "Password:",
            validate: (value) => (value.trim() ? true : "Password is required"),
          },
        ]);

        if (!credentials.email || !credentials.password) {
          console.log("\n❌ Cancelled");
          process.exit(0);
        }

        try {
          authToken = await login(credentials.email, credentials.password);
          console.log("\n✅ Login successful\n");
        } catch (error) {
          const { message } = normalizeError(error);
          console.error(`\n❌ ${message}\n`);
          process.exit(1);
        }
      } else {
        const tokenResponse = await prompts({
          type: "password",
          name: "token",
          message: "OAuth token:",
          validate: (value) => (value.trim() ? true : "Token is required"),
        });

        if (!tokenResponse.token) {
          console.log("\n❌ Cancelled");
          process.exit(0);
        }

        authToken = tokenResponse.token;
      }
    }
  }

  // Run extraction
  try {
    console.log("\n🔄 Starting extraction...\n");
    const results = await runExtraction([attachmentId!], authToken!);

    console.log("\n✅ Extraction completed successfully!\n");

    // Save results to JSON file
    const filename = `extraction-${attachmentId}-${Date.now()}.json`;
    const outputPath = join(process.cwd(), filename);
    writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf-8");

    console.log(`📄 Results saved to: ${outputPath}\n`);
  } catch (error) {
    const { message } = normalizeError(error);
    console.error(`\n❌ ${message}\n`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
