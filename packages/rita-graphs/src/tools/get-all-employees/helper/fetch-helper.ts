import {
  GetAllEmployeesQuery,
  EmployeeAdvancedFilterStatus,
} from "../../../generated/graphql";
import { GraphQLClientType } from "../../../utils/graphql/client";
import { Result } from "../../../utils/types/result";

export async function fetchAllEmployees(
  client: GraphQLClientType,
  companyId: string
): Promise<Result<GetAllEmployeesQuery["employees"]["employees"], Error>> {
  try {
    const { employees } = await client.getAllEmployees({
      data: {
        companyId,
        statuses: [EmployeeAdvancedFilterStatus.Active],
      },
    });
    return Result.success(employees.employees);
  } catch (e) {
    return Result.failure(e as Error);
  }
}
