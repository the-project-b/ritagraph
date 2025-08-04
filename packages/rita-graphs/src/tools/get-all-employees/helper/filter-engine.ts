import { z } from 'zod';

type FilterOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'startsWith'
  | 'endsWith';

export const Filter = (
  operators: Array<FilterOperator>,
  valueType: z.ZodType = z.string(),
) =>
  z.object({
    operator: z.enum(operators as [string, ...string[]]),
    value: valueType,
  });

export type FilterType = z.infer<ReturnType<typeof Filter>>;

// Type-specific comparison functions
const compareStringValues = (
  operator: FilterOperator,
  fieldValue: any,
  filterValue: string,
): boolean => {
  const fieldStr = String(fieldValue).toLowerCase();
  const filterStr = String(filterValue).toLowerCase();

  switch (operator) {
    case 'eq':
      return fieldStr === filterStr;
    case 'ne':
      return fieldStr !== filterStr;
    case 'contains':
      return fieldStr.includes(filterStr);
    case 'startsWith':
      return fieldStr.startsWith(filterStr);
    case 'endsWith':
      return fieldStr.endsWith(filterStr);
    case 'gt':
      return Number(fieldStr) > Number(filterStr);
    case 'gte':
      return Number(fieldStr) >= Number(filterStr);
    case 'lt':
      return Number(fieldStr) < Number(filterStr);
    case 'lte':
      return Number(fieldStr) <= Number(filterStr);
    default:
      return false;
  }
};

const compareNumberValues = (
  operator: FilterOperator,
  fieldValue: any,
  filterValue: number,
): boolean => {
  const fieldNum = Number(fieldValue);
  const filterNum = Number(filterValue);

  // Check if values are valid numbers
  if (isNaN(fieldNum) || isNaN(filterNum)) {
    return true; // Skip filtering if values are not valid numbers
  }

  switch (operator) {
    case 'eq':
      return fieldNum === filterNum;
    case 'ne':
      return fieldNum !== filterNum;
    case 'gt':
      return fieldNum > filterNum;
    case 'gte':
      return fieldNum >= filterNum;
    case 'lt':
      return fieldNum < filterNum;
    case 'lte':
      return fieldNum <= filterNum;
    case 'contains':
    case 'startsWith':
    case 'endsWith':
      // String operators not supported for numbers, return true to skip filtering
      return false;
    default:
      return false;
  }
};

const compareDateValues = (
  operator: FilterOperator,
  fieldValue: any,
  filterValue: Date,
): boolean => {
  const fieldDate = new Date(fieldValue);
  const filterDate = new Date(filterValue);

  // Check if dates are valid
  if (isNaN(fieldDate.getTime()) || isNaN(filterDate.getTime())) {
    return true; // Skip filtering if dates are invalid
  }

  switch (operator) {
    case 'eq':
      return fieldDate.getTime() === filterDate.getTime();
    case 'ne':
      return fieldDate.getTime() !== filterDate.getTime();
    case 'gt':
      return fieldDate.getTime() > filterDate.getTime();
    case 'gte':
      return fieldDate.getTime() >= filterDate.getTime();
    case 'lt':
      return fieldDate.getTime() < filterDate.getTime();
    case 'lte':
      return fieldDate.getTime() <= filterDate.getTime();
    case 'contains':
    case 'startsWith':
    case 'endsWith':
      // String operators not supported for dates, return true to skip filtering
      return false;
    default:
      return false;
  }
};

const compareBooleanValues = (
  operator: FilterOperator,
  fieldValue: any,
  filterValue: boolean,
): boolean => {
  const fieldBool = Boolean(fieldValue);
  const filterBool = Boolean(filterValue);

  switch (operator) {
    case 'eq':
      return fieldBool === filterBool;
    case 'ne':
      return fieldBool !== filterBool;
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
    case 'contains':
    case 'startsWith':
    case 'endsWith':
      // Comparison operators not supported for booleans, return true to skip filtering
      return false;
    default:
      return false;
  }
};

// Main comparison function that determines which type-specific function to use
const compareValues = (
  operator: FilterOperator,
  fieldValue: any,
  filterValue: string | number | Date | boolean,
): boolean => {
  // Determine the type of filterValue and call appropriate comparison function
  if (typeof filterValue === 'string') {
    return compareStringValues(operator, fieldValue, filterValue);
  } else if (typeof filterValue === 'number') {
    return compareNumberValues(operator, fieldValue, filterValue);
  } else if (filterValue instanceof Date) {
    return compareDateValues(operator, fieldValue, filterValue);
  } else if (typeof filterValue === 'boolean') {
    return compareBooleanValues(operator, fieldValue, filterValue);
  } else {
    // For unknown types, return true to skip filtering
    return true;
  }
};

// Apply a single filter to an object
export const applySingleFilter = <T extends Record<string, any>>(
  item: T,
  filter: FilterType,
  fieldName: string,
): boolean => {
  const fieldValue = item[fieldName];
  return compareValues(
    filter.operator as FilterOperator,
    fieldValue,
    filter.value,
  );
};

// Apply filters object to an array of objects
export const applyFilters = <T extends Record<string, any>>(
  items: T[],
  filters: Record<string, FilterType>,
): T[] => {
  return items.filter((item) => {
    return Object.entries(filters).every(([field, filter]) => {
      return applySingleFilter(item, filter, field);
    });
  });
};

// Legacy function for backward compatibility
export const applyFilter = (filter: FilterType) => {
  return filter.operator === 'eq' ? filter.value : filter.value;
};
