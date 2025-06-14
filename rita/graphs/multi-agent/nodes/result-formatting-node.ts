// Result Formatting Node - Formats operation results using LLM-generated messages
import { Command } from "@langchain/langgraph";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ExtendedState } from "../../../states/states";
import { AgentType } from "../types/agents";
import { logEvent } from "../agents/supervisor-agent";
import { Task, TaskState } from "../types";
import { updateTaskStateWithSets, getCompletedTasksContext } from "../tasks/tasks-handling";
import { GatheredContext } from "./context-gathering-node";
import { loadGenericPrompt } from "../prompts/prompt-factory";

// All template-based formatting removed - using LLM generation instead

/**
 * Format context information for display in results
 */
function formatContextInfo(gatheredContext?: GatheredContext): string {
  if (!gatheredContext) {
    return '';
  }

  const sections = [];

  // Context Sources Used - only show meaningful context
  const meaningfulContext = [];
  if (Object.keys(gatheredContext.staticContext).length > 0) {
    const staticKeys = Object.keys(gatheredContext.staticContext).filter(key => key !== 'extractedPatterns');
    if (staticKeys.length > 0) {
      meaningfulContext.push(`📝 Static: ${staticKeys.join(', ')}`);
    }
  }
  if (Object.keys(gatheredContext.userContext).length > 0) {
    meaningfulContext.push(`👤 User: ${Object.keys(gatheredContext.userContext).join(', ')}`);
  }
  if (gatheredContext.dynamicContext.hasRecentResults || gatheredContext.dynamicContext.completedTaskCount > 0) {
    meaningfulContext.push(`🔄 Previous tasks: ${gatheredContext.dynamicContext.completedTaskCount} completed`);
  }

  if (meaningfulContext.length > 0) {
    sections.push(`### 🎯 Context Used\n${meaningfulContext.join('\n')}`);
  }

  // Parameter Resolution - only show successfully resolved parameters
  if (gatheredContext.resolutionStrategies.length > 0) {
    const successfullyResolved = gatheredContext.resolutionStrategies
      .filter(strategy => strategy.sources.length > 0 && strategy.confidence > 0.5)
      .map(strategy => {
        const confidence = Math.round(strategy.confidence * 100);
        const sources = strategy.sources.join(', ');
        const requiredIndicator = strategy.required ? '⚠️ ' : '';
        return `${requiredIndicator}**${strategy.parameter}**: ${confidence}% (${sources})`;
      });

    if (successfullyResolved.length > 0) {
      sections.push(`### 🔧 Parameters Resolved\n${successfullyResolved.join('\n')}`);
    }
  }

  // Type Information - only show if we have meaningful type info
  const hasValidTypeInfo = gatheredContext.typeContext.requiredParameters.length > 0 || 
                          gatheredContext.typeContext.optionalParameters.length > 0;
                          
  if (hasValidTypeInfo) {
    const typeInfo = [];
    if (gatheredContext.typeContext.requiredParameters.length > 0) {
      typeInfo.push(`⚠️ Required: ${gatheredContext.typeContext.requiredParameters.slice(0, 5).join(', ')}${gatheredContext.typeContext.requiredParameters.length > 5 ? '...' : ''}`);
    }
    if (gatheredContext.typeContext.optionalParameters.length > 0) {
      typeInfo.push(`📄 Optional: ${gatheredContext.typeContext.optionalParameters.slice(0, 5).join(', ')}${gatheredContext.typeContext.optionalParameters.length > 5 ? '...' : ''}`);
    }
    sections.push(`### 📋 Schema Parameters\n${typeInfo.join('\n')}`);
  }

  // Extracted Patterns Summary - only show meaningful patterns
  const patterns = gatheredContext.extractedPatterns;
  const extractedPatterns = [];
  if (patterns.companyIds.length > 0) extractedPatterns.push(`🏢 Companies: ${patterns.companyIds.slice(0, 3).join(', ')}${patterns.companyIds.length > 3 ? '...' : ''}`);
  if (patterns.contractIds.length > 0) extractedPatterns.push(`📋 Contracts: ${patterns.contractIds.slice(0, 3).join(', ')}${patterns.contractIds.length > 3 ? '...' : ''}`);
  if (patterns.employeeIds.length > 0) extractedPatterns.push(`👥 Employees: ${patterns.employeeIds.slice(0, 3).join(', ')}${patterns.employeeIds.length > 3 ? '...' : ''}`);
  if (patterns.statusFilters.length > 0) extractedPatterns.push(`📊 Status: ${patterns.statusFilters.join(', ')}`);
  if (patterns.dateRanges.length > 0) {
    const dateInfo = patterns.dateRanges.slice(0, 2).map(range => 
      range.startDate && range.endDate ? `${range.startDate} to ${range.endDate}` : 
      range.startDate ? `from ${range.startDate}` : 
      range.type
    ).join(', ');
    extractedPatterns.push(`📅 Dates: ${dateInfo}${patterns.dateRanges.length > 2 ? '...' : ''}`);
  }

  if (extractedPatterns.length > 0) {
    sections.push(`### 🔍 Extracted Data\n${extractedPatterns.join('\n')}`);
  }

  // If no meaningful context, don't show the section
  if (sections.length === 0) {
    return '';
  }

  return sections.join('\n\n');
}

