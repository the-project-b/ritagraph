/**
 * GraphQL response types and related interfaces
 */

// Employee and contract types (from rita GraphQL queries)
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

// Me query response type (from rita GraphQL queries)
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