# LangSmith Datasets Configuration

This document outlines how we structure and manage datasets in LangSmith for Rita evaluations, including current schema definitions and best practices for creating new datasets.

## Current Dataset Schema

Our LangSmith datasets follow a standardized schema that defines the input/output structure for Rita evaluations. This schema determines what data our evaluators expect and how examples should be formatted.

### Input Schema (Simplified)

```json
{
  "type": "object",
  "title": "dataset_input_schema",
  "required": [
    "question"
  ],
  "properties": {
    "question": {
      "type": "string",
      "description": "The user's question or input to RITA v2"
    },
    "preferredLanguage": {
      "type": "string",
      "enum": ["EN", "DE"],
      "description": "Optional: The preferred language for the response. If not specified, falls back to the user's authentication preferred language."
    }
  },
  "additionalProperties": true
}
```

**Key Points:**
- **Standardized Input**: Our system now expects the `question` field directly for input prompts
- **Simplified Structure**: Removed complex input normalization in favor of consistent field naming
- **Backward Compatibility**: Existing datasets should be updated to use the `question` field
- **Purpose**: This maps to the `messages[0].content` that gets sent to the Rita graph
- **Language Control**: Optional `preferredLanguage` field allows per-example language control with fallback to user's authentication language

**Required Input Format:**
- Primary: `question` - The main input field for all evaluations
- Optional: `preferredLanguage` - Language preference for this specific example

### Output Schema

```json
{
  "type": "object",
  "title": "dataset_output_schema",
  "required": [
    "expected_result_description"
  ],
  "properties": {
    "expected_result_description": {
      "type": "string",
      "description": "The result that we expect, described in human language"
    },
    "expectedLanguage": {
      "type": "string",
      "enum": ["EN", "DE"],
      "description": "Optional: The expected language of the response. Used by LANGUAGE_VERIFICATION evaluator. Falls back to: 1) preferredLanguage from input, 2) user's authentication language"
    }
  },
  "additionalProperties": true
}
```

**Key Points:**
- **Expected Output**: `expected_result_description` contains the human-readable expected result
- **Evaluation Reference**: This serves as the "reference answer" for evaluators
- **Flexible Format**: Human language descriptions allow for semantic evaluation rather than exact matching
- **Evaluator Input**: This maps to `referenceOutputs` in our evaluator framework
- **Reference Key Mapping**: The `EXPECTED_OUTPUT` evaluator uses this field via the `referenceKey` parameter (see evaluator integration section below)
- **Language Verification**: Optional `expectedLanguage` field for LANGUAGE_VERIFICATION evaluator with intelligent fallback chain

## LangSmith Dataset Structure

### Example Structure
Each example in a LangSmith dataset contains:

```typescript
interface Example {
  id: UUID;                    // Unique identifier
  dataset_id: UUID;            // Parent dataset ID
  created_at: string;          // Creation timestamp
  modified_at?: string;        // Last modification timestamp
  
  inputs: KVMap;               // Input data (follows input schema)
  outputs?: KVMap;             // Expected outputs (follows output schema)
  metadata?: KVMap;            // Additional metadata
  
  // Optional fields
  attachments?: Record<string, AttachmentInfo>;
  source_run_id?: string;      // If derived from a run
  split?: string | string[];   // Dataset splits (train/test/etc)
}
```

### Dataset Metadata
```typescript
interface Dataset {
  id: string;
  name: string;
  description: string;
  tenant_id: string;
  created_at: string;
  modified_at: string;
  
  // Schema definitions
  inputs_schema_definition?: KVMap;   // Defines input structure
  outputs_schema_definition?: KVMap;  // Defines output structure
  
  // Statistics
  example_count?: number;
  session_count?: number;
  data_type?: DataType;
}
```

## How Evaluators Use Datasets

### Data Flow
1. **Dataset Example** → **Evaluation Run** → **Evaluator Assessment**
2. **Direct Input Access**: System uses standardized 'question' field → Rita graph input
3. **Output Comparison**: Rita response vs `expected_result_description`
4. **Scoring**: Evaluator assigns scores based on comparison

