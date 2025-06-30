// Mock Database for Payroll Management System
// This simulates a real database with employees, contracts, and payroll data

export interface Employee {
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  hireDate: string;
  department: string;
  position: string;
  salary: number;
  hourlyRate?: number;
  isActive: boolean;
  taxId?: string;
  bankAccount?: {
    accountNumber: string;
    routingNumber: string;
    bankName: string;
  };
  emergencyContact?: {
    name: string;
    relationship: string;
    phone: string;
  };
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  missingInformation: string[];
  lastUpdated: string;
}

export interface Contract {
  contractId: string;
  employeeId: string;
  startDate: string;
  endDate?: string;
  type: "Full-time" | "Part-time" | "Contractor" | "Intern";
  status: "Active" | "Terminated" | "Expired" | "Pending";
  baseSalary: number;
  benefits: string[];
  terminationDate?: string;
  terminationReason?: string;
}

export interface PayrollRecord {
  payrollId: string;
  employeeId: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  grossPay: number;
  netPay: number;
  deductions: {
    federalTax: number;
    stateTax: number;
    socialSecurity: number;
    medicare: number;
    healthInsurance: number;
    retirement: number;
    other: number;
  };
  hoursWorked?: number;
  overtimeHours?: number;
  overtimePay?: number;
  bonuses?: number;
  status: "Pending" | "Processed" | "Paid" | "Failed";
  processedDate?: string;
}

