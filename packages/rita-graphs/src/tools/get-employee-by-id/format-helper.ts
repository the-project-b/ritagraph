import {
  GetAllPaymentsOfEmployeeQuery,
  GetEmployeeByIdWithExtensiveInfoQuery,
} from "../../generated/graphql";

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

export function extractPaymentInformation(
  payments: GetAllPaymentsOfEmployeeQuery["payments"]
) {
  const paymentsMappedToReducedInfo = payments.map((payment) => {
    return {
      id: payment.id,
      contractId: payment.contractId,
      typeName: payment.typeName,
      typeTranslationKey: payment.typeTranslationKey,
      frequency: payment.frequency,
      paymentType: payment.paymentType,
      properties: payment.properties,
    };
  });

  const resultTemplate = `
  ${paymentsMappedToReducedInfo
    .map(
      (payment) => `
    - Contract ID: ${payment.contractId}
    - Type Name: ${payment.typeName}
    - Type Translation Key: ${payment.typeTranslationKey}
    - Frequency: ${payment.frequency}
    - Payment Type: ${JSON.stringify(payment.paymentType)}
    - Properties: ${JSON.stringify(payment.properties)}
    `
    )
    .join("\n")}
  `;

  return resultTemplate;
}
