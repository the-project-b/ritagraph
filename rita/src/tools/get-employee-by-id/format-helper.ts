import { GetEmployeeByIdWithExtensiveInfoQuery } from "../../generated/graphql";

export function extractContractInformation(
  employeeData: GetEmployeeByIdWithExtensiveInfoQuery["employee"]
) {
  // Singular but actually is an array
  const contracts = employeeData.employeeContract;

  const contractsMappedToReducedInfo = contracts.map((contract) => {
    return {
      id: contract.id,
      start: contract.contractStart,
      end: contract.contractEnd,
      trialPeriod: contract.trialPeriod,
      trialPeriodEnd: contract.trialPeriodEnd,
      vacationDays: contract.contractVacationDays,
      remainingVacationDays: contract.remainingVacationDays,
      contractType: contract.contractType,
      paymentType: contract.paymentType,
    };
  });

  const resultTemplate = `
  ${employeeData.firstName} ${
    employeeData.lastName
  } has the following contracts:
  ${contractsMappedToReducedInfo
    .map(
      (contract) => `
    - ${contract.start} to ${contract.end}
    - ${contract.trialPeriod} days trial period
    - ${contract.vacationDays} vacation days
    - ${contract.remainingVacationDays} remaining vacation days
    - ${contract.contractType} contract type
    - ${contract.paymentType} payment type
  `
    )
    .join("\n")}
  `;

  return resultTemplate;
}