// Mock database with realistic employee data
export const employees: Employee[] = [
  {
    employeeId: "EMP001",
    firstName: "Sarah",
    lastName: "Johnson",
    email: "sarah.johnson@company.com",
    phone: "(555) 123-4567",
    dateOfBirth: "1985-03-15",
    hireDate: "2020-01-15",
    department: "Engineering",
    position: "Senior Software Engineer",
    salary: 95000,
    isActive: true,
    taxId: "123-45-6789",
    bankAccount: {
      accountNumber: "1234567890",
      routingNumber: "021000021",
      bankName: "Chase Bank",
    },
    emergencyContact: {
      name: "Michael Johnson",
      relationship: "Spouse",
      phone: "(555) 123-4568",
    },
    address: {
      street: "123 Main St",
      city: "San Francisco",
      state: "CA",
      zipCode: "94102",
    },
    missingInformation: [],
    lastUpdated: "2024-01-15",
  },
  {
    employeeId: "EMP002",
    firstName: "Michael",
    lastName: "Chen",
    email: "michael.chen@company.com",
    phone: "(555) 234-5678",
    dateOfBirth: "1990-07-22",
    hireDate: "2021-03-10",
    department: "Marketing",
    position: "Marketing Manager",
    salary: 82000,
    isActive: true,
    taxId: "234-56-7890",
    bankAccount: {
      accountNumber: "0987654321",
      routingNumber: "121000248",
      bankName: "Wells Fargo",
    },
    emergencyContact: {
      name: "Lisa Chen",
      relationship: "Sister",
      phone: "(555) 234-5679",
    },
    address: {
      street: "456 Oak Ave",
      city: "New York",
      state: "NY",
      zipCode: "10001",
    },
    missingInformation: [],
    lastUpdated: "2024-01-10",
  },
  {
    employeeId: "EMP003",
    firstName: "Emily",
    lastName: "Rodriguez",
    email: "emily.rodriguez@company.com",
    phone: "(555) 345-6789",
    dateOfBirth: "1988-11-08",
    hireDate: "2022-06-20",
    department: "Sales",
    position: "Sales Representative",
    salary: 65000,
    isActive: true,
    taxId: "345-67-8901",
    bankAccount: {
      accountNumber: "1122334455",
      routingNumber: "021000021",
      bankName: "Chase Bank",
    },
    emergencyContact: {
      name: "Carlos Rodriguez",
      relationship: "Father",
      phone: "(555) 345-6790",
    },
    address: {
      street: "789 Pine St",
      city: "Chicago",
      state: "IL",
      zipCode: "60601",
    },
    missingInformation: [],
    lastUpdated: "2024-01-12",
  },
  {
    employeeId: "EMP004",
    firstName: "David",
    lastName: "Thompson",
    email: "david.thompson@company.com",
    phone: "(555) 456-7890",
    dateOfBirth: "1983-12-03",
    hireDate: "2019-08-15",
    department: "Engineering",
    position: "Engineering Manager",
    salary: 120000,
    isActive: true,
    taxId: "456-78-9012",
    bankAccount: {
      accountNumber: "5544332211",
      routingNumber: "121000248",
      bankName: "Wells Fargo",
    },
    emergencyContact: {
      name: "Jennifer Thompson",
      relationship: "Wife",
      phone: "(555) 456-7891",
    },
    address: {
      street: "321 Elm St",
      city: "Austin",
      state: "TX",
      zipCode: "73301",
    },
    missingInformation: [],
    lastUpdated: "2024-01-08",
  },
  {
    employeeId: "EMP005",
    firstName: "Jessica",
    lastName: "Williams",
    email: "jessica.williams@company.com",
    phone: "(555) 567-8901",
    dateOfBirth: "1992-04-18",
    hireDate: "2023-01-10",
    department: "HR",
    position: "HR Specialist",
    salary: 58000,
    isActive: true,
    taxId: "567-89-0123",
    bankAccount: {
      accountNumber: "6677889900",
      routingNumber: "021000021",
      bankName: "Chase Bank",
    },
    emergencyContact: {
      name: "Robert Williams",
      relationship: "Brother",
      phone: "(555) 567-8902",
    },
    address: {
      street: "654 Maple Dr",
      city: "Seattle",
      state: "WA",
      zipCode: "98101",
    },
    missingInformation: [],
    lastUpdated: "2024-01-14",
  },
  {
    employeeId: "EMP006",
    firstName: "Alex",
    lastName: "Brown",
    email: "alex.brown@company.com",
    phone: "(555) 678-9012",
    dateOfBirth: "1987-09-25",
    hireDate: "2021-11-05",
    department: "Finance",
    position: "Financial Analyst",
    salary: 72000,
    isActive: true,
    taxId: "678-90-1234",
    bankAccount: {
      accountNumber: "7788990011",
      routingNumber: "121000248",
      bankName: "Wells Fargo",
    },
    emergencyContact: {
      name: "Patricia Brown",
      relationship: "Mother",
      phone: "(555) 678-9013",
    },
    address: {
      street: "987 Cedar Ln",
      city: "Denver",
      state: "CO",
      zipCode: "80201",
    },
    missingInformation: [],
    lastUpdated: "2024-01-11",
  },
  {
    employeeId: "EMP007",
    firstName: "Maria",
    lastName: "Garcia",
    email: "maria.garcia@company.com",
    phone: "(555) 789-0123",
    dateOfBirth: "1991-06-12",
    hireDate: "2022-09-15",
    department: "Customer Support",
    position: "Customer Success Manager",
    salary: 68000,
    isActive: true,
    taxId: "789-01-2345",
    bankAccount: {
      accountNumber: "8899001122",
      routingNumber: "021000021",
      bankName: "Chase Bank",
    },
    emergencyContact: {
      name: "Jose Garcia",
      relationship: "Husband",
      phone: "(555) 789-0124",
    },
    address: {
      street: "147 Birch Ave",
      city: "Miami",
      state: "FL",
      zipCode: "33101",
    },
    missingInformation: [],
    lastUpdated: "2024-01-13",
  },
  {
    employeeId: "EMP008",
    firstName: "James",
    lastName: "Wilson",
    email: "james.wilson@company.com",
    phone: "(555) 890-1234",
    dateOfBirth: "1986-01-30",
    hireDate: "2020-12-01",
    department: "Engineering",
    position: "DevOps Engineer",
    salary: 88000,
    isActive: true,
    taxId: "890-12-3456",
    bankAccount: {
      accountNumber: "9900112233",
      routingNumber: "121000248",
      bankName: "Wells Fargo",
    },
    emergencyContact: {
      name: "Amanda Wilson",
      relationship: "Sister",
      phone: "(555) 890-1235",
    },
    address: {
      street: "258 Spruce St",
      city: "Portland",
      state: "OR",
      zipCode: "97201",
    },
    missingInformation: [],
    lastUpdated: "2024-01-09",
  },
  {
    employeeId: "EMP009",
    firstName: "Lisa",
    lastName: "Anderson",
    email: "lisa.anderson@company.com",
    phone: "(555) 901-2345",
    dateOfBirth: "1989-08-14",
    hireDate: "2023-03-20",
    department: "Marketing",
    position: "Content Strategist",
    salary: 62000,
    isActive: true,
    taxId: "901-23-4567",
    bankAccount: {
      accountNumber: "0011223344",
      routingNumber: "021000021",
      bankName: "Chase Bank",
    },
    emergencyContact: {
      name: "Thomas Anderson",
      relationship: "Father",
      phone: "(555) 901-2346",
    },
    address: {
      street: "369 Willow Way",
      city: "Boston",
      state: "MA",
      zipCode: "02101",
    },
    missingInformation: [],
    lastUpdated: "2024-01-16",
  },
  {
    employeeId: "EMP010",
    firstName: "Robert",
    lastName: "Taylor",
    email: "robert.taylor@company.com",
    phone: "(555) 012-3456",
    dateOfBirth: "1984-05-07",
    hireDate: "2021-07-10",
    department: "Sales",
    position: "Sales Manager",
    salary: 85000,
    isActive: true,
    taxId: "012-34-5678",
    bankAccount: {
      accountNumber: "1122334455",
      routingNumber: "121000248",
      bankName: "Wells Fargo",
    },
    emergencyContact: {
      name: "Susan Taylor",
      relationship: "Wife",
      phone: "(555) 012-3457",
    },
    address: {
      street: "741 Aspen Ct",
      city: "Atlanta",
      state: "GA",
      zipCode: "30301",
    },
    missingInformation: [],
    lastUpdated: "2024-01-07",
  },
  // Employees with missing information for testing
  {
    employeeId: "EMP011",
    firstName: "Kevin",
    lastName: "Martinez",
    email: "kevin.martinez@company.com",
    phone: "(555) 123-7890",
    dateOfBirth: "1993-02-28",
    hireDate: "2023-08-15",
    department: "Engineering",
    position: "Junior Developer",
    salary: 55000,
    isActive: true,
    taxId: undefined,
    bankAccount: undefined,
    emergencyContact: undefined,
    address: {
      street: "159 Redwood Dr",
      city: "San Jose",
      state: "CA",
      zipCode: "95101",
    },
    missingInformation: ["taxId", "bankAccount", "emergencyContact"],
    lastUpdated: "2024-01-15",
  },
  {
    employeeId: "EMP012",
    firstName: "Amanda",
    lastName: "Davis",
    email: "amanda.davis@company.com",
    phone: "(555) 234-8901",
    dateOfBirth: "1990-12-10",
    hireDate: "2022-11-01",
    department: "HR",
    position: "Recruiter",
    salary: 52000,
    isActive: true,
    taxId: "234-56-7890",
    bankAccount: undefined,
    emergencyContact: {
      name: "Mark Davis",
      relationship: "Brother",
      phone: "(555) 234-8902",
    },
    address: undefined,
    missingInformation: ["bankAccount", "address"],
    lastUpdated: "2024-01-12",
  },
  {
    employeeId: "EMP013",
    firstName: "Daniel",
    lastName: "Lee",
    email: "daniel.lee@company.com",
    phone: "(555) 345-9012",
    dateOfBirth: "1988-07-03",
    hireDate: "2021-05-20",
    department: "Finance",
    position: "Accountant",
    salary: 67000,
    isActive: true,
    taxId: "345-67-8901",
    bankAccount: {
      accountNumber: "3344556677",
      routingNumber: "021000021",
      bankName: "Chase Bank",
    },
    emergencyContact: undefined,
    address: {
      street: "963 Magnolia Blvd",
      city: "Los Angeles",
      state: "CA",
      zipCode: "90001",
    },
    missingInformation: ["emergencyContact"],
    lastUpdated: "2024-01-10",
  },
];

