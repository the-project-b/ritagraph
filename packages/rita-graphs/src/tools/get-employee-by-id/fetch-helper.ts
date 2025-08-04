import {
  GetAllPaymentsOfEmployeeQuery,
  GetEmployeeByIdWithExtensiveInfoQuery,
} from "../../generated/graphql";
import { GraphQLClientType } from "../../utils/graphql/client";
import { Result } from "../../utils/types/result";

export async function fetchEmployeeById(
  client: GraphQLClientType,
  companyId: string,
  employeeId: string
): Promise<Result<GetEmployeeByIdWithExtensiveInfoQuery["employee"], Error>> {
  try {
    const { employee } = await client.getEmployeeByIdWithExtensiveInfo({
      data: {
        employeeCompanyId: companyId,
        employeeId,
      },
    });
    // The GraphQL query returns { employees: { employees: [...] } }
    return Result.success(employee);
  } catch (e) {
    return Result.failure(e as Error);
  }
}

export async function fetchPaymentsOfEmployee(
  client: GraphQLClientType,
  companyId: string,
  contracts: GetEmployeeByIdWithExtensiveInfoQuery["employee"]["employeeContract"]
): Promise<Result<GetAllPaymentsOfEmployeeQuery["payments"], Error>> {
  try {
    const { payments } = await client.getAllPaymentsOfEmployee({
      data: {
        companyId,
        contractIds: contracts.map((contract) => contract.id),
      },
    });

    // The GraphQL query returns { employees: { employees: [...] } }
    return Result.success(payments);
  } catch (e) {
    return Result.failure(e as Error);
  }
}
