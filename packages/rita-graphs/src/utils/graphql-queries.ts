import { gql } from "graphql-request";

// Common fragments
export const VIEW_AS_FRAGMENT = gql`
  fragment ViewAs on ViewAsInfo {
    enabled
    impersonates {
      client
      role
    }
    identity {
      company {
        name
        avatarUrl
        companyId
      }
      user {
        userId
        firstName
        lastName
        email
        role
        avatarUrl
      }
    }
    original {
      company {
        name
        companyId
        avatarUrl
      }
      user {
        userId
        firstName
        lastName
        role
        avatarUrl
      }
    }
  }
`;

export const ME_FIELDS_EMPLOYEE_FRAGMENT = gql`
  fragment MeFieldsEmployee on OnboardingEmployee {
    id
    email
    role
    firstName
    lastName
    preferredLanguage
    avatarUrl
    status
    childRole
    company {
      bpoCompany {
        id
        name
      }
      inferredPayrollEngine {
        id
        identifier
      }
      avatarUrl
      id
      name
      features
      isDemo
    }
    viewAs {
      ...ViewAs
    }
    employeeSpace {
      id
      status
    }
  }
`;

export const ME_FIELDS_HR_FRAGMENT = gql`
  fragment MeFieldsHr on OnboardingHrManager {
    id
    email
    role
    firstName
    lastName
    preferredLanguage
    avatarUrl
    status
    childRole
    company {
      bpoCompany {
        id
        name
      }
      inferredPayrollEngine {
        id
        identifier
      }
      avatarUrl
      id
      name
      features
      forwardingEmail
      isDemo
    }
    viewAs {
      ...ViewAs
    }
  }
`;

export const ME_FIELDS_BPO_FRAGMENT = gql`
  fragment MeFieldsBpo on OnboardingBpo {
    id
    email
    role
    firstName
    lastName
    preferredLanguage
    avatarUrl
    status
    childRole
    company {
      id
      name
      avatarUrl
      features
      forwardingEmail
      inferredPayrollEngine {
        id
        identifier
      }
      isDemo
    }
    viewAs {
      ...ViewAs
    }
  }
`;

export const ME_FIELDS_ADMIN_FRAGMENT = gql`
  fragment MeFieldsAdmin on OnboardingAdmin {
    id
    email
    role
    firstName
    lastName
    preferredLanguage
    avatarUrl
    status
    childRole
    company {
      id
      name
      avatarUrl
      features
      forwardingEmail
      isDemo
    }
    viewAs {
      ...ViewAs
    }
  }
`;

// Main queries
export const ME_QUERY = gql`
  query Me {
    me {
      ...MeFieldsEmployee
      ...MeFieldsHr
      ...MeFieldsBpo
      ...MeFieldsAdmin
    }
  }

  ${VIEW_AS_FRAGMENT}
  ${ME_FIELDS_EMPLOYEE_FRAGMENT}
  ${ME_FIELDS_HR_FRAGMENT}
  ${ME_FIELDS_BPO_FRAGMENT}
  ${ME_FIELDS_ADMIN_FRAGMENT}
`;

export const EMPLOYEES_BY_COMPANY_QUERY = gql`
  query EmployeesByCompany($data: EmployeeStatusInput!) {
    employeesByCompany(data: $data) {
      id
      firstName
      lastName
      role
      employeeContract {
        id
        personalNumber
        personalNumberPayroll
      }
    }
  }
`;

// Type definitions
export interface MeResponse {
  me: {
    id: string;
    email: string;
    role: string;
    firstName: string;
    lastName: string;
    preferredLanguage: string;
    avatarUrl?: string;
    status: string;
    childRole?: string;
    company: {
      id: string;
      name: string;
      avatarUrl?: string;
      features: any;
      isDemo: boolean;
      bpoCompany?: {
        id: string;
        name: string;
      };
      inferredPayrollEngine?: {
        id: string;
        identifier: string;
      };
      forwardingEmail?: string;
    };
    viewAs?: any;
    employeeSpace?: {
      id: string;
      status: string;
    };
  };
}

export interface EmployeeContract {
  id: string;
  personalNumber?: string;
  personalNumberPayroll?: string;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  employeeContract?: EmployeeContract[];
}

export interface EmployeesByCompanyResponse {
  employeesByCompany: Employee[];
}

export interface EmployeesByCompanyInput {
  companyId: string;
} 