// Mock contracts data
export const contracts: Contract[] = [
  {
    contractId: "CON001",
    employeeId: "EMP001",
    startDate: "2020-01-15",
    type: "Full-time",
    status: "Active",
    baseSalary: 95000,
    benefits: ["Health Insurance", "Dental", "Vision", "401k", "PTO"],
  },
  {
    contractId: "CON002",
    employeeId: "EMP002",
    startDate: "2021-03-10",
    type: "Full-time",
    status: "Active",
    baseSalary: 82000,
    benefits: ["Health Insurance", "Dental", "401k", "PTO"],
  },
  {
    contractId: "CON003",
    employeeId: "EMP003",
    startDate: "2022-06-20",
    type: "Full-time",
    status: "Active",
    baseSalary: 65000,
    benefits: ["Health Insurance", "401k", "PTO"],
  },
  {
    contractId: "CON004",
    employeeId: "EMP004",
    startDate: "2019-08-15",
    type: "Full-time",
    status: "Active",
    baseSalary: 120000,
    benefits: [
      "Health Insurance",
      "Dental",
      "Vision",
      "401k",
      "PTO",
      "Stock Options",
    ],
  },
  {
    contractId: "CON005",
    employeeId: "EMP005",
    startDate: "2023-01-10",
    type: "Full-time",
    status: "Active",
    baseSalary: 58000,
    benefits: ["Health Insurance", "401k", "PTO"],
  },
  {
    contractId: "CON006",
    employeeId: "EMP006",
    startDate: "2021-11-05",
    type: "Full-time",
    status: "Active",
    baseSalary: 72000,
    benefits: ["Health Insurance", "Dental", "401k", "PTO"],
  },
  {
    contractId: "CON007",
    employeeId: "EMP007",
    startDate: "2022-09-15",
    type: "Full-time",
    status: "Active",
    baseSalary: 68000,
    benefits: ["Health Insurance", "401k", "PTO"],
  },
  {
    contractId: "CON008",
    employeeId: "EMP008",
    startDate: "2020-12-01",
    type: "Full-time",
    status: "Active",
    baseSalary: 88000,
    benefits: ["Health Insurance", "Dental", "401k", "PTO"],
  },
  {
    contractId: "CON009",
    employeeId: "EMP009",
    startDate: "2023-03-20",
    type: "Full-time",
    status: "Active",
    baseSalary: 62000,
    benefits: ["Health Insurance", "401k", "PTO"],
  },
  {
    contractId: "CON010",
    employeeId: "EMP010",
    startDate: "2021-07-10",
    type: "Full-time",
    status: "Active",
    baseSalary: 85000,
    benefits: ["Health Insurance", "Dental", "401k", "PTO"],
  },
  {
    contractId: "CON011",
    employeeId: "EMP011",
    startDate: "2023-08-15",
    type: "Full-time",
    status: "Active",
    baseSalary: 55000,
    benefits: ["Health Insurance", "401k", "PTO"],
  },
  {
    contractId: "CON012",
    employeeId: "EMP012",
    startDate: "2022-11-01",
    type: "Full-time",
    status: "Active",
    baseSalary: 52000,
    benefits: ["Health Insurance", "401k", "PTO"],
  },
  {
    contractId: "CON013",
    employeeId: "EMP013",
    startDate: "2021-05-20",
    type: "Full-time",
    status: "Active",
    baseSalary: 67000,
    benefits: ["Health Insurance", "Dental", "401k", "PTO"],
  },
];

