# LangSmith Evaluators Implementation

A type-safe, extensible evaluator system built on top of LangSmith SDK and OpenEvals, designed for rigorous AI application evaluation with strong TypeScript typing and factory/registry pattern architecture.

## Quick Overview

This implementation follows a **factory/registry pattern** providing:
- **Type Safety**: Strongly typed evaluators with generic interfaces
- **Extensibility**: Easy addition of new evaluators through registration
- **Clean Architecture**: Separation between core framework and implementations
- **Flexible Configuration**: Model selection, custom prompts, and LangSmith prompt support
- **Simplified Input Handling**: Standardized on 'question' field for consistent data processing

## Directory Structure

```
evaluators/
├── core/                     # Framework core
│   ├── factory.ts           # Evaluator factory with type safety
│   ├── registry.ts          # Central evaluator registry
│   └── types.ts            # Type definitions and interfaces
├── implementations/         # Concrete evaluator implementations
│   ├── expected-output.evaluator.ts       # Production evaluator
│   └── language-verification.evaluator.ts # Language validation evaluator
├── prompts/                # Default LLM prompts for evaluators
│   ├── expected-output.prompt.ts
│   └── language-verification.prompt.ts
└── index.ts               # Public API exports
```

<details>
<summary><strong>Architecture Deep Dive</strong></summary>

### 1. Type System (`core/types.ts`)

**Generic Evaluator Interface**:
```typescript
interface Evaluator<TInputs, TOutputs, TReferenceOutputs> {
  readonly config: EvaluatorConfig;
  evaluate(
    params: EvaluatorParams<TInputs, TOutputs, TReferenceOutputs>,
    options?: EvaluationOptions
  ): Promise<EvaluatorResult>;
}
```

**Key Type Features**:
- `ModelIdentifier`: Union type for supported models (`openai:gpt-4o`, `anthropic:claude-3-5-sonnet-20241022`)
- `EvaluatorParams<T>`: Generic parameters with type constraints
- `EvaluatorResult`: Standardized result format compatible with OpenEvals
- `TypedEvaluator<TType>`: Strongly typed evaluator implementations

### 2. Registry System (`core/registry.ts`)

**Singleton Pattern with Static Methods**:
```typescript
export class EvaluatorRegistry {
  private static readonly evaluators = new Map<string, Evaluator>();
  
  static register<T extends Evaluator>(evaluator: T): void
  static get(type: string): Evaluator
  static has(type: string): boolean
  // ...
}
```

**Features**:
- **Singleton**: Global registry accessible throughout application
- **Type Erasure**: Maintains runtime flexibility while preserving compile-time safety
- **Validation**: Prevents duplicate registrations
- **Auto-registration**: Static block automatically registers implementations

### 3. Factory Pattern (`core/factory.ts`)

**Factory Function**:
```typescript
export function createEvaluator(
  type: string,
  customPrompt?: string,          // Custom prompt text (highest priority)
  model?: ModelIdentifier,        // Model override
  referenceKey?: string,          // Reference output key
): EvaluatorFunction

// Note: LangSmith prompts are handled at the GraphQL layer via langsmithPromptName
```

**Features**:
- **Configuration Binding**: Creates pre-configured evaluator functions
- **Validation**: Runtime type checking and error handling
- **Immutable Options**: Frozen configuration objects
- **Dynamic Type Generation**: Runtime type derivation from registry

</details>

<details>
<summary><strong>Directory Structure Explained</strong></summary>

### `/core/` - Framework Infrastructure

- **`types.ts`**: Complete type system including model providers, evaluation parameters, results, and configuration interfaces
- **`registry.ts`**: Central registry managing all evaluator implementations with singleton pattern
- **`factory.ts`**: Factory functions for creating configured evaluator instances with type safety

### `/implementations/` - Concrete Evaluators

- **`expected-output.evaluator.ts`**: Production-ready evaluator comparing actual vs expected outputs
- **`language-verification.evaluator.ts`**: Evaluator for verifying response language correctness

### `/prompts/` - LLM Instructions

- **`expected-output.prompt.ts`**: Carefully crafted prompt for output comparison with rubric and instructions
- **`language-verification.prompt.ts`**: Prompt for verifying response language matches expected language

### Root Files

- **`index.ts`**: Public API surface with selective exports
- **`README.md`**: This documentation file

</details>