/**
 * Result Formatting Node - Formats task results using templates
 */
export const resultFormattingNode = async (state: ExtendedState, config: any) => {
  const startTime = Date.now();
  logEvent('info', AgentType.TOOL, 'result_formatting_start', { startTime });

  try {
    // Get the current task state
    const taskState = state.memory?.get('taskState') as TaskState;
    if (!taskState) {
      throw new Error('No task state found in memory');
    }

    // Get the current task
    const currentTaskIndex = taskState.tasks.findIndex(task => task.status === 'in_progress');
    const currentTask: Task = taskState.tasks[currentTaskIndex];
    if (!currentTask) {
      throw new Error('No active task found');
    }

    logEvent('info', AgentType.TOOL, 'formatting_result', {
      taskId: currentTask.id,
      taskType: currentTask.type,
      hasResult: !!currentTask.result
    });

    // Get the result data
    let resultData = currentTask.queryDetails?.queryResult;
    
    // If result data is a string, try to parse it
    if (typeof resultData === 'string') {
      try {
        resultData = JSON.parse(resultData);
      } catch (parseError) {
        logEvent('warn', AgentType.TOOL, 'result_formatting_parse_error', {
          error: parseError.message,
          taskId: currentTask.id,
          dataType: typeof resultData
        });
      }
    }

    // Update task status to completed
    const updatedTaskState = updateTaskStateWithSets(taskState, currentTask.id, {
      status: 'completed',
      result: {
        data: resultData,
        metadata: {
          executionTime: Date.now() - startTime,
          taskId: currentTask.id
        }
      }
    });

    const updatedState = {
      ...state,
      memory: new Map(state.memory || new Map()).set('taskState', updatedTaskState)
    };

    // Generate LLM completion message
    const completionMessage = await generateTaskCompletionMessage(updatedState.memory.get('taskState') as TaskState, currentTaskIndex, updatedState);

    logEvent('info', AgentType.TOOL, 'result_formatting_completed', {
      taskId: currentTask.id,
      success: !currentTask.error,
      duration: Date.now() - startTime
    });

    // If this is the last task, end the flow
    const progress = {
      completed: updatedTaskState.completedTasks.size,
      failed: updatedTaskState.tasks.filter(t => t.status === 'failed').length,
      total: updatedTaskState.tasks.length
    };

    if (progress.completed + progress.failed === progress.total) {
      return new Command({
        goto: 'END',
        update: {
          messages: [
            ...state.messages,
            new AIMessage({
              content: completionMessage
            })
          ],
          memory: updatedState.memory
        }
      });
    }

    // Otherwise, continue to supervisor
    return new Command({
      goto: AgentType.SUPERVISOR,
      update: {
        messages: [
          ...state.messages,
          new AIMessage({
            content: completionMessage
          })
        ],
        memory: updatedState.memory
      }
    });

  } catch (error) {
    logEvent('error', AgentType.TOOL, 'result_formatting_error', { 
      error: error.message,
      duration: Date.now() - startTime
    });
    throw new Error(`Result formatting failed: ${error.message}`);
  }
};

/**
 * LLM-POWERED TASK COMPLETION MESSAGE GENERATOR
 * Uses AI to generate natural, contextual completion messages for all scenarios:
 * 1. Single Task
 * 2. Multi-Task (Individual completion) 
 * 3. Multi-Task (Final summary)
 */
