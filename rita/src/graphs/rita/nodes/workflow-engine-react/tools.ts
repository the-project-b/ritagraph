import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { PayrollDatabase, employees } from "../../mock-local-db.js";
import { searchForInformation } from "../../tools/search-for-information.js";

// Tool to get employee data by ID
export const getEmployeeById = tool(
  async (input: { employeeId: string }) => {
    const employee = PayrollDatabase.getEmployeeById(input.employeeId);
    if (!employee) {
      return { error: `Employee with ID ${input.employeeId} not found` };
    }
    return employee;
  },
  {
    name: "get_employee_by_id",
    description:
      "Retrieve complete employee information by employee ID for payroll processing",
    schema: z.object({
      employeeId: z
        .string()
        .describe("The unique identifier of the employee (e.g., EMP001)"),
    }),
  }
);

// Tool to find employees by name (returns all employees with similar names)
export const findEmployeeByName = tool(
  async (input: { name: string }) => {
    const employees = PayrollDatabase.findEmployeesByName(input.name);
    return {
      searchTerm: input.name,
      count: employees.length,
      employees: employees,
    };
  },
  {
    name: "find_employee_by_name",
    description:
      "Find employees by name for payroll lookup (supports partial name matching)",
    schema: z.object({
      name: z
        .string()
        .describe(
          "The name or partial name to search for (first name, last name, or full name)"
        ),
    }),
  }
);

// Tool to get all employees
export const getAllEmployees = tool(
  async () => {
    const employees = PayrollDatabase.getAllEmployees();
    return {
      totalEmployees: employees.length,
      activeEmployees: employees.filter((emp) => emp.isActive).length,
      employees: employees,
    };
  },
  {
    name: "get_all_employees",
    description:
      "Retrieve all employees from the payroll system with summary statistics",
    schema: z.object({}),
  }
);

// Tool to get employees by salary range
export const getEmployeesBySalary = tool(
  async (input: { minSalary?: number; maxSalary?: number }) => {
    const employees = PayrollDatabase.getEmployeesBySalary(
      input.minSalary,
      input.maxSalary
    );
    const totalSalary = employees.reduce((sum, emp) => sum + emp.salary, 0);
    const avgSalary = employees.length > 0 ? totalSalary / employees.length : 0;

    return {
      minSalary: input.minSalary,
      maxSalary: input.maxSalary,
      count: employees.length,
      totalSalary: totalSalary,
      averageSalary: Math.round(avgSalary),
      employees: employees,
    };
  },
  {
    name: "get_employees_by_salary",
    description:
      "Retrieve employees within a specified salary range for payroll analysis and budgeting",
    schema: z.object({
      minSalary: z
        .number()
        .optional()
        .describe("Minimum salary threshold (in USD)"),
      maxSalary: z
        .number()
        .optional()
        .describe("Maximum salary threshold (in USD)"),
    }),
  }
);

