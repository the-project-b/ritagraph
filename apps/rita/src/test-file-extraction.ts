#!/usr/bin/env node
/* eslint-disable no-console */

import { createLogger, normalizeError } from "@the-project-b/logging";
import { writeFileSync } from "fs";
import { GraphQLClient } from "graphql-request";
import { join } from "path";
import prompts from "prompts";
import { createFileExtractionGraph } from "@the-project-b/rita-graphs";
import { getAuthUser } from "./security/auth.js";

const logger = createLogger({ service: "file-extraction-test" });

async function login(email: string, password: string): Promise<string> {
  const endpoint = process.env.PROJECTB_GRAPHQL_ENDPOINT;
  if (!endpoint) {
    throw new Error(
      "PROJECTB_GRAPHQL_ENDPOINT environment variable is not set",
    );
  }

  logger.info("Logging in...", { email });

  let authToken: string | null = null;

  const url = new URL(endpoint);
  const origin = `${url.protocol}//${url.host}`;

  const client = new GraphQLClient(endpoint, {
    headers: {
      Origin: origin,
      Referer: `${origin}/auth/login`,
    },
    responseMiddleware: (response) => {
      if (response && typeof response === "object" && "headers" in response) {
        const headers = response.headers as Headers;
        const setCookie = headers.get("set-cookie");

        if (setCookie) {
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

async function runGraphExtraction(
  attachmentIds: string[],
  authToken: string,
  selectedCompanyId: string,
  preferredLanguage: "EN" | "DE",
) {
  logger.info("Initializing graph...", {
    attachmentCount: attachmentIds.length,
    companyId: selectedCompanyId,
    language: preferredLanguage,
  });

  const mockConfig = {
    configurable: {
      langgraph_auth_user: {
        token: authToken,
        appdataHeader: undefined,
      },
      thread_id: `test-${Date.now()}`,
      backupAccessToken: authToken,
      backupCompanyId: selectedCompanyId,
    },
  };

  const graph = await createFileExtractionGraph(getAuthUser)();

  logger.info("Invoking graph...");

  const result = await graph.invoke(
    {
      attachmentIds,
      selectedCompanyId,
      preferredLanguage,
    },
    mockConfig,
  );

  logger.info("Graph execution completed");

  return result;
}

async function main() {
  console.log("\n📄 File Extraction Graph Test\n");
  console.log("Starting main function...");

  const args = process.argv.slice(2);
  console.log("Args parsed:", args);
  let attachmentIds = args[0] ? [args[0]] : undefined;
  let authToken = args[1];
  let selectedCompanyId = args[2];
  let preferredLanguage: "EN" | "DE" = "EN";

  if (!attachmentIds || !authToken || !selectedCompanyId) {
    console.log(
      "Interactive mode - please provide the following information:\n",
    );

    if (!attachmentIds) {
      const attachmentResponse = await prompts({
        type: "text",
        name: "attachmentIds",
        message: "Enter attachment IDs (comma-separated):",
        validate: (value) =>
          value.trim() ? true : "At least one attachment ID is required",
      });

      if (!attachmentResponse.attachmentIds) {
        console.log("\n❌ Cancelled");
        process.exit(0);
      }

      attachmentIds = attachmentResponse.attachmentIds
        .split(",")
        .map((id: string) => id.trim());
    }

    if (!selectedCompanyId) {
      const companyResponse = await prompts({
        type: "text",
        name: "companyId",
        message: "Enter company ID:",
        validate: (value) => (value.trim() ? true : "Company ID is required"),
      });

      if (!companyResponse.companyId) {
        console.log("\n❌ Cancelled");
        process.exit(0);
      }

      selectedCompanyId = companyResponse.companyId;
    }

    const languageResponse = await prompts({
      type: "select",
      name: "language",
      message: "Select preferred language:",
      choices: [
        { title: "English", value: "EN" },
        { title: "German", value: "DE" },
      ],
      initial: 0,
    });

    if (languageResponse.language) {
      preferredLanguage = languageResponse.language;
    }

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

  try {
    console.log("\n🔄 Starting graph execution...\n");
    const result = await runGraphExtraction(
      attachmentIds!,
      authToken!,
      selectedCompanyId!,
      preferredLanguage,
    );

    console.log("\n✅ Graph execution completed successfully!\n");

    console.log("=== Formatted Output ===\n");
    console.log(result.formattedOutput || "No formatted output");
    console.log("\n");

    const filename = `graph-extraction-${Date.now()}.json`;
    const outputPath = join(process.cwd(), filename);
    writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");

    console.log(`📄 Full results saved to: ${outputPath}\n`);

    if (result.extractionResults && result.extractionResults.length > 0) {
      console.log(
        `✅ Successfully extracted ${result.extractionResults.length} file(s)`,
      );
    }
    if (result.failedAttachments && result.failedAttachments.length > 0) {
      console.log(
        `⚠️  ${result.failedAttachments.length} file(s) failed extraction`,
      );
    }
    if (result.totalCost) {
      console.log(
        `💰 Total cost: $${result.totalCost.estimatedCostUSD.toFixed(4)} USD`,
      );
    }
    console.log("");
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
