import { gql } from "graphql-request";
import { QueryDefinition } from "../../../utils/types/query-defintion";
import {
  GetEmployeeInput,
  UpdateEmployeeInput,
} from "../../../generated/graphql";
import { ChangedField } from "../../../graphs/shared-types/base-annotation";

export const getEmployee: (
  data: GetEmployeeInput,
  propertyPath: string,
) => QueryDefinition = (data, propertyPath) => ({
  queryId: "employee.get",
  query: gql`
    query Employee($data: GetEmployeeInput!) {
      employee(data: $data) {
        createdAt
        email
        id
        managerId
        role
        updatedAt
        preferredLanguage
        firstName
        lastName
        status
        canForceEmailChange
        company {
          id
          customId
          name
          __typename
        }
        lastInviteLink {
          ...LinkFields
          __typename
        }
        missingFieldsBPO {
          ...EmployeePossibleMissingDataFields
          __typename
        }
        missingFieldsHR {
          ...EmployeePossibleMissingDataFields
          __typename
        }
        missingFieldsEmployee {
          ...EmployeePossibleMissingDataFields
          __typename
        }
        employeeContract {
          ...EmployeeContractFields
          indicators {
            hasUnvalidatedChanges
            isBpoConfirmed
            __typename
          }
          __typename
        }
        employeePersonalData {
          ...EmployeePersonalDataFields
          __typename
        }
        __typename
      }
    }

    fragment LinkFields on Link {
      createdAt
      updatedAt
      id
      type
      creatorId
      receiverId
      openedAt
      expiryAt
      isOneTime
      revokedAt
      contractId
      __typename
    }

    fragment EmployeePossibleMissingDataFields on EmployeePossibleMissingDataFields {
      contractMissingFields
      personalDataMissingFields
      userMissingFields
      __typename
    }

    fragment EmployeeContractFields on EmployeeContract {
      id
      userId
      companyId
      statusView {
        status
        __typename
      }
      contractStart
      contractEnd
      trialPeriod
      trialPeriodEnd
      contractVacationDays
      remainingVacationDays
      contractWorkingTimes {
        MONDAY
        TUESDAY
        WEDNESDAY
        THURSDAY
        FRIDAY
        SATURDAY
        SUNDAY
        __typename
      }
      contractType
      apprenticeshipStart
      apprenticeshipEnd
      apprenticeshipType
      internshipType
      jobTitle
      activityCode
      activityId
      resolvedActivityId {
        code
        id
        label
        labelEN
        __typename
      }
      bgs
      pgs
      personalNumberPayroll
      personalNumber
      employmentType
      isStateDifferent
      statePlaceOfWorkId
      resolvedStatePlaceOfWorkId {
        code
        id
        label
        labelEN
        __typename
      }
      additionalEmploymentsType
      miniJobType
      costCenter
      costUnit
      additionalPayments
      paymentType
      taxClass
      commentFieldEmployee
      commentFieldHr
      dataStatuses {
        ...EmployeeDataStatusesFields
        __typename
      }
      __typename
    }

    fragment EmployeeDataStatusesFields on EmployeeContractDataStatuses {
      bpoCompletedAt
      hrCompletedAt
      employeeCompletedAt
      contractId
      id
      __typename
    }

    fragment EmployeePersonalDataFields on EmployeePersonalData {
      id
      userId
      companyId
      firstName
      lastName
      birthName
      birthday
      nationality
      resolvedNationality {
        code
        id
        label
        labelEN
        __typename
      }
      cityBirth
      countryBirth
      countryBirthId
      resolvedCountryBirthId {
        code
        id
        label
        labelEN
        __typename
      }
      gender
      phoneNumber
      street
      houseNumber
      addressSupplement
      postcode
      city
      country
      countryId
      resolvedCountryId {
        code
        id
        label
        labelEN
        __typename
      }
      stateId
      resolvedStateId {
        code
        id
        label
        labelEN
        __typename
      }
      socialId
      taxId
      noTaxId
      healthInsurance
      resolvedHealthInsurance {
        code
        id
        label
        labelEN
        __typename
      }
      lastHealthInsurance
      resolvedLastHealthInsurance {
        code
        id
        label
        labelEN
        __typename
      }
      insuranceStatus
      voluntaryInsuranceType
      privateInsuranceToHealth
      privateInsuranceToCare
      pensionStatus
      companyPensionScheme
      bic
      iban
      educationLevel
      professionalEducation
      disability
      disabilityDegree
      numberOfKids
      kids {
        id
        birthDate
        firstName
        lastName
        employeePersonalDataId
        __typename
      }
      parentalStatus
      taxDenomination
      __typename
    }
  `,
  variables: {
    data,
  },
  propertyPath,
  variablePathsOfRelevantProperties: null,
});

export const updateEmployee: (
  variables: UpdateEmployeeInput,
  propertyPath: string,
  variablePathsOfRelevantProperties: Partial<Record<ChangedField, string>>,
) => QueryDefinition = (
  variables,
  propertyPath,
  variablePathsOfRelevantProperties,
) => ({
  queryId: "employee.update",
  query: gql`
    mutation UpdateEmployee($data: UpdateEmployeeInput!) {
      updateEmployee(data: $data)
    }
  `,
  variables: {
    data: variables,
  },
  propertyPath,
  variablePathsOfRelevantProperties,
});

export const placeHolderQuery: QueryDefinition = {
  queryId: "employee.update",
  query: "...",
  variables: {},
  propertyPath: "...",
  variablePathsOfRelevantProperties: null,
};
