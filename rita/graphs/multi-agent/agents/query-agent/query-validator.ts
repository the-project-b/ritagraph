// Query validation and fixing logic extracted from query-agent.ts

/**
 * Handles GraphQL query validation and automatic fixes
 */
export class QueryValidator {
  
  /**
   * Validates basic GraphQL query structure
   */
  validateBasicQuery(query: string, selectedQueryName: string): boolean {
    try {
      const openBraces = (query.match(/\{/g) || []).length;
      const closeBraces = (query.match(/\}/g) || []).length;
      return openBraces === closeBraces && 
             query.includes('query {') && 
             query.includes(selectedQueryName);
    } catch {
      return false;
    }
  }

  /**
   * Fixes common GraphQL syntax issues
   */
  fixGraphQLSyntax(query: string): string {
    return query
      .replace(/```graphql\n?/g, '')
      .replace(/```\n?/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\{\s+/g, '{ ')
      .replace(/\s+\}/g, ' }')
      .replace(/,\s*,/g, ',')
      .replace(/,\s*\}/g, ' }')
      .replace(/\{\s*,/g, '{ ')
      .replace(/\s*,\s*/g, ', ')
      .trim();
  }

  /**
   * Filters out complex fields that require subfield selection
   */
  filterComplexFields(queryStr: string): string {
    const complexFields = [
      'dataStatus', 'events', 'incomeComponents', 'lastInviteLink',
      'missingFieldsBPO', 'missingFieldsEmployee', 'missingFieldsHR',
      'healthInsurance', 'contractData', 'paymentComponents',
      'permissions', 'roles', 'metadata', 'settings', 'preferences',
      'contractDataStatuses', 'employeeContractDataStatuses',
      'currentPage', 'totalPages', 'totalResults' // Common wrong pagination fields
    ];
    
    let filtered = queryStr;
    complexFields.forEach(field => {
      const patterns = [
        new RegExp(`\\s*${field}\\s*,?`, 'g'),
        new RegExp(`\\s*,\\s*${field}\\s*`, 'g'),
        new RegExp(`\\s*${field}\\s*`, 'g')
      ];
      patterns.forEach(pattern => {
        filtered = filtered.replace(pattern, ' ');
      });
    });
    
    return this.fixGraphQLSyntax(filtered);
  }

  /**
   * Detects problematic fields in query string
   */
  detectProblematicField(errorMessage: string): string | null {
    const fieldPatterns = [
      /field "([^"]+)" does not exist/i,
      /Cannot query field "([^"]+)"/i,
      /Field "([^"]+)" is not defined/i,
      /Unknown field "([^"]+)"/i,
      /field '([^']+)' does not exist/i,
      /Cannot query field '([^']+)'/i,
      /Field '([^']+)' is not defined/i,
      /Unknown field '([^']+)'/i
    ];
    
    for (const pattern of fieldPatterns) {
      const match = errorMessage.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return null;
  }

  /**
   * Applies intelligent field corrections for common patterns
   */
  correctCommonFieldIssues(query: string, problematicField: string): string {
    let fixedQuery = query;
    
    const corrections = {
      'results': 'employees',      // Replace 'results' with 'employees' for employee queries
      'pageInfo': 'pagination',    // Replace 'pageInfo' with 'pagination'
      'name': 'firstName lastName', // Replace 'name' with 'firstName lastName' for employee queries
      'position': 'jobTitle',      // Replace 'position' with 'jobTitle' for employee queries
      'department': ''             // Remove 'department' field as it doesn't exist
    };

    if (corrections[problematicField] !== undefined) {
      const replacement = corrections[problematicField];
      if (replacement === '') {
        // Remove the field entirely
        fixedQuery = fixedQuery.replace(new RegExp(`\\b${problematicField}\\b`, 'g'), '');
      } else {
        // Replace with correct field name(s)
        fixedQuery = fixedQuery.replace(new RegExp(`\\b${problematicField}\\b`, 'g'), replacement);
      }
      console.log(`🔍 QUERY VALIDATOR - Corrected "${problematicField}" to "${replacement || 'removed'}"`);
    }

    return this.fixGraphQLSyntax(fixedQuery);
  }

  /**
   * Validates and fixes a GraphQL query automatically
   */
  validateAndFix(query: string, selectedQueryName: string): {
    isValid: boolean;
    fixedQuery: string;
    issues: string[];
  } {
    const issues: string[] = [];
    let fixedQuery = query;

    // Basic validation
    if (!this.validateBasicQuery(query, selectedQueryName)) {
      issues.push('Invalid basic GraphQL structure');
    }

    // Fix syntax issues
    fixedQuery = this.fixGraphQLSyntax(fixedQuery);
    
    // Filter complex fields
    const beforeComplexFilter = fixedQuery;
    fixedQuery = this.filterComplexFields(fixedQuery);
    if (beforeComplexFilter !== fixedQuery) {
      issues.push('Removed complex fields that require subselection');
    }

    // Final validation
    const isValid = this.validateBasicQuery(fixedQuery, selectedQueryName);

    return {
      isValid,
      fixedQuery,
      issues
    };
  }

  /**
   * Handles query execution errors with automatic retry
   */
  async handleQueryError(
    originalQuery: string,
    error: any,
    retryCallback: (fixedQuery: string) => Promise<any>
  ): Promise<any> {
    const errorMessage = error?.message || String(error);
    console.log('🔍 QUERY VALIDATOR - Query execution error:', errorMessage);

    // Check if it's a field validation error we can fix
    const problematicField = this.detectProblematicField(errorMessage);
    
    if (!problematicField) {
      console.log('🔍 QUERY VALIDATOR - Cannot auto-fix this error type');
      throw error;
    }

    console.log('🔍 QUERY VALIDATOR - Detected problematic field:', problematicField);
    
    // Apply corrections
    let fixedQuery = this.correctCommonFieldIssues(originalQuery, problematicField);
    
    // Apply additional filtering
    fixedQuery = this.filterComplexFields(fixedQuery);
    
    console.log('🔍 QUERY VALIDATOR - Retrying with corrected query:', fixedQuery);
    
    try {
      const result = await retryCallback(fixedQuery);
      console.log('🔍 QUERY VALIDATOR - Field validation error correction successful!');
      return result;
    } catch (retryError) {
      console.error('🔍 QUERY VALIDATOR - Field validation error correction failed:', retryError);
      throw retryError;
    }
  }
} 