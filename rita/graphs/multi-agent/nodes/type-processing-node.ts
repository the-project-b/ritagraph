import { Command } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ExtendedState } from "../../../states/states";
import { AgentType } from "../types/agents";
import { logEvent } from "../agents/supervisor-agent";

// interface TypeField {
//   name: string;
//   type: string;
//   isRequired?: boolean;
//   isList?: boolean;
// }

// interface TypeDetails {
//   kind: 'INPUT_OBJECT' | 'OBJECT' | 'ENUM' | 'METADATA';
//   fields?: TypeField[];
//   requiredFields?: string[];
//   optionalFields?: string[];
//   scalarFields?: string[];
//   complexFields?: string[];
//   values?: string[];
//   isFilter?: boolean;
//   isAdvanced?: boolean;
//   hasStandardFields?: boolean;
//   isListType?: boolean;
//   template?: Record<string, any>;
//   pagination?: {
//     detected: boolean;
//     fields: string[];
//     template: {
//       fields: string[];
//       template: string;
//     };
//   };
//   queryTemplates?: string[];
//   errorPrevention?: string[];
//   commonArguments?: Record<string, any>;
//   commonFields?: Record<string, any>;
// }

/**
 * Type Processing Node - Processes raw type details and generates query guidance
 */
export const typeProcessingNode = async (state: ExtendedState, config: any) => {
  const startTime = Date.now();
  logEvent('info', AgentType.TOOL, 'type_processing_start', { startTime });

  try {
    // Get the selected query and raw type details from state
    const selectedQuery = state.memory?.get('selectedQuery');
    const userRequest = state.memory?.get('userRequest');

    if (!selectedQuery?.rawTypeDetails) {
      throw new Error('Missing required state data for type processing');
    }

    logEvent('info', AgentType.TOOL, 'processing_types', {
      queryName: selectedQuery.name,
      inputType: selectedQuery.inputType,
      outputType: selectedQuery.outputType
    });

    // Parse type details
    // const parsedTypes = parseTypeDetails(rawTypeDetails);
    // console.log('🔍 TYPE PROCESSING: Parsed types:', parsedTypes);

    // Use LLM to analyze types and generate query construction guidance
    const model = new ChatOpenAI({ model: "gpt-4", temperature: 0 });
    
    const prompt = `You are a GraphQL query construction professional. With following data please construct query:

User Request: "${userRequest}"
Selected Query: ${selectedQuery.name}

Type Information:
${selectedQuery?.rawTypeDetails}

Output: Return only the GraphQL query string, no additional text or formatting.`;

    const preparedQuery = await model.invoke([new HumanMessage(prompt)]);
    const analysis = {
      query: typeof preparedQuery.content === 'string' ? preparedQuery.content.trim() : JSON.stringify(preparedQuery.content)
    };

    console.log('🔍 TYPE PROCESSING: Prepared Query:', analysis);

    // // Generate query template and arguments
    // const queryTemplate = generateQueryTemplate(selectedQuery, parsedTypes);
    // const inputArguments = generateInputArguments(selectedQuery, parsedTypes);
    // const fieldSelection = generateFieldSelection(selectedQuery, parsedTypes);

    // Update selected query with generated information
    const updatedMemory = new Map(state.memory || new Map());
    updatedMemory.set('selectedQuery', {
      ...selectedQuery,
      // typeDetails: {
      //   input: selectedQuery.inputType !== 'Unknown' ? parsedTypes[selectedQuery.inputType] : undefined,
      //   output: selectedQuery.outputType !== 'Unknown' ? parsedTypes[selectedQuery.outputType] : undefined
      // },
      // signature: {
      //   ...selectedQuery.signature,
      //   input: selectedQuery.inputType !== 'Unknown' ? {
      //     type: selectedQuery.inputType,
      //     required: true,
      //     fields: parsedTypes[selectedQuery.inputType]?.fields || [],
      //     requiredFields: parsedTypes[selectedQuery.inputType]?.requiredFields || [],
      //     analysis: analysis.inputAnalysis
      //   } : undefined,
      //   output: {
      //     type: selectedQuery.outputType,
      //     required: true,
      //     fields: parsedTypes[selectedQuery.outputType]?.fields || [],
      //     requiredFields: parsedTypes[selectedQuery.outputType]?.requiredFields || [],
      //     analysis: analysis.outputAnalysis
      //   }
      // },
      // queryGuidance: analysis.queryGuidance,
      generatedQuery: preparedQuery,
      // rawTypeDetails: rawTypeDetails
    });

    logEvent('info', AgentType.TOOL, 'type_processing_completed', {
      queryName: selectedQuery.name,
      generatedQuery: preparedQuery,
      duration: Date.now() - startTime
    });

    // Continue to query execution
    return new Command({
      goto: "QUERY_EXECUTION",
      update: {
        messages: state.messages,
        memory: updatedMemory
      }
    });

  } catch (error) {
    logEvent('error', AgentType.TOOL, 'type_processing_error', { error: error.message });
    throw new Error(`Type processing failed: ${error.message}`);
  }
};


