import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createGraphQLClient } from "../../../../../utils/graphql/client";
import { ToolFactoryToolDefintion } from "../../../../tool-factory";
import { DataChangeProposal } from "../../../../../graphs/shared-types/base-annotation";
import { randomUUID as uuid } from "crypto";
import { Result } from "../../../../../utils/types/result";
import { createLogger } from "@the-project-b/logging";
import { appendDataChangeProposalsAsThreadItems } from "../../../../../utils/append-message-as-thread-item";
import { getEmployee, updateEmployee } from "../../queries-defintions";
import { GetDetailedEmployeeInfoByEmployeeIdQuery } from "../../../../../generated/graphql";
import healthInsurancesData from "../../healthInsurancesData";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "Tools",
  tool: "change_employee_insurance",
});

function prefixedLog(message: string, data?: any) {
  logger.debug(message, data);
}

export const changeEmployeeInsurance: ToolFactoryToolDefintion = (ctx) =>
  tool(
    async (params, config) => {
      const { employeeId, quote, insuranceDetails } = params;
      const { insuranceCompanyCode } = insuranceDetails;
      const { selectedCompanyId } = ctx;
      const { thread_id, run_id } = config.configurable;

      logger.info("[TOOL > change_employee_insurance]", {
        operation: "change_payment_details",
        threadId: thread_id,
        employeeId,
        companyId: selectedCompanyId,
      });

      const client = createGraphQLClient(ctx);

      // 1) Pull the employee
      const { employee } = await client.getDetailedEmployeeInfoByEmployeeId({
        data: {
          employeeId,
          employeeCompanyId: selectedCompanyId,
        },
      });

      // 2) Arrange the default data for the proposal
      const buildBaseDataChangeProps = (changeDescription: string) => ({
        id: uuid(),
        changeType: "change" as const,
        relatedUserId: employeeId,
        description: `Change details for ${employee.firstName} ${employee.lastName}, ${changeDescription}`,
        status: "pending" as "approved" | "pending" | "rejected",
        createdAt: new Date().toISOString(),
        quote,
        runId: run_id,
        iteration: 1, // Initial iteration for new proposals
      });

      const newProposals: Array<DataChangeProposal> = [];

      if (
        insuranceCompanyCode &&
        insuranceCompanyCode !==
          employee.employeePersonalData[0].resolvedHealthInsurance?.code
      ) {
        const employeeChangeDescription = formatEmployeeChange(
          "healthInsurance",
          healthInsuranceByCode(
            employee.employeePersonalData[0].resolvedHealthInsurance?.code,
          )?.label ?? "Not yet defined",
          healthInsuranceByCode(insuranceCompanyCode)?.label,
        );

        const dataChangeProposal: DataChangeProposal = {
          ...buildBaseDataChangeProps(employeeChangeDescription),
          statusQuoQuery: getEmployee(
            { employeeId: employee.id, employeeCompanyId: selectedCompanyId },
            "employee.employeePersonalData.0.healthInsurance",
          ),
          mutationQuery: updateEmployee(
            {
              companyId: selectedCompanyId,
              userId: employee.id,
              personalData: { healthInsurance: insuranceCompanyCode },
            },
            "employee.healthInsurance",
            {
              "employee.healthInsurance": "data.personalData.healthInsurance",
            },
          ),
          changedField: "employee.healthInsurance",
          newValue: insuranceCompanyCode,
        };
        newProposals.push(dataChangeProposal);
      }

      const redundantChanges = determineAndExplainRedundantChanges(
        insuranceDetails,
        employee,
      );

      const appendDataChangeProposalsAsThreadItemsResult =
        await appendDataChangeProposalsAsThreadItems({
          dataChangeProposals: newProposals,
          langgraphThreadId: thread_id,
          context: ctx,
        });

      if (Result.isFailure(appendDataChangeProposalsAsThreadItemsResult)) {
        return {
          error: "Failed to create thread items - tool call unavailable.",
        };
      }

      const newProposalDbUpdateResults = Result.unwrap(
        appendDataChangeProposalsAsThreadItemsResult,
      );

      // TODO: Remove this once we have a way to handle failed thread items
      if (newProposalDbUpdateResults.some(Result.isFailure)) {
        const failedThreadItems = newProposalDbUpdateResults.filter(
          Result.isFailure,
        );

        const issues = failedThreadItems
          .map((item) => Result.unwrapFailure(item))
          .join("\n");

        logger.error(
          "Failed to create thread items for the data change proposals",
          {
            threadId: thread_id,
            issues,
            employeeId,
            companyId: selectedCompanyId,
          },
        );

        return {
          error: "Failed to create thread items for the data change proposals.",
        };
      }

      prefixedLog("dataChangeProposals", newProposals);

      return {
        instructions: `
These are the pending data change proposals. You can use them to approve the based on the confirmation of the user.
${redundantChanges}
`,
        dataChangeProposals: newProposals.map((proposal) => ({
          id: proposal.id,
          description: proposal.description,
        })),
      };
    },
    {
      name: "change_employee_insurance",
      description:
        "Change insurance details about the employee. This includes insurance type, insurance company, insurance policy number, etc. ONLY CHANGE THE ONES MENTIONED IN THE REQUEST.",
      schema: z.object({
        employeeId: z.string(),
        quote: z
          .string()
          .describe(
            "Quoted phrase from the user mentioning the change. Please use the sanitize_quote_for_proposal tool to refine the quote.",
          ),
        insuranceDetails: z.object({
          insuranceCompanyCode: z.string(),
        }),
      }),
    },
  );

// MARK: - Helper functions

function formatEmployeeChange(
  fieldName: string,
  previousValue: string,
  newValue: string,
) {
  return `Change ${fieldName} from ${previousValue} to ${newValue}`;
}

function healthInsuranceByCode(code: string) {
  return healthInsurancesData.find((insurance) => insurance.code === code);
}

function determineAndExplainRedundantChanges(
  params: Record<string, any>,
  employee: GetDetailedEmployeeInfoByEmployeeIdQuery["employee"],
) {
  const textToReturn: Array<string> = [];

  for (const [key, value] of Object.entries(params)) {
    if (value && value === employee[key]) {
      textToReturn.push(
        `The new ${key}  already has the value ${value}. They do not need to be changed. Please communicate this to the user.`,
      );
    }
  }

  return textToReturn.join("\n");
}
