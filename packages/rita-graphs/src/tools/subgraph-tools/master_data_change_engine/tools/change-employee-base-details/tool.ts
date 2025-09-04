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

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "Tools",
  tool: "change_employee_base_details",
});

function prefixedLog(message: string, data?: any) {
  logger.debug(message, data);
}

export const changeEmployeeBaseDetails: ToolFactoryToolDefintion = (ctx) =>
  tool(
    async (params, config) => {
      const { employeeId, quote, employeeDetails } = params;
      const { firstName, lastName, birthName } = employeeDetails;
      const { selectedCompanyId } = ctx;
      const { thread_id, run_id } = config.configurable;

      logger.info("[TOOL > change_employee_base_details]", {
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

      // For each field that is provided, create a proposal
      if (firstName && firstName !== employee.firstName) {
        const dataChangeProposal: DataChangeProposal = {
          ...buildBaseDataChangeProps(
            formatEmployeeChange("firstName", employee.firstName, firstName),
          ),
          statusQuoQuery: getEmployee(
            { employeeId: employee.id, employeeCompanyId: selectedCompanyId },
            "employee.firstName",
          ),
          mutationQuery: updateEmployee(
            {
              companyId: selectedCompanyId,
              userId: employee.id,
              personalData: {
                firstName,
              },
            },
            "employee.firstName",
            {
              "employee.firstName": "data.personalData.firstName",
            },
          ),
          changedField: "employee.firstName",
          newValue: firstName,
        };
        newProposals.push(dataChangeProposal);
      }

      if (lastName && lastName !== employee.lastName) {
        const dataChangeProposal: DataChangeProposal = {
          ...buildBaseDataChangeProps(
            formatEmployeeChange("lastName", employee.lastName, lastName),
          ),
          statusQuoQuery: getEmployee(
            { employeeId: employee.id, employeeCompanyId: selectedCompanyId },
            "employee.lastName",
          ),
          mutationQuery: updateEmployee(
            {
              companyId: selectedCompanyId,
              userId: employee.id,
              personalData: {
                lastName,
              },
            },
            "employee.lastName",
            {
              "employee.lastName": "data.personalData.lastName",
            },
          ),
          changedField: "employee.lastName",
          newValue: lastName,
        };
        newProposals.push(dataChangeProposal);
      }

      if (
        birthName &&
        birthName !== employee.employeePersonalData[0].birthName
      ) {
        const dataChangeProposal: DataChangeProposal = {
          ...buildBaseDataChangeProps(
            formatEmployeeChange(
              "birthName",
              employee.employeePersonalData[0].birthName,
              birthName,
            ),
          ),
          statusQuoQuery: getEmployee(
            { employeeId: employee.id, employeeCompanyId: selectedCompanyId },
            "employee.personalData.0.birthName",
          ),
          mutationQuery: updateEmployee(
            {
              companyId: selectedCompanyId,
              userId: employee.id,
              personalData: { birthName },
            },
            "employee.birthName",
            {
              "employee.birthName": "data.personalData.birthName",
            },
          ),
          changedField: "employee.birthName",
          newValue: birthName,
        };
        newProposals.push(dataChangeProposal);
      }

      const redundantChanges = determineAndExplainRedundantChanges(
        employeeDetails,
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
      name: "change_employee_master_data",
      description:
        "Change base details about the employee. This includes name, email, address, phone number, etc. ONLY CHANGE THE ONES MENTIONED IN THE REQUEST.",
      schema: z.object({
        employeeId: z.string(),
        quote: z
          .string()
          .describe(
            "Quoted phrase from the user mentioning the change. Please use the sanitize_quote_for_proposal tool to refine the quote.",
          ),
        employeeDetails: z.object({
          firstName: z.string(),
          lastName: z.string(),
          birthName: z.string(),
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
