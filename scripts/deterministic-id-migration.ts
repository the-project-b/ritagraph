import dotenv from "dotenv";
import {
  listExampleIdsByDatasetId,
  getExample,
  type Example,
  updateExample,
  deterministicCuid,
} from "./helpers.js";

dotenv.config({ path: "./scripts/.env.local" });

// 32fa843d-2ec0-458c-b10e-ed9b2b1174ea -> Actual [dev] dataset
// 5f2dcd62-c1d1-4e92-9c7c-60b7de91e8f6 -> Andries PRIVATE
export const DATASET_ID = "32fa843d-2ec0-458c-b10e-ed9b2b1174ea" as const;

const EXAMPLE_ID_PATHS: string[] = [
  "relatedUserId",
  "mutationVariables.data.id", // Payment ID | Contract ID (if changeField === payment.monthlyHours)
  "mutationVariables.data.companyId",
  "mutationVariables.data.contractId",
];

export type MigrationInput = Example;
export type MigrationOutput = Example;

export async function migrateExample(
  example: MigrationInput,
): Promise<MigrationOutput> {
  // Check if expectedDataProposal exists
  const outputs = (example as any).outputs;
  if (!outputs?.expectedDataProposal) {
    return example;
  }

  const newExpectedDataProposal = outputs.expectedDataProposal.map(
    ({ ...proposal }: any) => {
      // Create a deep copy of the proposal to avoid mutations
      const updatedProposal = { ...proposal };

      // Process each path in EXAMPLE_ID_PATHS
      for (const path of EXAMPLE_ID_PATHS) {
        const pathParts = path.split(".");

        let current = updatedProposal;
        let parent = null;
        let lastKey: string = "";

        let pathExists = true;
        for (let i = 0; i < pathParts.length; i++) {
          const key = pathParts[i];
          if (current && typeof current === "object" && key in current) {
            parent = current;
            lastKey = key;
            current = current[key];
          } else {
            pathExists = false;
            break;
          }
        }

        if (pathExists && current && typeof current === "string") {
          parent[lastKey] = deterministicCuid({ seed: current });
        }
      }

      return updatedProposal;
    },
  );

  return {
    ...example,
    outputs: {
      ...(example.outputs as any),
      expectedDataProposal: newExpectedDataProposal,
    },
  } as MigrationOutput;
}

async function main(): Promise<void> {
  const apiKey = process.env.LANGSMITH_API_KEY;
  if (!apiKey) {
    console.warn(
      "Set LANGSMITH_API_KEY in your environment/.env before running.",
    );
  }

  // Load all example IDs for the configured dataset
  const exampleIds = await listExampleIdsByDatasetId(DATASET_ID);
  // eslint-disable-next-line no-console
  console.log(`Found ${exampleIds.length} examples in dataset "${DATASET_ID}"`);

  for (const exampleId of exampleIds) {
    const original = await getExample(exampleId);
    const _migrated = await migrateExample(original);

    updateExample(exampleId, _migrated);
    //console.log(JSON.stringify(_migrated, null, 2));

    // eslint-disable-next-line no-console
    console.log(`Updated example: ${exampleId}`);
  }
}

void main();

// The following imports are used by migrate scripts if needed and re-exported from helpers:
export {};