async function generateTaskCompletionMessage(taskState: TaskState, currentTaskIndex: number, state?: ExtendedState): Promise<string> {
  const completedTasks = taskState.tasks.filter(task => task.status === 'completed');
  const failedTasks = taskState.tasks.filter(task => task.status === 'failed');
  const totalTasks = taskState.tasks.length;
  const currentTask = taskState.tasks[currentTaskIndex];

  // Get context if state is provided
  let context: ReturnType<typeof getCompletedTasksContext> | null = null;
  if (state) {
    context = getCompletedTasksContext(state);
  }

  // Determine completion scenario
  const isLastTask = completedTasks.length + failedTasks.length === totalTasks;
  const isSingleTask = totalTasks === 1;
  const isIndividualCompletion = !isLastTask || isSingleTask;

  // Prepare simplified data for LLM
  const messageData = {
    scenario: isSingleTask ? 'SINGLE_TASK' : (isIndividualCompletion ? 'INDIVIDUAL_COMPLETION' : 'FINAL_SUMMARY'),
    currentTask,
    taskState: { totalTasks, completedCount: completedTasks.length, failedCount: failedTasks.length, currentTaskNumber: parseInt(currentTask.id.replace('task_', '')) + 1 },
    allTasks: isLastTask ? taskState.tasks : null,
    context,
    executionTime: taskState.executionStartTime ? Math.round((Date.now() - taskState.executionStartTime) / 1000) : null
  };

     return await generateMessageWithLLM(messageData);
}

/**
 * Generate completion message using LLM
 */
async function generateMessageWithLLM(messageData: any): Promise<string> {
  const model = new ChatOpenAI({ model: "gpt-4.1-mini", temperature: 0.3 });

  // Prepare data for the prompt
  const taskStatus = messageData.currentTask.error ? 'FAILED' : 'COMPLETED';
  const resultData = messageData.currentTask.result?.data ? JSON.stringify(messageData.currentTask.result.data, null, 2) : 'No result';
  const errorInfo = messageData.currentTask.error ? `ERROR: ${messageData.currentTask.error}` : '';
  const allTasksInfo = messageData.allTasks ? 
    messageData.allTasks.map(task => `- ${task.description} (${task.status})`).join('\n') : '';
  const contextInfo = messageData.currentTask.context?.gatheredContext ? 
    formatContextInfo(messageData.currentTask.context.gatheredContext) : 'None';
  const executionTimeInfo = messageData.executionTime ? `${messageData.executionTime}s` : '';

  // Load the result formatting prompt dynamically
  let prompt = '';
  try {
    const { loadResultFormattingPrompt } = await import('../prompts/prompt-factory');
    const promptResult = await loadResultFormattingPrompt({
      state: { 
        messages: [],
        memory: new Map([
          ['taskState', {
            tasks: [messageData.currentTask],
            completedTasks: new Set(),
            failedTasks: new Set(),
            executionStartTime: Date.now()
          }],
          ['gatheredContext', messageData.context?.gatheredContext]
        ])
      } as any,
      config: {
        configurable: {
          promptId: "sup_formatting_result",
          model: model,
          extractSystemPrompts: false
        }
      }
    });
    
    prompt = promptResult.populatedPrompt.value;
    console.log("🔧 RESULT FORMATTING - Successfully loaded dynamic prompt");
  } catch (error) {
    console.warn("Failed to load sup_formatting_result prompt from LangSmith:", error);
    // Fallback to default prompt
    prompt = `Generate a natural task completion message.

SCENARIO: ${messageData.scenario}
TASK: ${messageData.currentTask.description} (${taskStatus})
PROGRESS: ${messageData.taskState.currentTaskNumber}/${messageData.taskState.totalTasks}

RESULT: ${resultData}
${errorInfo}

${allTasksInfo ? `ALL TASKS:\n${allTasksInfo}` : ''}

CONTEXT: ${contextInfo}
EXECUTION TIME: ${executionTimeInfo}

Generate a user-friendly completion message that:
1. Acknowledges the task completion
2. Summarizes the key results
3. Provides context about progress if multiple tasks
4. Uses a conversational, helpful tone

Keep the message concise but informative.`;
  }

  try {
    const response = await model.invoke([new HumanMessage(prompt)]);
    return typeof response.content === 'string' ? response.content.trim() : JSON.stringify(response.content);
  } catch (error) {
    console.error('LLM message generation failed:', error);
    // Fallback to simple message
    return generateFallbackMessage(messageData);
  }
}

/**
 * Fallback message generator when LLM fails
 */
function generateFallbackMessage(messageData: any): string {
  if (messageData.currentTask.error) {
    return `❌ Task failed: ${messageData.currentTask.error}`;
  }
  
  const result = messageData.currentTask.result?.data || `Task ${messageData.currentTask.id} completed successfully.`;
  
  if (messageData.scenario === 'FINAL_SUMMARY') {
    return `✅ All operations completed: ${messageData.taskState.completedCount} succeeded, ${messageData.taskState.failedCount} failed`;
  } else if (messageData.scenario === 'INDIVIDUAL_COMPLETION') {
    return `${result}\n\n📋 Task ${messageData.taskState.currentTaskNumber}/${messageData.taskState.totalTasks} completed`;
  }
  
  return result;
}

// All manual message generation functions removed - now using LLM-powered generation 