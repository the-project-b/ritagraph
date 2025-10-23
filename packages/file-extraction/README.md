# @the-project-b/file-extraction

Domain-Driven Design package for extracting text from documents using AWS Textract and other extraction services.

## Features

- AWS Textract integration (async-only via StartDocumentAnalysis)
- Multi-format support (PDF, JPEG, PNG, TIFF)
- Archive handling (zip extraction with depth/file limits)
- Dual extraction patterns:
  - **Blocking**: `extractText()` waits for job completion
  - **Non-blocking**: Job-based pattern with status polling
- GraphQL integration for attachment metadata
- Retry logic with exponential backoff
- Cost tracking and confidence scoring
- Interactive CLI tool for testing
- Adapter pattern for extensibility

## Architecture

Follows strict Domain-Driven Design principles:

- **Domain Layer**: Pure business logic (entities, value objects, repository interfaces)
- **Application Layer**: Use cases and orchestration
- **Infrastructure Layer**: External integrations (AWS SDK, adapters, repositories)

## Usage

### CLI Tool

Extract attachment text interactively:

```bash
npm run extract

# Follow prompts for:
# - GraphQL endpoint
# - Auth token
# - Attachment ID
# - Output format (json/markdown/text)

# Results automatically saved to: extraction-{attachmentId}-{timestamp}.json
```

### Programmatic Usage

```typescript
import {
  ExtractAttachmentsUseCase,
  TextractAdapter,
  S3Client,
  GraphQLAttachmentRepository,
} from "@the-project-b/file-extraction";

const s3Client = new S3Client();
const textractAdapter = new TextractAdapter(s3Client);
const attachmentRepository = new GraphQLAttachmentRepository(
  graphqlEndpoint,
  authToken
);

const useCase = new ExtractAttachmentsUseCase(
  attachmentRepository,
  textractAdapter
);

const result = await useCase.execute({
  attachmentIds: ["att_123"],
  authToken: "your-auth-token",
  config: {
    detailLevel: "hybrid",
    retryConfig: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
  },
  companyId: "company_123",
  userId: "user_123",
});
```

## Extraction Patterns

### Blocking Pattern

Use `extractText()` when you need immediate results:

```typescript
const result = await textractAdapter.extractText(buffer, "file.pdf");
// Waits for Textract job to complete, polls every 2 seconds
```

### Non-Blocking Pattern

Use job-based methods for LangGraph integration:

```typescript
// Start job
const jobResult = await textractAdapter.startExtractionJob(
  s3Location,
  "file.pdf"
);

// Check status later
const status = await textractAdapter.getExtractionJobStatus(jobId);

// Get results when ready
const results = await textractAdapter.getExtractionJobResult(jobId);
```

## Configuration

See `.env.example` for required environment variables:
- `AWS_REGION`: AWS region for S3 and Textract (default: eu-central-1)
- `PROJECTB_GRAPHQL_ENDPOINT`: Backend GraphQL API endpoint
- Auth tokens passed at runtime via DTO
