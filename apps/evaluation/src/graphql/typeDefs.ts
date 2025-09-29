import gql from "graphql-tag";
import { generateFeedbackStatsType } from "./dynamic-schema.js";

export const typeDefs = gql`
  # Custom scalar for JSON data
  scalar JSON

  # Enum for the available graphs, mirroring what's in the rita package
  enum GraphName {
    "The primary multi-agent graph"
    multi_agent
    "The dynamic multi-agent graph"
    multi_agent_dynamic
    "The rita graph"
    rita
  }

  # Evaluator types are dynamically registered
  # Use getAvailableEvaluators query to see all available types

  # Input type for specifying an evaluator and its configuration
  input EvaluatorInput {
    "The type of evaluator to run (e.g., 'EXPECTED_OUTPUT')"
    type: String!
    "An optional custom prompt to override the evaluator's default"
    customPrompt: String
    "An optional LangSmith prompt name to pull and use instead of the default prompt"
    langsmithPromptName: String
    "An optional model name to override the evaluator's default (e.g., 'openai:gpt-4')"
    model: String
    "An optional key to specify the reference answer in the dataset's outputs"
    referenceKey: String
  }

  # The main input for running an evaluation
  input RunEvaluationInput {
    "The name of the graph to evaluate"
    graphName: GraphName!
    "The name of the dataset in LangSmith to use for the evaluation"
    datasetName: String!
    "Optional list of dataset splits to include (e.g., ['train', 'test']). If omitted, all examples are used"
    splits: [String!]
    "A list of evaluators to run against the graph's outputs"
    evaluators: [EvaluatorInput!]!
    "An optional prefix for the experiment name in LangSmith"
    experimentPrefix: String
    "The ID of the company to use for the evaluation"
    selectedCompanyId: String!
    "The preferred language to use for the evaluation"
    preferredLanguage: String
    "Maximum number of dataset examples to process concurrently within each experiment (default: 10)"
    maxConcurrency: Int
    "Number of times to run each example in the dataset for more reliable results (default: 1)"
    numRepetitions: Int
  }

  # Input type for getting dataset experiments
  input GetDatasetExperimentsInput {
    "The ID of the dataset to get experiments for"
    datasetId: String!
    "Offset for pagination (default: 0)"
    offset: Int
    "Number of experiments to return (default: 10)"
    limit: Int
    "Field to sort by (default: 'start_time')"
    sortBy: String
    "Whether to sort in descending order (default: true)"
    sortByDesc: Boolean
  }

  # Input type for getting single experiment details
  input GetExperimentDetailsInput {
    "The ID of the experiment/session to get details for"
    experimentId: String!
    "Number of runs to return (default: 50)"
    limit: Int
    "Offset for pagination (default: 0)"
    offset: Int
  }

  # Represents the score and feedback from a single evaluator on a single run.
  type Score {
    "The name of the metric being evaluated (e.g., correctness)."
    key: String!
    "The numerical or boolean score given by the evaluator."
    score: String!
    "The reasoning or comments provided by the evaluator for the score."
    comment: String
  }

  # Represents all the detailed results for a single run within an experiment.
  type RunResult {
    "The unique identifier of the run."
    id: ID!
    "A JSON string representing the inputs provided to this run."
    inputs: String!
    "A JSON string representing the final output of this run."
    outputs: String
    "The timestamp when the run started."
    startTime: String!
    "The timestamp when the run ended."
    endTime: String!
    "The total duration of the run in milliseconds."
    latency: Float!
    "The total number of tokens used in the run."
    totalTokens: Int!
    "A list of scores from all evaluators for this run."
    scores: [Score!]
  }

  # The top-level response object for an evaluation run.
  type EvaluationResult {
    "The direct URL to the experiment results page in LangSmith."
    url: String!
    "The name assigned to the experiment in LangSmith."
    experimentName: String!
    "The unique identifier of the experiment in LangSmith."
    experimentId: String!
    "An array containing the detailed results for each individual run within the experiment."
    results: [RunResult!]
  }

  # Enum for evaluation job status
  enum EvaluationJobStatus {
    "Job is queued and waiting to start"
    QUEUED
    "Job is currently running"
    RUNNING
    "Job completed successfully"
    COMPLETED
    "Job failed with an error"
    FAILED
    "Job was cancelled"
    CANCELLED
  }

  # Response for async evaluation job creation
  type AsyncEvaluationResult {
    "Unique identifier for the evaluation job"
    jobId: String!
    "Current status of the evaluation job"
    status: EvaluationJobStatus!
    "The experiment name that will be created"
    experimentName: String!
    "The unique identifier of the experiment in LangSmith (available when job is completed)"
    experimentId: String
    "Message describing the current state"
    message: String!
    "URL to monitor the job progress (when available)"
    url: String
    "Timestamp when the job was created"
    createdAt: String!
  }

  # Input for getting evaluation job status
  input GetEvaluationJobStatusInput {
    "The job ID to check status for"
    jobId: String!
  }

  # Detailed job status with progress information
  type EvaluationJobDetails {
    "Unique identifier for the evaluation job"
    jobId: String!
    "Current status of the evaluation job"
    status: EvaluationJobStatus!
    "The experiment name"
    experimentName: String!
    "The unique identifier of the experiment in LangSmith (available when job is completed)"
    experimentId: String
    "Message describing the current state"
    message: String!
    "URL to view results (when available)"
    url: String
    "Timestamp when the job was created"
    createdAt: String!
    "Timestamp when the job was last updated"
    updatedAt: String!
    "Progress information (0-100)"
    progress: Int
    "Number of examples processed"
    processedExamples: Int
    "Total number of examples to process"
    totalExamples: Int
    "Error message if job failed"
    errorMessage: String
    "The complete evaluation results (only when status is COMPLETED)"
    results: EvaluationResult
    "Information about the prompts used for each evaluator"
    usedPrompts: JSON
  }

  # Input type for deleting all runs in an experiment
  input DeleteExperimentRunsInput {
    "The ID of the experiment/session to delete runs from"
    experimentId: String!
  }

  # Result of deleting experiment runs
  type DeleteExperimentRunsResult {
    "Whether the deletion was successful"
    success: Boolean!
    "A message describing the result"
    message: String!
    "The number of runs that were deleted (if available)"
    deletedCount: Int
  }

  # Response type for dataset experiments query
  type DatasetExperimentsResponse {
    "List of experiments for the dataset."
    experiments: [DatasetExperiment!]!
    "Total number of experiments available."
    total: Int!
  }

  # Represents feedback statistics for an evaluator
  type EvaluatorFeedback {
    "Number of evaluations"
    n: Int!
    "Average score"
    avg: Float!
    "Standard deviation"
    stdev: Float!
    "Number of errors"
    errors: Int!
    "Additional values (flexible JSON object)"
    values: String
  }

  ${generateFeedbackStatsType()}

  # Represents the source of feedback (human, model, etc.)
  type FeedbackSource {
    "The type of feedback source (e.g., 'model', 'human')"
    type: String!
    "Additional metadata about the feedback source"
    metadata: JSON
    "User ID if feedback came from a human"
    userId: String
    "User name if feedback came from a human"
    userName: String
  }

  # Represents individual feedback on a run
  type Feedback {
    "Unique identifier for this feedback"
    id: ID!
    "When the feedback was created"
    createdAt: String!
    "When the feedback was last modified"
    modifiedAt: String!
    "The key/name of the feedback metric (e.g., 'correctness')"
    key: String!
    "The numerical score (e.g., 0, 1, 0.5)"
    score: Float
    "Additional value data for the feedback"
    value: JSON
    "Detailed comment/reasoning from the evaluator"
    comment: String
    "Any correction provided"
    correction: String
    "Group ID if this feedback is part of a group"
    feedbackGroupId: String
    "Comparative experiment ID if applicable"
    comparativeExperimentId: String
    "The run this feedback is for"
    runId: String!
    "The session this feedback belongs to"
    sessionId: String!
    "The trace ID for this feedback"
    traceId: String!
    "Start time of the run this feedback is for"
    startTime: String!
    "Source information for this feedback"
    feedbackSource: FeedbackSource!
    "Additional metadata"
    extra: JSON
  }

  # Represents a dataset experiment/session in LangSmith
  type DatasetExperiment {
    "The unique identifier of the experiment/session."
    id: ID!
    "The name of the experiment/session."
    name: String!
    "The timestamp when the experiment started."
    startTime: String!
    "The timestamp when the experiment ended."
    endTime: String
    "Optional description of the experiment."
    description: String
    "The number of runs in this experiment."
    runCount: Int
    "The total number of tokens used across all runs."
    totalTokens: Int
    "The total number of prompt tokens used."
    promptTokens: Int
    "The total number of completion tokens used."
    completionTokens: Int
    "The total cost of all runs in the experiment."
    totalCost: Float
    "The total cost of prompt tokens."
    promptCost: Float
    "The total cost of completion tokens."
    completionCost: Float
    "The error rate across all runs (0.0 to 1.0)."
    errorRate: Float
    "The 50th percentile latency in seconds."
    latencyP50: Float
    "The 99th percentile latency in seconds."
    latencyP99: Float
    "Feedback statistics for this experiment."
    feedbackStats: FeedbackStats
    "The test run number for this experiment."
    testRunNumber: Int
    "Additional metadata for the experiment."
    metadata: String
  }

  # Represents a single run within an experiment
  type Run {
    "The unique identifier of the run."
    id: ID!
    "The name of the run."
    name: String!
    "The type of run (e.g., 'llm', 'chain', 'tool')."
    runType: String!
    "The timestamp when the run started."
    startTime: String!
    "The timestamp when the run ended."
    endTime: String
    "The duration of the run in milliseconds."
    latency: Float
    "The inputs provided to this run as a JSON object."
    inputs: JSON
    "The outputs generated by this run as a JSON object."
    outputs: JSON
    "Short preview text of the inputs."
    inputsPreview: String
    "Short preview text of the outputs."
    outputsPreview: String
    "Any error that occurred during the run."
    error: String
    "The parent run ID if this is a child run."
    parentRunId: String
    "Whether this is a root run (no parent)."
    isRoot: Boolean!
    "The total number of tokens used."
    totalTokens: Int
    "The number of prompt tokens used."
    promptTokens: Int
    "The number of completion tokens used."
    completionTokens: Int
    "The total cost of this run."
    totalCost: Float
    "The cost of prompt tokens."
    promptCost: Float
    "The cost of completion tokens."
    completionCost: Float
    "Additional metadata for the run as a JSON object."
    metadata: JSON
    "Tags associated with the run."
    tags: [String!]
    "The example ID this run was executed against (for evaluations)."
    referenceExampleId: String
    "The trace ID for this run."
    traceId: String
    "The dotted order path for this run."
    dottedOrder: String
    "The status of the run (e.g., 'success', 'error')."
    status: String
    "The execution order of this run."
    executionOrder: Int
    "Feedback statistics for this individual run."
    feedbackStats: FeedbackStats
    "The app path/URL for this run in LangSmith."
    appPath: String
    "The session ID this run belongs to."
    sessionId: String
    "Feedback entries for this run (lazily loaded)"
    feedback: [Feedback!]
  }

  # Detailed information about a single experiment with its runs
  type ExperimentDetails {
    "The experiment information."
    experiment: DatasetExperiment!
    "The runs that belong to this experiment."
    runs: [Run!]!
    "Total number of runs in the experiment."
    totalRuns: Int!
  }

  # Information about an available evaluator
  type EvaluatorInfo {
    "The evaluator type identifier"
    type: String!
    "Human-readable name of the evaluator"
    name: String!
    "Description of what this evaluator measures"
    description: String!
    "The default model used by this evaluator"
    defaultModel: String!
    "Whether this evaluator supports custom prompts"
    supportsCustomPrompt: Boolean!
    "Whether this evaluator supports reference key specification"
    supportsReferenceKey: Boolean!
  }

  # Response type for available evaluators query
  type AvailableEvaluatorsResponse {
    "List of available evaluators with their metadata"
    evaluators: [EvaluatorInfo!]!
  }

  # Information about an available company
  type CompanyInfo {
    "The unique identifier of the company"
    companyId: String!
    "The display name of the company"
    companyName: String!
    "The avatar URL for the company"
    companyAvatarUrl: String
    "The user's role in this company"
    role: String!
  }

  # Response type for available companies query
  type AvailableCompaniesResponse {
    "List of companies the authenticated user has access to"
    companies: [CompanyInfo!]!
  }

  # Information about a LangSmith prompt
  type LangSmithPrompt {
    "Unique identifier for the prompt"
    id: String!
    "Name of the prompt"
    name: String!
    "Description of the prompt"
    description: String
    "Whether the prompt is public"
    isPublic: Boolean!
    "Number of commits to this prompt"
    numCommits: Int!
    "Number of likes this prompt has"
    numLikes: Int!
    "Last updated timestamp"
    updatedAt: String!
    "Owner of the prompt"
    owner: String!
    "Full name including owner (e.g., 'owner/prompt-name')"
    fullName: String!
    "Tags associated with the prompt"
    tags: [String!]
  }

  # Brief job information for listing
  type JobSummary {
    "Unique identifier for the job"
    jobId: String!
    "Current status of the job"
    status: EvaluationJobStatus!
    "The experiment name"
    experimentName: String!
    "When the job was created"
    createdAt: String!
  }

  type Query {
    "A simple query to check if the server is running"
    healthCheck: String!
    "Get a list of experiments (sessions) for a specific dataset"
    getDatasetExperiments(
      input: GetDatasetExperimentsInput!
    ): DatasetExperimentsResponse!
    "Get detailed information about a single experiment including its runs"
    getExperimentDetails(input: GetExperimentDetailsInput!): ExperimentDetails!
    "Get a list of available evaluators with their metadata"
    getAvailableEvaluators: AvailableEvaluatorsResponse!
    "Get a list of available graph names that can be used for evaluation"
    getAvailableGraphs: [GraphName!]!
    "Get a list of companies the authenticated user has access to"
    getAvailableCompanies: AvailableCompaniesResponse!
    "Get the status and details of an evaluation job"
    getEvaluationJobStatus(
      input: GetEvaluationJobStatusInput!
    ): EvaluationJobDetails!
    "Get a list of all evaluation jobs"
    getAllJobs: [JobSummary!]!
  }

  type Mutation {
    "Starts an asynchronous evaluation job and returns immediately with job details"
    runEvaluationAsync(input: RunEvaluationInput!): AsyncEvaluationResult!
    "Deletes all runs associated with a specific experiment/session"
    deleteExperimentRuns(
      input: DeleteExperimentRunsInput!
    ): DeleteExperimentRunsResult!
  }
`;
