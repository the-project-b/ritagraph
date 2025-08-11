import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { randomUUID as uuid } from "crypto";
import {
  GraphQLClientType,
  createGraphQLClient,
} from "../../utils/graphql/client";
import { ToolContext } from "../tool-factory";
import { Result } from "../../utils/types/result";
import { GetAllEmployeeIdsQuery } from "../../generated/graphql";
import {
  DataRepresentationLayerEntity,
  buildRepresentationString,
} from "../../utils/data-representation-layer";
import { createLogger } from "@the-project-b/logging";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "Tools",
  tool: "get_all_employees",
});

/**
 * Since employees is actually "contracts" the employees will contain the same person multiple times if the person has multiple contracts.
 */
export const getAllEmployees = (
  ctx: ToolContext<{
    addItemToDataRepresentationLayer: (key: string, value: any) => void;
  }>,
) =>
  tool(
    async () => {
      logger.info("[TOOL > get_all_employees]", {
        operation: "get_all_employees",
        companyId: ctx.selectedCompanyId,
      });
      const { addItemToDataRepresentationLayer } = ctx.extendedContext;
      const client = createGraphQLClient(ctx);

      const employeesResult = await getAllEmployeeIds(
        client,
        ctx.selectedCompanyId,
      );

      if (Result.isFailure(employeesResult)) {
        logger.error("Failed to get all employee IDs", {
          error: Result.unwrapFailure(employeesResult),
          companyId: ctx.selectedCompanyId,
        });
        return {
          instructions: `Failed to get all employees. Tool unavailable.`,
        };
      }
      const employees = Result.unwrap(employeesResult);

      const dataRepresentationLayerEntity: DataRepresentationLayerEntity = {
        id: uuid(),
        type: "List",
        entityType: "Employee",
        objectIds: employees.map((i) => i.employeeId),
        preselectedFilters: {},
        omittedFields: [],
      };

      addItemToDataRepresentationLayer(
        dataRepresentationLayerEntity.id,
        dataRepresentationLayerEntity,
      );

      return `
This is the placeholder for all the employees if you place it in the response it will be replaced with the actual list of employees.
Do not change the placeholder in any way.
${buildRepresentationString(dataRepresentationLayerEntity)}
      `;
    },
    {
      name: "get_all_employees",
      description:
        "Returns a placeholder for the list of all active employees with contracts. This placeholder will be replaced later with the properly formatted employee list in the final response.",
      schema: z.object({}),
    },
  );

async function getAllEmployeeIds(
  client: GraphQLClientType,
  companyId: string,
): Promise<Result<GetAllEmployeeIdsQuery["employees"]["employees"], Error>> {
  try {
    const { employees } = await client.getAllEmployeeIds({
      data: {
        companyId,
      },
    });

    return Result.success(employees.employees);
  } catch (error) {
    logger.error("Error fetching all employee IDs", {
      error,
      companyId,
    });
    return Result.failure(error);
  }
}