// Mock payroll records for the last few months
export const payrollRecords: PayrollRecord[] = [
  // December 2023 payroll records
  {
    payrollId: "PAY001",
    employeeId: "EMP001",
    payPeriodStart: "2023-12-01",
    payPeriodEnd: "2023-12-15",
    grossPay: 3653.85,
    netPay: 2734.62,
    deductions: {
      federalTax: 584.62,
      stateTax: 219.23,
      socialSecurity: 226.54,
      medicare: 52.98,
      healthInsurance: 150.0,
      retirement: 365.38,
      other: 0,
    },
    status: "Paid",
    processedDate: "2023-12-16",
  },
  {
    payrollId: "PAY002",
    employeeId: "EMP002",
    payPeriodStart: "2023-12-01",
    payPeriodEnd: "2023-12-15",
    grossPay: 3153.85,
    netPay: 2365.38,
    deductions: {
      federalTax: 504.62,
      stateTax: 189.23,
      socialSecurity: 195.54,
      medicare: 45.73,
      healthInsurance: 120.0,
      retirement: 315.38,
      other: 0,
    },
    status: "Paid",
    processedDate: "2023-12-16",
  },
  // January 2024 payroll records
  {
    payrollId: "PAY003",
    employeeId: "EMP001",
    payPeriodStart: "2024-01-01",
    payPeriodEnd: "2024-01-15",
    grossPay: 3653.85,
    netPay: 2734.62,
    deductions: {
      federalTax: 584.62,
      stateTax: 219.23,
      socialSecurity: 226.54,
      medicare: 52.98,
      healthInsurance: 150.0,
      retirement: 365.38,
      other: 0,
    },
    status: "Paid",
    processedDate: "2024-01-16",
  },
  {
    payrollId: "PAY004",
    employeeId: "EMP002",
    payPeriodStart: "2024-01-01",
    payPeriodEnd: "2024-01-15",
    grossPay: 3153.85,
    netPay: 2365.38,
    deductions: {
      federalTax: 504.62,
      stateTax: 189.23,
      socialSecurity: 195.54,
      medicare: 45.73,
      healthInsurance: 120.0,
      retirement: 315.38,
      other: 0,
    },
    status: "Paid",
    processedDate: "2024-01-16",
  },
];

