import gql from 'graphql-tag';

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

  # Enum for the supported evaluators
  enum EvaluatorType {
    "Measures if the output is factually correct based on a reference answer"
    CORRECTNESS
  }

  # Input type for specifying an evaluator and its configuration
  input EvaluatorInput {
    "The type of evaluator to run"
    type: EvaluatorType!
    "An optional custom prompt to override the evaluator's default"
    customPrompt: String
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
    "A list of evaluators to run against the graph's outputs"
    evaluators: [EvaluatorInput!]!
    "An optional prefix for the experiment name in LangSmith"
    experimentPrefix: String
    "An optional key to specify the question in the dataset's inputs"
    inputKey: String
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
    "An array containing the detailed results for each individual run within the experiment."
    results: [RunResult!]
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

  # Represents all feedback statistics for an experiment
  type FeedbackStats {
    "Correctness evaluator feedback"
    correctness: EvaluatorFeedback
    # Add other evaluators as needed in the future
  }

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
    type: EvaluatorType!
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

  type Query {
    "A simple query to check if the server is running"
    healthCheck: String!
    "Get a list of experiments (sessions) for a specific dataset"
    getDatasetExperiments(input: GetDatasetExperimentsInput!): DatasetExperimentsResponse!
    "Get detailed information about a single experiment including its runs"
    getExperimentDetails(input: GetExperimentDetailsInput!): ExperimentDetails!
    "Get a list of available evaluators with their metadata"
    getAvailableEvaluators: AvailableEvaluatorsResponse!
    "Get a list of available graph names that can be used for evaluation"
    getAvailableGraphs: [GraphName!]!
  }

  type Mutation {
    "Runs an evaluation on a specified graph against a dataset"
    runEvaluation(input: RunEvaluationInput!): EvaluationResult!
  }
`; 