### Example Evaluation Flow
```typescript
// Dataset Example (standardized format)
const example = {
  inputs: {
    "question": "What are the company's vacation policies?",  // Required field
    "preferredLanguage": "DE"  // Optional: Override user's default language for this example
  },
  outputs: {
    "expected_result_description": "The system should provide information about vacation days, approval process, and policy details for the selected company.",
    "expectedLanguage": "DE"  // Optional: Expected response language for LANGUAGE_VERIFICATION evaluator
  }
};

// Rita Graph Execution (direct question access)
const question = example.inputs.question;  // Direct access to standardized field
if (!question || typeof question !== 'string') {
  throw new Error(`Input must contain a 'question' field with a string value. Available keys: ${Object.keys(example.inputs).join(', ')}`);
}

const ritaResponse = await graph.invoke({
  messages: [{ 
    role: 'user', 
    content: question
  }]
});

// Evaluator Assessment (direct input usage)
const evaluation = await evaluator({
  inputs: example.inputs,      // Inputs with standardized 'question' field
  outputs: { answer: ritaResponse.answer },
  referenceOutputs: example.outputs
});
```

## Schema Flexibility and Customization

> **Important**: Our current schema is not set in stone. When creating new evaluators or testing different scenarios, we can and should modify the dataset schema to better serve specific evaluation needs.

### Common Schema Variations

#### 1. **Multi-Input Scenarios**
```json
{
  "type": "object",
  "properties": {
    "human-input-question": { "type": "string" },
    "context": { "type": "string" },
    "company_id": { "type": "string" },
    "user_role": { "type": "string" }
  },
  "required": ["human-input-question"]
}
```

#### 2. **Structured Output Expectations**
```json
{
  "type": "object",
  "properties": {
    "expected_result_description": { "type": "string" },
    "expected_language": { "type": "string", "enum": ["EN", "DE"] },
    "expected_format": { "type": "string" },
    "expected_entities": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["expected_result_description"]
}
```

#### 3. **Evaluation-Specific Fields**
```json
{
  "type": "object",
  "properties": {
    "expected_result_description": { "type": "string" },
    "reference_answer": { "type": "string" },
    "expected_language": { "type": "string" },
    "difficulty_level": { "type": "string" },
    "category": { "type": "string" }
  }
}
```

### Schema Property Types

LangSmith supports rich JSON Schema types for dataset properties:

| Type | Description | Example |
|------|-------------|---------|
| `string` | Text data | `"What is the company policy?"` |
| `number` | Numeric values | `42`, `3.14` |
| `integer` | Whole numbers | `1`, `100` |
| `boolean` | True/false values | `true`, `false` |
| `array` | Lists of items | `["item1", "item2"]` |
| `object` | Nested structures | `{"key": "value"}` |
| `enum` | Restricted choices | `["EN", "DE"]` |

### Advanced Schema Features

#### **Conditional Requirements**
```json
{
  "type": "object",
  "properties": {
    "question": { "type": "string" },
    "language": { "type": "string", "enum": ["EN", "DE"] },
    "context": { "type": "string" }
  },
  "required": ["question"],
  "if": {
    "properties": { "language": { "const": "DE" } }
  },
  "then": {
    "required": ["context"]
  }
}
```

#### **Pattern Validation**
```json
{
  "type": "object",
  "properties": {
    "company_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
    }
  }
}
```

## Dataset Management Best Practices

### 1. **Schema Evolution**
- **Version Control**: When changing schemas, consider versioning datasets
- **Backward Compatibility**: Ensure existing evaluators can handle schema changes
- **Documentation**: Update this document when schemas change

### 2. **Example Quality**
- **Clear Descriptions**: `expected_result_description` should be specific and actionable
- **Consistent Format**: Maintain consistent language and structure across examples
- **Edge Cases**: Include examples that test boundary conditions

### 3. **Metadata Usage**
```typescript
const example = {
  inputs: { "human-input-question": "..." },
  outputs: { "expected_result_description": "..." },
  metadata: {
    "difficulty": "medium",
    "language": "DE",
    "category": "hr_policy",
    "company_type": "startup",
    "expected_tools": ["hr_database", "policy_search"],
    "dataset_split": ["train"],
    "created_by": "evaluator_team",
    "validation_status": "reviewed"
  }
}
```

