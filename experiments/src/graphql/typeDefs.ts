import gql from 'graphql-tag';

export const typeDefs = gql`
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

  type Query {
    "A simple query to check if the server is running"
    healthCheck: String!
  }

  type Mutation {
    "Runs an evaluation on a specified graph against a dataset"
    runEvaluation(input: RunEvaluationInput!): EvaluationResult!
  }
`; 