// Tool to get employees with missing information
export const getEmployeesWithIncompleteInfo = tool(
  async () => {
    const employees = PayrollDatabase.getEmployeesWithMissingInfo();
    const missingInfoSummary = employees.reduce((acc, emp) => {
      emp.missingInformation.forEach((field) => {
        acc[field] = (acc[field] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);

    return {
      totalEmployeesWithMissingInfo: employees.length,
      missingInfoBreakdown: missingInfoSummary,
      employees: employees,
    };
  },
  {
    name: "get_employees_with_incomplete_info",
    description:
      "Retrieve employees with incomplete information that needs to be collected for payroll processing",
    schema: z.object({}),
  }
);

// Tool to get employees missing specific information
export const getEmployeesMissingField = tool(
  async (input: { field: string }) => {
    const employees = PayrollDatabase.getEmployeesMissingField(input.field);
    return {
      missingField: input.field,
      count: employees.length,
      employees: employees,
    };
  },
  {
    name: "get_employees_missing_field",
    description:
      "Find employees missing specific information fields (e.g., taxId, bankAccount, emergencyContact, address)",
    schema: z.object({
      field: z
        .string()
        .describe(
          "The specific field that is missing (e.g., 'taxId', 'bankAccount', 'emergencyContact', 'address')"
        ),
    }),
  }
);

// Tool to get employee contracts
export const getEmployeeContracts = tool(
  async (input: { employeeId: string }) => {
    const contracts = PayrollDatabase.getEmployeeContracts(input.employeeId);
    const employee = PayrollDatabase.getEmployeeById(input.employeeId);

    return {
      employeeId: input.employeeId,
      employeeName: employee
        ? `${employee.firstName} ${employee.lastName}`
        : "Unknown",
      contractCount: contracts.length,
      contracts: contracts,
    };
  },
  {
    name: "get_employee_contracts",
    description:
      "Retrieve all contracts for a specific employee for payroll and benefits verification",
    schema: z.object({
      employeeId: z.string().describe("The unique identifier of the employee"),
    }),
  }
);

// Tool to get department statistics
export const getDepartmentStats = tool(
  async (input: { department?: string }) => {
    const stats = PayrollDatabase.getDepartmentStats(input.department);
    return stats;
  },
  {
    name: "get_department_stats",
    description:
      "Get comprehensive statistics for a specific department or all departments for payroll budgeting and analysis",
    schema: z.object({
      department: z
        .string()
        .optional()
        .describe(
          "Department name to filter by (e.g., 'Engineering', 'Marketing', 'Sales', 'HR', 'Finance')"
        ),
    }),
  }
);

// Tool to get employees by department
export const getEmployeesByDepartment = tool(
  async (input: { department: string }) => {
    const employees = PayrollDatabase.getEmployeesByDepartment(
      input.department
    );
    const totalSalary = employees.reduce((sum, emp) => sum + emp.salary, 0);
    const avgSalary = employees.length > 0 ? totalSalary / employees.length : 0;

    return {
      department: input.department,
      count: employees.length,
      totalSalary: totalSalary,
      averageSalary: Math.round(avgSalary),
      employees: employees,
    };
  },
  {
    name: "get_employees_by_department",
    description:
      "Retrieve all employees in a specific department for department-specific payroll processing",
    schema: z.object({
      department: z
        .string()
        .describe(
          "The department name (e.g., 'Engineering', 'Marketing', 'Sales', 'HR', 'Finance')"
        ),
    }),
  }
);

// Tool to get active employees only
export const getActiveEmployees = tool(
  async () => {
    const employees = PayrollDatabase.getActiveEmployees();
    const totalSalary = employees.reduce((sum, emp) => sum + emp.salary, 0);
    const avgSalary = employees.length > 0 ? totalSalary / employees.length : 0;

    return {
      count: employees.length,
      totalSalary: totalSalary,
      averageSalary: Math.round(avgSalary),
      employees: employees,
    };
  },
  {
    name: "get_active_employees",
    description:
      "Retrieve only active employees for current payroll processing",
    schema: z.object({}),
  }
);

// Tool to get employees hired in a date range
export const getEmployeesByHireDate = tool(
  async (input: { startDate?: string; endDate?: string }) => {
    const employees = PayrollDatabase.getEmployeesByHireDate(
      input.startDate,
      input.endDate
    );
    const totalSalary = employees.reduce((sum, emp) => sum + emp.salary, 0);
    const avgSalary = employees.length > 0 ? totalSalary / employees.length : 0;

    return {
      startDate: input.startDate,
      endDate: input.endDate,
      count: employees.length,
      totalSalary: totalSalary,
      averageSalary: Math.round(avgSalary),
      employees: employees,
    };
  },
  {
    name: "get_employees_by_hire_date",
    description:
      "Find employees hired within a specific date range for payroll and benefits eligibility analysis",
    schema: z.object({
      startDate: z
        .string()
        .optional()
        .describe("Start date for hire date range (YYYY-MM-DD format)"),
      endDate: z
        .string()
        .optional()
        .describe("End date for hire date range (YYYY-MM-DD format)"),
    }),
  }
);

// Tool to get payroll records for an employee
export const getEmployeePayrollRecords = tool(
  async (input: {
    employeeId: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const records = PayrollDatabase.getEmployeePayrollRecords(
      input.employeeId,
      input.startDate,
      input.endDate
    );
    const employee = PayrollDatabase.getEmployeeById(input.employeeId);

    const totalGrossPay = records.reduce(
      (sum, record) => sum + record.grossPay,
      0
    );
    const totalNetPay = records.reduce((sum, record) => sum + record.netPay, 0);
    const totalDeductions = records.reduce(
      (sum, record) =>
        sum + Object.values(record.deductions).reduce((dSum, d) => dSum + d, 0),
      0
    );

    return {
      employeeId: input.employeeId,
      employeeName: employee
        ? `${employee.firstName} ${employee.lastName}`
        : "Unknown",
      startDate: input.startDate,
      endDate: input.endDate,
      recordCount: records.length,
      totalGrossPay: Math.round(totalGrossPay * 100) / 100,
      totalNetPay: Math.round(totalNetPay * 100) / 100,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
      records: records,
    };
  },
  {
    name: "get_employee_payroll_records",
    description:
      "Retrieve payroll records for a specific employee within an optional date range for payroll history and analysis",
    schema: z.object({
      employeeId: z.string().describe("The unique identifier of the employee"),
      startDate: z
        .string()
        .optional()
        .describe("Start date for payroll records (YYYY-MM-DD format)"),
      endDate: z
        .string()
        .optional()
        .describe("End date for payroll records (YYYY-MM-DD format)"),
    }),
  }
);

// Tool to get payroll summary for a pay period
export const getPayrollSummary = tool(
  async (input: { payPeriodStart: string; payPeriodEnd: string }) => {
    const summary = PayrollDatabase.getPayrollSummary(
      input.payPeriodStart,
      input.payPeriodEnd
    );
    return summary;
  },
  {
    name: "get_payroll_summary",
    description:
      "Get comprehensive payroll summary for a specific pay period including totals and breakdowns",
    schema: z.object({
      payPeriodStart: z
        .string()
        .describe("Start date of the pay period (YYYY-MM-DD format)"),
      payPeriodEnd: z
        .string()
        .describe("End date of the pay period (YYYY-MM-DD format)"),
    }),
  }
);

// Tool to get high-salary employees (for executive payroll analysis)
export const getHighSalaryEmployees = tool(
  async (input: { threshold: number }) => {
    const employees = PayrollDatabase.getEmployeesBySalary(input.threshold);
    const totalSalary = employees.reduce((sum, emp) => sum + emp.salary, 0);
    const avgSalary = employees.length > 0 ? totalSalary / employees.length : 0;

    return {
      salaryThreshold: input.threshold,
      count: employees.length,
      totalSalary: totalSalary,
      averageSalary: Math.round(avgSalary),
      employees: employees,
    };
  },
  {
    name: "get_high_salary_employees",
    description:
      "Find employees with salaries above a specific threshold for executive payroll and compensation analysis",
    schema: z.object({
      threshold: z
        .number()
        .describe(
          "Salary threshold in USD (e.g., 100000 for employees earning over $100k)"
        ),
    }),
  }
);

// Tool to get employees with missing critical payroll information
export const getEmployeesWithCriticalMissingInfo = tool(
  async () => {
    const criticalFields = ["taxId", "bankAccount"];
    const employeesWithCriticalMissing = employees.filter((emp) =>
      criticalFields.some((field) => emp.missingInformation.includes(field))
    );

    const missingInfoSummary = employeesWithCriticalMissing.reduce(
      (acc, emp) => {
        emp.missingInformation.forEach((field) => {
          if (criticalFields.includes(field)) {
            acc[field] = (acc[field] || 0) + 1;
          }
        });
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      criticalFields: criticalFields,
      totalEmployeesWithCriticalMissingInfo:
        employeesWithCriticalMissing.length,
      missingInfoBreakdown: missingInfoSummary,
      employees: employeesWithCriticalMissing,
    };
  },
  {
    name: "get_employees_with_critical_missing_info",
    description:
      "Find employees missing critical payroll information (taxId, bankAccount) that prevents payroll processing",
    schema: z.object({}),
  }
);

// Updated available tools with comprehensive payroll database functionality
export const availableTools = [
  // Original search tool
  searchForInformation,

  // Employee lookup and search tools
  getEmployeeById,
  findEmployeeByName,
  getAllEmployees,
  getActiveEmployees,

  // Salary analysis tools
  getEmployeesBySalary,
  getHighSalaryEmployees,

  // Department management tools
  getDepartmentStats,
  getEmployeesByDepartment,

  // Missing information tracking tools
  getEmployeesWithIncompleteInfo,
  getEmployeesMissingField,
  getEmployeesWithCriticalMissingInfo,

  // Contract and benefits tools
  getEmployeeContracts,

  // Hire date analysis tools
  getEmployeesByHireDate,

  // Payroll processing tools
  getEmployeePayrollRecords,
  getPayrollSummary,
];
