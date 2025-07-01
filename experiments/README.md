# LangSmith Experiments GraphQL API

This GraphQL API provides endpoints for running evaluations and querying experiments from LangSmith.

## Setup

Make sure you have the required environment variables set:

```bash
export LANGSMITH_API_KEY="your-api-key-here"
export LANGSMITH_ENDPOINT="https://eu.api.smith.langchain.com"  # For EU region, or use US default
```

## Available Queries

### Health Check

```graphql
query {
  healthCheck
}
```

### Get Dataset Experiments

Get a list of experiments (sessions) that have been run on a specific dataset:

```graphql
query GetDatasetExperiments($input: GetDatasetExperimentsInput!) {
  getDatasetExperiments(input: $input) {
    total
    experiments {
      id
      name
      startTime
      endTime
      description
      runCount
      totalTokens
      promptTokens
      completionTokens
      totalCost
      promptCost
      completionCost
      errorRate
      latencyP50
      latencyP99
      feedbackStats
      testRunNumber
      metadata
    }
  }
}
```

**Variables:**
```json
{
  "input": {
    "datasetId": "517d03cc-a57a-42a9-a346-402c78f8997a",
    "offset": 0,
    "limit": 10,
    "sortBy": "start_time",
    "sortByDesc": true
  }
}
```

### Run Evaluation

Run an evaluation on a graph against a dataset:

```graphql
mutation RunEvaluation($input: RunEvaluationInput!) {
  runEvaluation(input: $input) {
    url
    experimentName
    results {
      id
      inputs
      outputs
      startTime
      endTime
      latency
      totalTokens
      scores {
        key
        score
        comment
      }
    }
  }
}
```

**Variables:**
```json
{
  "input": {
    "graphName": "multi_agent_dynamic",
    "datasetName": "your-dataset-name",
    "evaluators": [
      {
        "type": "CORRECTNESS",
        "model": "openai:gpt-4o"
      }
    ],
    "experimentPrefix": "my-experiment"
  }
}
```

## Usage Examples

### Using with curl

```bash
# Get dataset experiments
curl -X POST \
  http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token-here" \
  -d '{
    "query": "query GetDatasetExperiments($input: GetDatasetExperimentsInput!) { getDatasetExperiments(input: $input) { total experiments { id name startTime runCount totalTokens errorRate } } }",
    "variables": {
      "input": {
        "datasetId": "517d03cc-a57a-42a9-a346-402c78f8997a",
        "limit": 5
      }
    }
  }'
```

### Using with Postman or Retool

1. Set the URL to `http://localhost:4000/graphql`
2. Set method to `POST`
3. Add Authorization header: `Bearer your-token-here`
4. Use the GraphQL query and variables shown above

## Features

- **Streaming Support**: The API handles LangSmith's Server-Sent Events streaming responses
- **EU Region Support**: Automatically detects and handles EU API endpoints
- **Pagination**: Supports offset/limit pagination for large datasets
- **Sorting**: Configurable sorting by various fields
- **Rich Metadata**: Returns detailed experiment statistics including costs, tokens, latency, and feedback

## Error Handling

The API includes comprehensive error handling for:
- Invalid dataset IDs
- Network timeouts
- Authentication failures
- Malformed streaming responses

All errors are returned as GraphQL errors with descriptive messages. 