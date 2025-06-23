/**
 * Memory Management Utilities
 * 
 * This module provides utilities for safely handling memory objects in the LangGraph runtime,
 * particularly for converting between different memory representations and ensuring proper
 * Map object creation.
 */

/**
 * Helper function to safely create a Map from state.memory
 * This handles cases where state.memory might not be a proper Map object when coming
 * from the LangGraph runtime, which can serialize/deserialize Maps as plain objects.
 * 
 * @param memory - The memory object which could be a Map, plain object, or undefined
 * @returns A proper Map object that can be safely used
 */
export const safeCreateMemoryMap = (memory?: any | Map<string, any>): Map<string, any> => {
  if (!memory) {
    return new Map();
  }
  
  // If it's already a Map, clone it to avoid shared references
  if (memory instanceof Map) {
    return new Map(memory);
  }
  
  // If it's a plain object, convert it to Map entries
  if (typeof memory === 'object' && memory !== null) {
    try {
      // Try to convert object to Map entries
      return new Map(Object.entries(memory));
    } catch (error) {
      console.warn('Failed to convert memory object to Map:', error);
      return new Map();
    }
  }
  
  // Fallback to empty Map for unexpected types
  console.warn('Unexpected memory type:', typeof memory);
  return new Map();
};
