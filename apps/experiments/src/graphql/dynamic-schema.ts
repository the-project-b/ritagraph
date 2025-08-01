import { EvaluatorRegistry } from '../evaluators/core/registry.js';

/**
 * Dynamically generates the FeedbackStats GraphQL type definition
 * based on registered evaluators
 */
export function generateFeedbackStatsType(): string {
  const registeredEvaluators = EvaluatorRegistry.getAll();
  
  let feedbackStatsFields = `
    # Generic field to get all feedback stats as JSON (always available)
    # Can be filtered using GraphQL variables to include only specific evaluators
    "All feedback statistics as a flexible JSON object"
    allStats(evaluators: [String!]): JSON
  `;

  // Add fields for each registered evaluator
  for (const evaluator of registeredEvaluators) {
    const { type, description } = evaluator.config;
    const fieldName = type.toLowerCase();
    
    feedbackStatsFields += `
    "${description}"
    ${fieldName}: EvaluatorFeedback`;
  }

  return `
  # Represents all feedback statistics for an experiment
  # This type is dynamically generated based on registered evaluators
  type FeedbackStats {${feedbackStatsFields}
  }`;
}

/**
 * Gets all feedback field names that should be supported
 */
export function getAllFeedbackFieldNames(): string[] {
  const evaluators = EvaluatorRegistry.getAll();
  const fieldNames = evaluators.map(e => e.config.type.toLowerCase());
  
  // Always include allStats field
  fieldNames.push('allStats');
  
  return fieldNames;
}

/**
 * Gets the mapping of evaluator types to their expected feedback keys
 * This ensures consistency between what evaluators produce and what GraphQL expects
 */
export function getEvaluatorFeedbackKeyMap(): Record<string, string> {
  const evaluators = EvaluatorRegistry.getAll();
  const keyMap: Record<string, string> = {};
  
  for (const evaluator of evaluators) {
    const evaluatorType = evaluator.config.type;
    const fieldName = evaluatorType.toLowerCase();
    // Map evaluator type to expected feedback key pattern
    keyMap[evaluatorType] = fieldName;
  }
  
  return keyMap;
}

/**
 * Maps evaluator feedback keys to GraphQL field names dynamically based on registry
 */
export function mapFeedbackKeyToField(feedbackKey: string): string {
  const evaluators = EvaluatorRegistry.getAll();
  
  // Find evaluator that produces this feedback key
  for (const evaluator of evaluators) {
    // Check if this evaluator's type matches the feedback key pattern
    const evaluatorType = evaluator.config.type.toLowerCase();
    if (feedbackKey === evaluatorType || 
        feedbackKey.replace(/_/g, '').toLowerCase() === evaluatorType.replace(/_/g, '').toLowerCase()) {
      return evaluatorType;
    }
  }
  
  // For unknown keys, use normalized lowercase version
  return feedbackKey.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

/**
 * Filters feedback stats based on specified evaluator types
 */
export function filterFeedbackStats(
  feedbackStats: Record<string, any>, 
  evaluatorTypes?: string[]
): Record<string, any> {
  if (!evaluatorTypes || evaluatorTypes.length === 0) {
    // Return all feedback stats if no filter specified
    return feedbackStats;
  }
  
  const filtered: Record<string, any> = {};
  
  for (const evaluatorType of evaluatorTypes) {
    const fieldName = evaluatorType.toLowerCase();
    if (feedbackStats[fieldName]) {
      filtered[fieldName] = feedbackStats[fieldName];
    }
  }
  
  return filtered;
}