// /**
//  * Parse type details from the tool response
//  */
// export function parseTypeDetails(response: any): Record<string, TypeDetails> {
//   try {
//     console.log('🔍 TYPE DISCOVERY: Raw response:', response);
    
//     // Handle different response formats
//     let text = '';
//     if (typeof response === 'string') {
//       text = response;
//     } else if (response?.content) {
//       text = Array.isArray(response.content) ? response.content[0]?.text || '' : response.content;
//     } else {
//       text = JSON.stringify(response);
//     }

//     // Clean up the text before parsing
//     text = text
//       .replace(/\n/g, ' ')  // Replace newlines with spaces
//       .replace(/\r/g, ' ')  // Replace carriage returns with spaces
//       .replace(/\t/g, ' ')  // Replace tabs with spaces
//       .replace(/\s+/g, ' ') // Replace multiple spaces with single space
//       .trim();

//     console.log('🔍 TYPE DISCOVERY: Cleaned text:', text);

//     // Try to parse the JSON
//     let parsed;
//     try {
//       parsed = JSON.parse(text);
//     } catch (parseError) {
//       console.error('🔍 TYPE DISCOVERY: JSON parse error:', parseError);
//       console.error('🔍 TYPE DISCOVERY: Problematic text:', text);
      
//       // Try to fix common JSON issues
//       text = text
//         .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3') // Add quotes to unquoted keys
//         .replace(/(:\s*)(\w+)(\s*[,}])/g, '$1"$2"$3')  // Add quotes to unquoted string values
//         .replace(/([{,]\s*)(\w+)(\s*[,}])/g, '$1"$2"$3'); // Add quotes to unquoted values at end of objects
      
//       try {
//         parsed = JSON.parse(text);
//       } catch (retryError) {
//         console.error('🔍 TYPE DISCOVERY: Second JSON parse attempt failed:', retryError);
//         throw new Error(`Failed to parse type details after cleanup: ${retryError.message}`);
//       }
//     }

//     // Extract pattern analysis section
//     const patternAnalysis = parsed.patternAnalysis || parsed;
//     if (!patternAnalysis) {
//       throw new Error('No pattern analysis found in response');
//     }

//     const types: Record<string, TypeDetails> = {};

//     // Process input types
//     if (patternAnalysis.inputTypes) {
//       for (const [name, details] of Object.entries(patternAnalysis.inputTypes)) {
//         const typedDetails = details as {
//           fields?: TypeField[];
//           requiredFields?: string[];
//           optionalFields?: string[];
//           isFilter?: boolean;
//           isAdvanced?: boolean;
//           template?: Record<string, any>;
//         };
//         types[name] = {
//           kind: 'INPUT_OBJECT',
//           fields: typedDetails.fields || [],
//           requiredFields: typedDetails.requiredFields || [],
//           optionalFields: typedDetails.optionalFields || [],
//           isFilter: typedDetails.isFilter || false,
//           isAdvanced: typedDetails.isAdvanced || false,
//           template: typedDetails.template || {}
//         };
//       }
//     }

//     // Process entity types
//     if (patternAnalysis.entityTypes) {
//       for (const [name, details] of Object.entries(patternAnalysis.entityTypes)) {
//         const typedDetails = details as {
//           fields?: TypeField[];
//           scalarFields?: string[];
//           complexFields?: string[];
//           hasStandardFields?: boolean;
//         };
//         types[name] = {
//           kind: 'OBJECT',
//           fields: typedDetails.fields || [],
//           scalarFields: typedDetails.scalarFields || [],
//           complexFields: typedDetails.complexFields || [],
//           hasStandardFields: typedDetails.hasStandardFields || false
//         };
//       }
//     }

//     // Process return types
//     if (patternAnalysis.returnTypes) {
//       for (const [name, details] of Object.entries(patternAnalysis.returnTypes)) {
//         const typedDetails = details as {
//           fields?: TypeField[];
//           isListType?: boolean;
//           hasPagination?: boolean;
//         };
//         types[name] = {
//           kind: 'OBJECT',
//           fields: typedDetails.fields || [],
//           isListType: typedDetails.isListType || false,
//           pagination: {
//             detected: typedDetails.hasPagination || false,
//             fields: ['limit', 'page', 'totalItems', 'totalPages'],
//             template: {
//               fields: ['limit', 'page'],
//               template: '{ limit page totalItems totalPages }'
//             }
//           }
//         };
//       }
//     }

