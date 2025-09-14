import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ToolFactoryToolDefintion } from "../../../../tool-factory";
import { createLogger } from "@the-project-b/logging";
import healthInsurancesData from "../../healthInsurancesData";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "Tools",
  tool: "find-insurance-company-code-by-name",
});

export const findInsuranceCompanyCodeByName: ToolFactoryToolDefintion = () =>
  tool(
    async (params, config) => {
      const { nameParts } = params as { nameParts: Array<string> };
      const { thread_id, run_id } = config.configurable;

      logger.info("[TOOL > find-insurance-company-code-by-name]", {
        threadId: thread_id,
        runId: run_id,
        nameParts,
      });

      return {
        instructions: `Use the code from the insuranceCompanies in the change insurance tool.`,
        insuranceCompanies: findMostLikelyInsuranceCompany(nameParts),
      };
    },
    {
      name: "find-insurance-company-code-by-name",
      description:
        "This tool gives you the insurance company code for a given insurance company name.",
      schema: z.object({
        nameParts: z
          .array(z.string())
          .describe(
            "Parts of the name of the insurance company e.g. [DAK, Hamburg]",
          ),
      }),
    },
  );

/**
 * Using hamming distance (between name parts) to find the most likely match
 * Later we should likely split the text into small pieces and use levenshtein distance
 */
function findMostLikelyInsuranceCompany(nameParts: Array<string>): Array<{
  insuranceCompanyCode: string;
  insuranceCompanyName: string;
}> {
  const insuranceCompanies = healthInsurancesData;
  const filteredInsuranceCompanies = insuranceCompanies
    .filter((insuranceCompany) =>
      nameParts.some((namePart) =>
        insuranceCompany.label.toLowerCase().includes(namePart.toLowerCase()),
      ),
    )
    .map((insuranceCompany) => ({
      name: insuranceCompany.label,
      code: insuranceCompany.code,
    }));

  // Count the number of name parts that are a match for an order
  const matchesOnResult: Array<[number, { name: string; code: string }]> =
    filteredInsuranceCompanies.map((insuranceCompany) => {
      const numberOfMatches = nameParts.filter((namePart) =>
        insuranceCompany.name.toLowerCase().includes(namePart.toLowerCase()),
      ).length;

      return [numberOfMatches, insuranceCompany] as const;
    });

  // Sort the results by the number of matches
  const sortedMatchesOnResult = matchesOnResult.sort((a, b) => b[0] - a[0]);

  // Return the top 3 results
  return sortedMatchesOnResult.slice(0, 6).map(([_, insuranceCompany]) => {
    // Mapping for better prompt engineering
    return {
      insuranceCompanyCode: insuranceCompany.code,
      insuranceCompanyName: insuranceCompany.name,
    };
  });
}
