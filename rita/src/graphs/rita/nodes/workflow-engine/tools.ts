import { tool } from "@langchain/core/tools";
import { z } from "zod";

// Mock tool to get employee data by ID
export const getEmployeeById = tool(
  async (input: { employeeId: string }) => {
    // Mock implementation - in real scenario this would query the database
    return {
      employeeId: input.employeeId,
      name: "John Doe",
      salary: 75000,
      department: "Engineering",
      hireDate: "2023-01-15",
      isActive: true,
    };
  },
  {
    name: "get_employee_by_id",
    description: "Retrieve employee information by employee ID",
    schema: z.object({
      employeeId: z.string().describe("The unique identifier of the employee"),
    }),
  }
);

// Mock tool to find employees by name (returns all employees with similar names)
export const findEmployeeByName = tool(
  async (_input: { name: string }) => {
    // Mock implementation - in real scenario this would query the database
    // Returns all employees whose names contain the search term
    const allEmployees = [
      {
        employeeId: "EMP001",
        name: "John Doe",
        salary: 75000,
        department: "Engineering",
        hireDate: "2023-01-15",
        isActive: true,
      },
      {
        employeeId: "EMP005",
        name: "Johnny Smith",
        salary: 65000,
        department: "Sales",
        hireDate: "2022-08-20",
        isActive: true,
      },
      {
        employeeId: "EMP008",
        name: "Johnson Lee",
        salary: 72000,
        department: "Marketing",
        hireDate: "2023-03-10",
        isActive: true,
      },
    ];

    return allEmployees;
  },
  {
    name: "find_employee_by_name",
    description:
      "Find employees by name (returns all employees with similar names)",
    schema: z.object({
      name: z.string().describe("The name or partial name to search for"),
    }),
  }
);

// Mock tool to get all employees
export const getAllEmployees = tool(
  async () => {
    // Mock implementation - returns a list of employees
    return [
      {
        employeeId: "EMP001",
        name: "John Doe",
        salary: 75000,
        department: "Engineering",
      },
      {
        employeeId: "EMP002",
        name: "Jane Smith",
        salary: 82000,
        department: "Marketing",
      },
      {
        employeeId: "EMP003",
        name: "Bob Johnson",
        salary: 68000,
        department: "Sales",
      },
      {
        employeeId: "EMP004",
        name: "Alice Brown",
        salary: 95000,
        department: "Engineering",
      },
    ];
  },
  {
    name: "get_all_employees",
    description: "Retrieve all employees from the system",
    schema: z.object({}),
  }
);

// Mock tool to get employees by salary range
export const getEmployeesBySalary = tool(
  async (input: { minSalary?: number; maxSalary?: number }) => {
    const allEmployees = [
      {
        employeeId: "EMP001",
        name: "John Doe",
        salary: 75000,
        department: "Engineering",
      },
      {
        employeeId: "EMP002",
        name: "Jane Smith",
        salary: 82000,
        department: "Marketing",
      },
      {
        employeeId: "EMP003",
        name: "Bob Johnson",
        salary: 68000,
        department: "Sales",
      },
      {
        employeeId: "EMP004",
        name: "Alice Brown",
        salary: 95000,
        department: "Engineering",
      },
    ];

    return allEmployees.filter((emp) => {
      if (input.minSalary && emp.salary < input.minSalary) return false;
      if (input.maxSalary && emp.salary > input.maxSalary) return false;
      return true;
    });
  },
  {
    name: "get_employees_by_salary",
    description: "Retrieve employees within a specified salary range",
    schema: z.object({
      minSalary: z.number().optional().describe("Minimum salary threshold"),
      maxSalary: z.number().optional().describe("Maximum salary threshold"),
    }),
  }
);

// Mock tool to get employee contracts
export const getEmployeeContracts = tool(
  async (input: { employeeId: string }) => {
    // Mock implementation - returns contracts for the specified employee
    return [
      {
        contractId: "CON001",
        employeeId: input.employeeId,
        startDate: "2023-01-15",
        endDate: "2024-01-14",
        type: "Full-time",
        status: "Active",
      },
      {
        contractId: "CON002",
        employeeId: input.employeeId,
        startDate: "2024-01-15",
        endDate: "2025-01-14",
        type: "Full-time",
        status: "Active",
      },
    ];
  },
  {
    name: "get_employee_contracts",
    description: "Retrieve all contracts for a specific employee",
    schema: z.object({
      employeeId: z.string().describe("The unique identifier of the employee"),
    }),
  }
);

// Mock tool to get employees with incomplete information
export const getEmployeesWithIncompleteInfo = tool(
  async () => {
    // Mock implementation - returns employees missing required information
    return [
      {
        employeeId: "EMP005",
        name: "Charlie Wilson",
        missingFields: ["taxId", "bankAccount"],
        lastUpdated: "2024-01-10",
      },
      {
        employeeId: "EMP006",
        name: "Diana Garcia",
        missingFields: ["emergencyContact"],
        lastUpdated: "2024-01-12",
      },
    ];
  },
  {
    name: "get_employees_with_incomplete_info",
    description:
      "Retrieve employees with incomplete information for payroll processing",
    schema: z.object({}),
  }
);

// Mock tool to get department statistics
export const getDepartmentStats = tool(
  async (input: { department?: string }) => {
    const allEmployees = [
      {
        employeeId: "EMP001",
        name: "John Doe",
        salary: 75000,
        department: "Engineering",
      },
      {
        employeeId: "EMP002",
        name: "Jane Smith",
        salary: 82000,
        department: "Marketing",
      },
      {
        employeeId: "EMP003",
        name: "Bob Johnson",
        salary: 68000,
        department: "Sales",
      },
      {
        employeeId: "EMP004",
        name: "Alice Brown",
        salary: 95000,
        department: "Engineering",
      },
    ];

    const filteredEmployees = input.department
      ? allEmployees.filter((emp) => emp.department === input.department)
      : allEmployees;

    const totalEmployees = filteredEmployees.length;
    const totalSalary = filteredEmployees.reduce(
      (sum, emp) => sum + emp.salary,
      0
    );
    const avgSalary = totalEmployees > 0 ? totalSalary / totalEmployees : 0;

    return {
      department: input.department || "All Departments",
      totalEmployees,
      totalSalary,
      averageSalary: Math.round(avgSalary),
      employees: filteredEmployees,
    };
  },
  {
    name: "get_department_stats",
    description: "Get statistics for a specific department or all departments",
    schema: z.object({
      department: z
        .string()
        .optional()
        .describe("Department name to filter by"),
    }),
  }
);
