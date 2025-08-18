import dotenv from "dotenv";
import {
  listExampleIdsByDatasetId,
  getExample,
  type Example,
  updateExample,
} from "./helpers.js";

dotenv.config({ path: "./scripts/.env.local" });

export const DATASET_ID = "32fa843d-2ec0-458c-b10e-ed9b2b1174ea" as const;

export type MigrationInput = Example;
export type MigrationOutput = Example;

export async function migrateExample(
  example: MigrationInput,
): Promise<MigrationOutput> {
  const expectedDataProposal = (example as any).outputs.expectedDataProposal
    ? (example as any).outputs.expectedDataProposal.map((proposal) => {
        return {
          ...proposal,
          changeType: "change",
        };
      })
    : undefined;

  return {
    ...example,
    outputs: {
      ...(example.outputs as any),
      expectedDataProposal,
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