//     // Process enum types
//     if (patternAnalysis.enumTypes) {
//       for (const [name, details] of Object.entries(patternAnalysis.enumTypes)) {
//         const typedDetails = details as {
//           values?: string[];
//         };
//         types[name] = {
//           kind: 'ENUM',
//           values: typedDetails.values || []
//         };
//       }
//     }

//     // Add metadata
//     if (patternAnalysis.metadata) {
//       types['__metadata'] = {
//         kind: 'METADATA',
//         queryTemplates: patternAnalysis.metadata.queryTemplates || [],
//         errorPrevention: patternAnalysis.metadata.errorPrevention || [],
//         commonArguments: patternAnalysis.metadata.commonArguments || {},
//         commonFields: patternAnalysis.metadata.commonFields || {},
//         pagination: patternAnalysis.metadata.pagination || { detected: false }
//       };
//     }

//     console.log('🔍 TYPE DISCOVERY: Successfully parsed types:', Object.keys(types));
//     return types;

//   } catch (error) {
//     console.error('🔍 TYPE DISCOVERY: Failed to parse type details:', error);
//     throw new Error(`Failed to parse type details: ${error.message}`);
//   }
// }

// /**
//  * Generate query template based on type details
//  */
// export function generateQueryTemplate(selectedQuery: any, parsedTypes: Record<string, TypeDetails>): string {
//   try {
//     const metadata = parsedTypes['__metadata'];
//     if (!metadata) {
//       throw new Error('No metadata found in type details');
//     }

//     // Get the input type details
//     const inputType = parsedTypes[selectedQuery.inputType];
//     if (!inputType) {
//       throw new Error(`Input type ${selectedQuery.inputType} not found in type details`);
//     }

//     // Get the output type details
//     const outputType = parsedTypes[selectedQuery.outputType];
//     if (!outputType) {
//       throw new Error(`Output type ${selectedQuery.outputType} not found in type details`);
//     }

//     // Generate field selection
//     const fields = generateFieldSelection(selectedQuery, parsedTypes);
//     const fieldString = fields.join('\n    ');

//     // Parse the query signature to get argument information
//     const signatureMatch = selectedQuery.signature?.match(/\(([^)]*)\)/);
//     const signatureArgs = signatureMatch ? signatureMatch[1].trim() : '';
    
//     // Generate the query based on argument structure
//     let template = '';
//     if (signatureArgs) {
//       // Parse arguments from signature
//       const parsedArgs = signatureArgs.split(',').map(arg => {
//         const [name, type] = arg.split(':').map(s => s.trim());
//         return { name, type };
//       });

//       // Generate arguments based on input type
//       const queryArgs = generateInputArguments(selectedQuery, parsedTypes);
//       const formattedArgs = Object.entries(queryArgs)
//         .map(([key, value]) => {
//           if (typeof value === 'object') {
//             return `${key}: ${JSON.stringify(value)}`;
//           }
//           return `${key}: ${value}`;
//         })
//         .join('\n      ');

//       // If it's a filter query, wrap arguments in a data object
//       const isFilterQuery = inputType.isFilter || inputType.isAdvanced;
//       const finalArgs = isFilterQuery ? 
//         `data: {\n      ${formattedArgs}\n    }` : 
//         formattedArgs;

//       template = `query {
//   ${selectedQuery.name}(${finalArgs}) {
//     ${fieldString}
//   }
// }`;
//     } else {
//       // No arguments needed
//       template = `query {
//   ${selectedQuery.name} {
//     ${fieldString}
//   }
// }`;
//     }

//     // Add error prevention comments
//     if (metadata.errorPrevention?.length) {
//       const comments = metadata.errorPrevention
//         .map(rule => `# ${rule}`)
//         .join('\n');
//       template = template.replace(/(query {)/, `$1\n${comments}\n`);
//     }

//     console.log('🔍 TYPE DISCOVERY: Generated query template:', template);
//     return template;
//   } catch (error) {
//     console.error('🔍 TYPE DISCOVERY: Failed to generate query template:', error);
//     // Return a basic template as fallback
//     return `query {
//   ${selectedQuery.name} {
//     id
//   }
// }`;
//   }
// }

// /**
//  * Generate input arguments based on type details
//  */
// export function generateInputArguments(selectedQuery: any, parsedTypes: Record<string, TypeDetails>): any {
//   try {
//     const metadata = parsedTypes['__metadata'];
//     if (!metadata) {
//       throw new Error('No metadata found in type details');
//     }