## How to Add a New Evaluator: Step-by-Step Guide

### Step 1: Define Your Evaluator Types

Create specific TypeScript interfaces for your evaluator:

```typescript
// Define specific input/output types
interface MyEvaluatorInputs extends TextEvaluationInputs {
  readonly question: string;  // Required standardized field
  readonly context?: string;
}

interface MyEvaluatorOutputs extends TextEvaluationOutputs {
  readonly answer: string;
  readonly confidence?: number;
}

interface MyEvaluatorReferenceOutputs {
  readonly expectedAnswer: string;
  readonly acceptableAlternatives?: string[];
}
```

### Step 2: Create the Evaluator Implementation

Create a new file in `implementations/` (e.g., `my-evaluator.evaluator.ts`):

```typescript
import type { EvaluatorResult as OpenEvalsResult } from 'openevals';
import { 
  TypedEvaluator, 
  EvaluatorParams, 
  EvaluatorResult, 
  EvaluationOptions 
} from '../core/types';

// Your prompt (can be in separate file under /prompts/)
// IMPORTANT: Use {inputs}, {outputs}, {reference_outputs} - NOT {inputs.field}
const MY_EVALUATOR_PROMPT = `You are evaluating...

<input>
{inputs}
</input>

<actual_output>
{outputs}
</actual_output>

<expected_output>
{reference_outputs}
</expected_output>`;

export const myEvaluator: TypedEvaluator<
  'MY_EVALUATOR',  // Unique type identifier
  MyEvaluatorInputs,
  MyEvaluatorOutputs,
  MyEvaluatorReferenceOutputs
> = {
  config: {
    type: 'MY_EVALUATOR',
    name: 'My Custom Evaluator',
    description: 'Evaluates something specific to my use case',
    defaultModel: 'openai:gpt-4o',
    supportsCustomPrompt: true,
    supportsReferenceKey: true,
  } as const,
  
  async evaluate(
    params: EvaluatorParams<MyEvaluatorInputs, MyEvaluatorOutputs, MyEvaluatorReferenceOutputs>,
    options: EvaluationOptions = {}
  ): Promise<EvaluatorResult> {
    const { customPrompt, model, referenceKey } = options;
    
    // Import LLM judge from OpenEvals
    const { createLLMAsJudge } = await import('openevals');
    
    // Handle reference outputs
    const referenceOutputs = params.referenceOutputs
      ? {
          reference: params.referenceOutputs[referenceKey || 'expectedAnswer'],
        }
      : undefined;

    // Create LLM judge
    const evaluator = createLLMAsJudge({
      prompt: customPrompt || MY_EVALUATOR_PROMPT,
      model: model || this.config.defaultModel,
      feedbackKey: 'my_evaluator',
    });

    // Execute evaluation directly with params.inputs (expects 'question' field)
    const result = await evaluator({
      inputs: params.inputs,
      outputs: params.outputs,
      referenceOutputs,
    }) as OpenEvalsResult;

    return {
      key: result.key,
      score: result.score,
      comment: result.comment,
      metadata: result.metadata,
    };
  },
} as const;
```

### Step 3: Register the Evaluator

Add your evaluator to the registry in `core/registry.ts`:

```typescript
import { myEvaluator } from '../implementations/my-evaluator.evaluator';

export class EvaluatorRegistry {
  // ...
  static {
    // Register all evaluators
    this.register(expectedOutputEvaluator);
    this.register(myEvaluator);  // Add this line
  }
  // ...
}
```

### Step 4: Export from Public API

Add the export to `index.ts`:

```typescript
// Implementation exports
export * from './implementations/expected-output.evaluator';
export * from './implementations/my-evaluator.evaluator';  // Add this line
```

### Step 5: Usage Examples

Your evaluator is now available through the factory system:

```typescript
import { createEvaluator, getAvailableEvaluators } from './evaluators';

// Check available evaluators
console.log(getAvailableEvaluators());

// Create evaluator instance
const evaluator = createEvaluator(
  'MY_EVALUATOR',
  customPrompt,      // optional
  'openai:gpt-4o',   // optional
  'expectedAnswer'   // optional reference key
);

// Use in evaluation
const result = await evaluator({
  inputs: { question: "What is 2+2?", context: "Math problem" },
  outputs: { answer: "4", confidence: 0.95 },
  referenceOutputs: { expectedAnswer: "4" }
});
```

