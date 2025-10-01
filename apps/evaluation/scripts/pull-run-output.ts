#!/usr/bin/env npx tsx

import * as dotenv from "dotenv";
import { Client } from "langsmith";
import { resolve } from "path";

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), "../../.env") });
dotenv.config({ path: resolve(process.cwd(), ".env") });

async function pullRunOutput(runId: string) {
  if (!process.env.LANGSMITH_API_KEY) {
    console.error(
      "❌ Error: LANGSMITH_API_KEY environment variable is not set",
    );
    process.exit(1);
  }

  const client = new Client({
    apiKey: process.env.LANGSMITH_API_KEY,
    apiUrl: process.env.LANGSMITH_ENDPOINT,
  });

  console.log(`\n🔍 Fetching run output for: ${runId}\n`);

  try {
    // Get the run details
    const run = await client.readRun(runId);

    console.log("📊 Run Information:");
    console.log("─".repeat(80));
    console.log(`Name: ${run.name}`);
    console.log(`Status: ${run.status}`);
    console.log(`Start Time: ${run.start_time}`);
    console.log(`End Time: ${run.end_time}`);

    if (run.inputs) {
      console.log("\n📥 Inputs:");
      console.log(JSON.stringify(run.inputs, null, 2));
    }

    if (run.outputs) {
      console.log("\n📤 Outputs:");
      console.log(JSON.stringify(run.outputs, null, 2));

      // Specifically extract dataChangeProposals if present
      if (run.outputs.dataChangeProposals) {
        console.log("\n🎯 Data Change Proposals:");
        console.log("─".repeat(80));
        run.outputs.dataChangeProposals.forEach(
          (proposal: any, index: number) => {
            console.log(`\nProposal ${index + 1}:`);
            console.log(`  Type: ${proposal.changeType}`);
            console.log(`  Field: ${proposal.changedField || "N/A"}`);
            console.log(`  User ID: ${proposal.relatedUserId || "N/A"}`);
            if (proposal.newValue) {
              console.log(`  New Value: ${proposal.newValue}`);
            }

            // Check for date fields in mutation variables
            if (proposal.mutationQuery?.variables) {
              const vars = proposal.mutationQuery.variables;
              if (vars.data?.effectiveDate) {
                console.log(
                  `  ✅ Has effectiveDate: ${vars.data.effectiveDate}`,
                );
              }
              if (vars.data?.personalData?.effectiveFromFields) {
                console.log(`  ✅ Has MDC effectiveFromFields:`);
                console.log(
                  `     ${JSON.stringify(vars.data.personalData.effectiveFromFields)}`,
                );
              }
            }
          },
        );

        // Save to file for easier analysis
        const fs = await import("fs/promises");
        const outputFile = `run-output-${runId}.json`;
        await fs.writeFile(
          outputFile,
          JSON.stringify(run.outputs.dataChangeProposals, null, 2),
          "utf-8",
        );
        console.log(`\n💾 Proposals saved to: ${outputFile}`);
      }
    } else {
      console.log("\n❌ No outputs found in this run");
    }

    if (run.error) {
      console.log("\n❌ Run Error:");
      console.log(run.error);
    }
  } catch (error) {
    console.error("❌ Error fetching run:", error);
    process.exit(1);
  }
}

// Get run ID from command line
const runId = process.argv[2];
if (!runId) {
  console.error("❌ Please provide a run ID as argument");
  console.error("Usage: npx tsx scripts/pull-run-output.ts <run-id>");
  process.exit(1);
}

pullRunOutput(runId).catch(console.error);
