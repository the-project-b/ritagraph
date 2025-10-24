# @the-project-b/file-extraction

Domain-Driven Design package for extracting text from documents using AWS Textract and other extraction services.

## Features

- AWS Textract integration (async-only via StartDocumentAnalysis)
- Multi-format support (PDF, JPEG, PNG, TIFF)
- Archive handling (zip extraction with depth/file limits)
- Dual extraction patterns:
  - **Blocking**: `extractText()` waits for job completion
  - **Non-blocking**: Job-based pattern with status polling
- GraphQL integration for attachment metadata pulling from our backend
- Retry logic with exponential backoff, fully configurable if needed
- Cost tracking and confidence scoring
- Interactive CLI tool for testing `npm run extract`
- Adapter pattern for extensibility

Example output: `packages/file-extraction/extraction-cmgz6qntm0008xzodncq174qi-1761231410094.json`

## Local testing

Want to test this without all the attachment and emailing and stuff but just referencing a local file?
`npm run extract:file ~/Downloads/INV25_0010.pdf`

## Usage

### CLI Tool

Extract attachment text interactively, pretty cool stuff for local testing (does require you to actually have some attachments available in the database)

```bash
npm run extract

# Follow prompts for:
# - Attachment ID
# - Username / password

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

Use job-based methods, this is where the services shines for integration into a graph, we can build a 'waiting' node that does this waiting for completion while communicating this status over the stream.

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