<details>
<summary><strong>Implementation Best Practices</strong></summary>

### 1. Strong Typing
- Always extend base interfaces (`TextEvaluationInputs`, `CodeEvaluationInputs`)
- Use `readonly` for immutable properties
- Leverage `as const` for configuration objects

### 2. Error Handling
- Validate required parameters in evaluate function
- Use descriptive error messages with available options
- Handle OpenEvals result transformation safely

### 3. Configuration
- Provide sensible defaults for model selection
- Support both custom prompts and reference keys when applicable
- Use frozen objects for immutable configuration

### 4. Documentation
- Document evaluator purpose and expected input/output formats
- Provide usage examples in implementation files
- Include rubric information in prompts

### 5. Testing Considerations
- Each evaluator should handle missing reference outputs gracefully
- Test with various model providers
- Validate type safety at compile time

### 6. Template Format Requirements ⚠️
**CRITICAL**: OpenEvals templates must use object-level placeholders, not nested properties:

✅ **Correct:**
```typescript
const PROMPT = `
<input>{inputs}</input>
<output>{outputs}</output>
<reference>{reference_outputs}</reference>
`;
```

❌ **Incorrect (will cause "Missing value for input variable" errors):**
```typescript
const PROMPT = `
<input>{inputs.question}</input>  // Don't do this!
<output>{outputs.answer}</output>  // Don't do this!
`;
```

**Why:** OpenEvals/LangChain expects complete objects, not individual properties. The input normalization system ensures all required fields are present in the objects.

</details>

## LangSmith Prompts Integration

The evaluator system now supports fetching prompts directly from LangSmith, providing centralized prompt management and versioning capabilities.

### Using LangSmith Prompts

Instead of using local default prompts, you can reference prompts stored in your LangSmith workspace:

```typescript
// GraphQL mutation using LangSmith prompts
mutation {
  runEvaluationAsync(input: {
    graphName: rita
    datasetName: "test-dataset"
    evaluators: [{
      type: "EXPECTED_OUTPUT"
      langsmithPromptName: "evaluation-prompt-v2"  // Pull from LangSmith
    }, {
      type: "LANGUAGE_VERIFICATION"
      customPrompt: "Custom prompt text..."        // Use custom prompt instead
    }]
    selectedCompanyId: "company-123"
  }) {
    jobId
    status
  }
}
```

### Prompt Priority System

The system follows this priority order when determining which prompt to use:

1. **Custom Prompt** (highest): If `customPrompt` is provided, it takes precedence
2. **LangSmith Prompt**: If `langsmithPromptName` is provided and no `customPrompt`, fetch from LangSmith
3. **Default Prompt** (lowest): Use the evaluator's built-in default prompt from `/prompts/`

### Available Prompts Query

Query available prompts in your LangSmith workspace:

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

### Prompt Usage Tracking

Track which prompts were actually used during evaluation:

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

## LangSmith Evaluation Integration

This evaluator system integrates seamlessly with LangSmith's evaluation framework:

```typescript
import { evaluate } from 'langsmith/evaluation';
import { createEvaluator } from './evaluators';

// Create evaluator function
const myEvaluator = createEvaluator('MY_EVALUATOR');

// Use with LangSmith evaluate
const results = await evaluate(
  targetFunction,
  {
    data: dataset,
    evaluators: [myEvaluator],
    experimentPrefix: "My Experiment"
  }
);
```

<details>
<summary><strong>Advanced Features</strong></summary>

### Dynamic Model Selection
```typescript
const evaluator = createEvaluator(
  'EXPECTED_OUTPUT',
  undefined,  // use default prompt
  'anthropic:claude-3-5-sonnet-20241022'  // override model
);
```

### Custom Reference Keys
```typescript
const evaluator = createEvaluator(
  'EXPECTED_OUTPUT',
  undefined,
  undefined,
  'gold_standard'  // custom reference key
);
```

### Runtime Type Information
```typescript
import { getEvaluatorInfo, EVALUATOR_INFO } from './evaluators';

// Get info about specific evaluator
const info = getEvaluatorInfo('MY_EVALUATOR');
console.log(info?.supportsCustomPrompt);

// Access all evaluator metadata
console.log(EVALUATOR_INFO);
```

</details>

---

This architecture provides a robust foundation for building and maintaining a comprehensive evaluation suite for LangSmith applications while maintaining type safety and extensibility.