//     // Get the input type details
//     const inputType = parsedTypes[selectedQuery.inputType];
//     if (!inputType) {
//       throw new Error(`Input type ${selectedQuery.inputType} not found in type details`);
//     }

//     // Parse the query signature to get argument information
//     const signatureMatch = selectedQuery.signature?.match(/\(([^)]*)\)/);
//     const argsString = signatureMatch ? signatureMatch[1].trim() : '';
    
//     // Start with the template if available
//     const args = inputType.template ? { ...inputType.template } : {};

//     // If we have a signature, use it to validate and structure arguments
//     if (argsString) {
//       const signatureArgs = argsString.split(',').map(arg => {
//         const [name, type] = arg.split(':').map(s => s.trim());
//         return { name, type };
//       });

//       // Ensure required fields from signature are present
//       for (const { name, type } of signatureArgs) {
//         if (!args[name]) {
//           // Use default values from metadata if available
//           if (metadata.commonArguments?.[name]) {
//             if (name === 'companyId') {
//               args[name] = '{{auto_companyid}}';
//             } else if (name === 'pagination') {
//               args[name] = { limit: 20, page: 1 };
//             } else if (name === 'conditionType') {
//               args[name] = 'AND';
//             }
//           }
//         }
//       }
//     } else {
//       // No signature, ensure required fields are present
//       if (inputType.requiredFields) {
//         for (const field of inputType.requiredFields) {
//           if (!args[field]) {
//             // Use default values from metadata if available
//             if (metadata.commonArguments?.[field]) {
//               if (field === 'companyId') {
//                 args[field] = '{{auto_companyid}}';
//               } else if (field === 'pagination') {
//                 args[field] = { limit: 20, page: 1 };
//               } else if (field === 'conditionType') {
//                 args[field] = 'AND';
//               }
//             }
//           }
//         }
//       }
//     }

//     // Handle special cases
//     if (inputType.isAdvanced) {
//       // Ensure pagination is present for advanced queries
//       if (!args.pagination) {
//         args.pagination = { limit: 20, page: 1 };
//       }
//       // Ensure conditionType is present
//       if (!args.conditionType) {
//         args.conditionType = 'AND';
//       }
//     }

//     console.log('🔍 TYPE DISCOVERY: Generated input arguments:', args);
//     return args;
//   } catch (error) {
//     console.error('🔍 TYPE DISCOVERY: Failed to generate input arguments:', error);
//     // Return basic arguments as fallback
//     return {
//       companyId: '{{auto_companyid}}',
//       conditionType: 'AND',
//       pagination: { limit: 20, page: 1 }
//     };
//   }
// }

// /**
//  * Generate field selection based on type details
//  */
// export function generateFieldSelection(selectedQuery: any, parsedTypes: Record<string, TypeDetails>): string[] {
//   try {
//     const metadata = parsedTypes['__metadata'];
//     if (!metadata) {
//       throw new Error('No metadata found in type details');
//     }

//     // Get the output type details
//     const outputType = parsedTypes[selectedQuery.outputType];
//     if (!outputType) {
//       throw new Error(`Output type ${selectedQuery.outputType} not found in type details`);
//     }

//     const fields: string[] = [];

//     // Add scalar fields first
//     if (outputType.scalarFields) {
//       fields.push(...outputType.scalarFields);
//     }

//     // Handle complex fields with proper subselection
//     if (outputType.complexFields) {
//       for (const complexField of outputType.complexFields) {
//         if (complexField === 'pagination' && metadata.pagination?.detected) {
//           fields.push('pagination { limit page totalItems totalPages }');
//         } else if (complexField === 'employees') {
//           // Get employee type details
//           const employeeType = parsedTypes['EmployeeAdvancedFilterForHrEmployees'];
//           if (employeeType) {
//             const employeeFields = [
//               ...(employeeType.scalarFields || []),
//               ...(metadata.commonFields ? Object.keys(metadata.commonFields) : [])
//             ].filter((f, i, a) => a.indexOf(f) === i); // Remove duplicates

//             fields.push(`employees { ${employeeFields.join(' ')} }`);
//           } else {
//             fields.push('employees { id firstName lastName email }');
//           }
//         } else {
//           // Handle other complex fields with basic subselection
//           fields.push(`${complexField} { id }`);
//         }
//       }
//     }

//     // If no fields were added, use common fields or id
//     if (fields.length === 0) {
//       fields.push(...(metadata.commonFields ? Object.keys(metadata.commonFields) : ['id']));
//     }

//     return fields;
//   } catch (error) {
//     console.error('🔍 TYPE DISCOVERY: Failed to generate field selection:', error);
//     // Return basic fields as fallback
//     return ['id'];
//   }
// } 