// Database query functions
export class PayrollDatabase {
  // Get employee by ID
  static getEmployeeById(employeeId: string): Employee | null {
    return employees.find((emp) => emp.employeeId === employeeId) || null;
  }

  // Find employees by name (partial match)
  static findEmployeesByName(name: string): Employee[] {
    const searchTerm = name.toLowerCase();
    return employees.filter(
      (emp) =>
        emp.firstName.toLowerCase().includes(searchTerm) ||
        emp.lastName.toLowerCase().includes(searchTerm) ||
        `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(searchTerm)
    );
  }

  // Get all employees
  static getAllEmployees(): Employee[] {
    return employees;
  }

  // Get employees by salary range
  static getEmployeesBySalary(
    minSalary?: number,
    maxSalary?: number
  ): Employee[] {
    return employees.filter((emp) => {
      if (minSalary && emp.salary < minSalary) return false;
      if (maxSalary && emp.salary > maxSalary) return false;
      return true;
    });
  }

  // Get employees with missing information
  static getEmployeesWithMissingInfo(): Employee[] {
    return employees.filter((emp) => emp.missingInformation.length > 0);
  }

  // Get employees missing specific information
  static getEmployeesMissingField(field: string): Employee[] {
    return employees.filter((emp) => emp.missingInformation.includes(field));
  }

  // Get employee contracts
  static getEmployeeContracts(employeeId: string): Contract[] {
    return contracts.filter((contract) => contract.employeeId === employeeId);
  }

  // Get department statistics
  static getDepartmentStats(department?: string) {
    const filteredEmployees = department
      ? employees.filter((emp) => emp.department === department)
      : employees;

    const totalEmployees = filteredEmployees.length;
    const totalSalary = filteredEmployees.reduce(
      (sum, emp) => sum + emp.salary,
      0
    );
    const avgSalary = totalEmployees > 0 ? totalSalary / totalEmployees : 0;
    const activeEmployees = filteredEmployees.filter(
      (emp) => emp.isActive
    ).length;

    return {
      department: department || "All Departments",
      totalEmployees,
      activeEmployees,
      totalSalary,
      averageSalary: Math.round(avgSalary),
      employees: filteredEmployees,
    };
  }

  // Get payroll records for an employee
  static getEmployeePayrollRecords(
    employeeId: string,
    startDate?: string,
    endDate?: string
  ): PayrollRecord[] {
    let filtered = payrollRecords.filter(
      (record) => record.employeeId === employeeId
    );

    if (startDate) {
      filtered = filtered.filter(
        (record) => record.payPeriodStart >= startDate
      );
    }

    if (endDate) {
      filtered = filtered.filter((record) => record.payPeriodEnd <= endDate);
    }

    return filtered.sort(
      (a, b) =>
        new Date(b.payPeriodStart).getTime() -
        new Date(a.payPeriodStart).getTime()
    );
  }

  // Get employees by department
  static getEmployeesByDepartment(department: string): Employee[] {
    return employees.filter((emp) => emp.department === department);
  }

  // Get active employees only
  static getActiveEmployees(): Employee[] {
    return employees.filter((emp) => emp.isActive);
  }

  // Get employees hired in a date range
  static getEmployeesByHireDate(
    startDate?: string,
    endDate?: string
  ): Employee[] {
    return employees.filter((emp) => {
      if (startDate && emp.hireDate < startDate) return false;
      if (endDate && emp.hireDate > endDate) return false;
      return true;
    });
  }

  // Get payroll summary for a pay period
  static getPayrollSummary(payPeriodStart: string, payPeriodEnd: string) {
    const periodRecords = payrollRecords.filter(
      (record) =>
        record.payPeriodStart === payPeriodStart &&
        record.payPeriodEnd === payPeriodEnd
    );

    const totalGrossPay = periodRecords.reduce(
      (sum, record) => sum + record.grossPay,
      0
    );
    const totalNetPay = periodRecords.reduce(
      (sum, record) => sum + record.netPay,
      0
    );
    const totalDeductions = periodRecords.reduce(
      (sum, record) =>
        sum + Object.values(record.deductions).reduce((dSum, d) => dSum + d, 0),
      0
    );

    return {
      payPeriodStart,
      payPeriodEnd,
      totalEmployees: periodRecords.length,
      totalGrossPay: Math.round(totalGrossPay * 100) / 100,
      totalNetPay: Math.round(totalNetPay * 100) / 100,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
      records: periodRecords,
    };
  }
}