### 4. **Dataset Splits**
Use splits to organize examples for different purposes:
- `"train"`: Training/calibration examples
- `"test"`: Final evaluation examples  
- `"validation"`: Development/tuning examples
- `"edge_cases"`: Boundary condition testing

## Integration with Evaluators

### Current Evaluator Expectations

#### **EXPECTED_OUTPUT**
- **Inputs**: Uses standardized `question` field directly
- **Outputs**: Rita's `answer`
- **Reference**: `expected_result_description` (accessed via `referenceKey: "expected_result_description"`)
- **Purpose**: Semantic comparison of actual vs expected results
- **Usage**:
  ```typescript
  const evaluator = createEvaluator(
    'EXPECTED_OUTPUT',
    undefined, // custom prompt (or LangSmith prompt via langsmithPromptName)
    undefined, // model  
    'expected_result_description' // reference key
  );
  ```

#### **LANGUAGE_VERIFICATION**
- **Inputs**: Uses standardized `question` field directly
- **Outputs**: Rita's `answer` + `preferredLanguage`
- **Reference**: `expectedLanguage` field (accessed via `referenceKey: "expectedLanguage"`)
- **Purpose**: Verify response language matches expected language
- **Language Fallback Chain**:
  1. `expectedLanguage` from output schema (if referenceKey provided)
  2. `preferredLanguage` from input schema (if present in example)
  3. User's authentication `preferredLanguage` (always available)
- **Usage**:
  ```typescript
  const evaluator = createEvaluator(
    'LANGUAGE_VERIFICATION',
    undefined, // custom prompt (or LangSmith prompt via langsmithPromptName)
    undefined, // model  
    'expectedLanguage' // reference key for output field
  );
  ```

### LangSmith Prompts Integration

Our evaluator system now supports fetching prompts directly from LangSmith, allowing for centralized prompt management and versioning.

#### **Using LangSmith Prompts**

Instead of defining prompts locally, you can reference prompts stored in your LangSmith workspace:

```typescript
// GraphQL mutation with LangSmith prompt
mutation {
  runEvaluationAsync(input: {
    graphName: rita
    datasetName: "test-dataset"
    evaluators: [{
      type: "EXPECTED_OUTPUT"
      langsmithPromptName: "evaluation-prompt-v2"  // Pull from LangSmith
    }, {
      type: "LANGUAGE_VERIFICATION"
      langsmithPromptName: "language-check-prompt"  // Different prompt for this evaluator
    }]
    selectedCompanyId: "company-123"
  }) {
    jobId
    status
  }
}
```

#### **Prompt Priority System**

The system follows this priority order when determining which prompt to use:

1. **Custom Prompt** (highest priority): If `customPrompt` is provided in GraphQL, it takes precedence
2. **LangSmith Prompt**: If `langsmithPromptName` is provided and no `customPrompt`, fetch from LangSmith
3. **Default Prompt** (lowest priority): Use the evaluator's built-in default prompt

#### **Available Prompts Query**

List available prompts in your LangSmith workspace:

```graphql
query {
  listLangSmithPrompts(input: { 
    query: "evaluation"  # Optional search filter
    isPublic: false      # Search private workspace prompts
  }) {
    prompts {
      id
      name
      fullName
      description
      owner
      isPublic
      numCommits
      updatedAt
    }
  }
}
```

#### **Prompt Usage Tracking**

The system tracks which prompts were actually used during evaluation:

```graphql
query {
  getEvaluationJobStatus(input: { jobId: "your-job-id" }) {
    jobId
    status
    usedPrompts  # JSON object mapping evaluator type to prompt source
    results {
      url
      experimentName
    }
  }
}
```

Example `usedPrompts` response:
```json
{
  "EXPECTED_OUTPUT": "LangSmith: evaluation-prompt-v2",
  "LANGUAGE_VERIFICATION": "Default evaluator prompt"
}
```

### Adding New Evaluator Requirements

When creating new evaluators, consider:

1. **Input Requirements**: What data do you need from the dataset?
2. **Output Structure**: How should Rita's response be formatted?
3. **Reference Data**: What baseline/expected values do you need?
4. **Schema Updates**: Do you need new input/output fields?
5. **Template Format**: Use `{inputs}`, `{outputs}`, `{reference_outputs}` in prompts, NOT `{inputs.field}`
6. **Prompt Management**: Consider creating reusable prompts in LangSmith for consistency

### Critical Template Format Rules ⚠️

**OpenEvals/LangChain Template Requirements:**

✅ **Correct - Use complete objects:**
```typescript
const PROMPT = `
<input>
{inputs}
</input>

<actual_output>
{outputs}
</actual_output>

<expected_output>
{reference_outputs}
</expected_output>
`;
```

❌ **Incorrect - Don't use nested properties:**
```typescript
const PROMPT = `
Question: {inputs.question}          // ❌ Causes template errors
Answer: {outputs.answer}             // ❌ Causes template errors
Reference: {reference_outputs.ref}   // ❌ Causes template errors
`;
```

**Why this matters:**
- OpenEvals passes complete objects to the template engine
- Our input normalization ensures all required fields are present in the objects
- The LLM receives the full context and can extract what it needs
- This prevents "Missing value for input variable" errors

#### Example: Adding a new evaluator
```typescript
// New evaluator needs tool usage information
const newSchema = {
  outputs: {
    "expected_result_description": { "type": "string" },
    "expected_tools": { 
      "type": "array",
      "items": { "type": "string" },
      "description": "Tools that should be used to answer this question"
    }
  }
};
```

## Creating New Datasets

### Programmatic Creation
```typescript
// Using LangSmith client
const client = new Client();

const dataset = await client.createDataset("New Rita Dataset", {
  description: "Dataset for testing new Rita capabilities",
  inputs_schema_definition: inputSchema,
  outputs_schema_definition: outputSchema
});

const examples = [
  {
    inputs: { "human-input-question": "..." },
    outputs: { "expected_result_description": "..." },
    metadata: { /* ... */ }
  }
];

await client.createExamples({ 
  datasetId: dataset.id, 
  examples 
});
```

### Schema Validation
LangSmith automatically validates examples against the defined schema:
- **Required Fields**: Must be present in every example
- **Type Checking**: Values must match specified types
- **Format Validation**: Patterns and constraints are enforced

## Troubleshooting

### Common Issues

1. **Schema Mismatch**: Evaluator expects different input/output structure
   - **Solution**: Update dataset schema or evaluator expectations

2. **Missing Required Fields**: Examples don't include required properties
   - **Solution**: Add missing fields or make them optional in schema

3. **Type Errors**: Data doesn't match schema types
   - **Solution**: Convert data or update schema types

4. **Missing Question Field**: Evaluation fails because `question` field is not found
   - **Solution**: Ensure your dataset uses the standardized `question` field name

5. **LangSmith Prompt Errors**: Evaluator fails to fetch prompt from LangSmith
   - **Solution**: Verify prompt name exists in your workspace and check LangSmith API credentials

### Debugging Dataset Issues

```typescript
// Check dataset schema
const dataset = await client.readDataset({ datasetName: "Your Dataset" });
console.log("Input Schema:", dataset.inputs_schema_definition);
console.log("Output Schema:", dataset.outputs_schema_definition);

// Validate examples
const examples = client.listExamples({ datasetName: "Your Dataset" });
for (const example of examples) {
  console.log("Example:", example.inputs, example.outputs);
}
```

## Future Considerations

### Potential Schema Enhancements
- **Multi-language Support**: Structured language preferences
- **Context Information**: Company-specific context data
- **Tool Expectations**: Expected tool usage patterns
- **Response Format**: Structured response requirements
- **Evaluation Metrics**: Custom scoring criteria per example

### Integration Opportunities
- **Automated Schema Generation**: From evaluator requirements
- **Schema Migration Tools**: For updating existing datasets
- **Validation Pipelines**: Automated example quality checking
- **Version Management**: Schema and dataset versioning

---

This document should be updated whenever we modify dataset schemas or add new evaluation requirements. For questions about dataset structure or schema modifications, refer to the LangSmith documentation or consult with the evaluation team.