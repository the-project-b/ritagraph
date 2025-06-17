// Initial Plan Node - Generates initial plan messages for users using LLM
import { Command } from "@langchain/langgraph";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ExtendedState } from "../../../states/states";
import { AgentType } from "../types/agents";
import { logEvent } from "../agents/supervisor-agent";
import { Task, TaskState } from "../types";
import { loadTemplatePrompt, isTemplateConfigured } from "../prompts/configurable-prompt-resolver";
import { safeCreateMemoryMap } from "../utils/memory-helpers";

/**
 * Generate initial plan message using template prompt or LLM fallback
 */
export const generateInitialPlanMessage = async (
  request: string, 
  tasks: Task[], 
  state: ExtendedState, 
  config: any
): Promise<string | null> => {
  if (!tasks.length) return null;

  try {
    // Try to use configured template prompt first
    
    if (isTemplateConfigured("template_initial_plan", config)) {
      console.log('🔧 INITIAL_PLAN - Using configured template prompt');
      
      const model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.3 });
      
      // Add task information to state memory for template use
      const updatedState = {
        ...state,
        memory: safeCreateMemoryMap(state.memory)
          // DON'T overwrite userRequest - preserve original user input
          .set('tasks', tasks)
          .set('taskCount', tasks.length)
          .set('hasQuery', tasks.some(t => t.type === 'query'))
          .set('hasMutation', tasks.some(t => t.type === 'mutation'))
      };
      
      const promptResult = await loadTemplatePrompt(
        "template_initial_plan",
        updatedState,
        config,
        model,
        false
      );
      
      if (promptResult.messages && promptResult.messages.length > 0) {
        const planMessage = typeof promptResult.messages[0].content === 'string' 
          ? promptResult.messages[0].content.trim() 
          : '';
        
        if (planMessage) {
          console.log('🔧 INITIAL_PLAN - Generated template-based plan message:', planMessage);
          return planMessage;
        }
      }
    }
    
    // Fallback to LLM-based approach
    console.log('🔧 INITIAL_PLAN - Using LLM fallback approach');
    const model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.3 });

    const prompt = `You are an AI assistant that generates initial plan messages for users. Your job is to tell the user what you're about to do based on their request and the tasks you've identified.
    IMPORTANT: Respond in the SAME language as the user's request.

USER REQUEST: "${request}"

INSTRUCTIONS:
1. First, identify the language of the user request: "${request}"
2. Generate a friendly, concise message (1-2 sentences) explaining what you're about to do
3. Use appropriate emojis to make it engaging
4. Be specific about what type of information you'll retrieve or what actions you'll perform
5. Keep it conversational and helpful
6. Respond in the SAME language as the user request

Generate ONLY the plan message, nothing else:`;

    const response = await model.invoke([new HumanMessage(prompt)]);
    const planMessage = typeof response.content === 'string' ? response.content.trim() : '';

    console.log('🔧 INITIAL_PLAN - Generated LLM plan message:', planMessage);
    return planMessage || null;

  } catch (error) {
    console.warn('🔧 INITIAL_PLAN - Both template and LLM failed, using hardcoded fallback:', error.message);
    
    // Final fallback to simple hardcoded message
    const hasQuery = tasks.some(t => t.type === 'query');
    const hasMutation = tasks.some(t => t.type === 'mutation');
    
    if (hasQuery && hasMutation) {
      return `🔄 I'll retrieve and update data for you (${tasks.length} operations).`;
    } else if (hasQuery) {
      return `🔍 I'll retrieve the requested information for you.`;
    } else if (hasMutation) {
      return `⚙️ I'll perform the requested changes for you.`;
    } else {
      return `🔍 I'll process your request for you.`;
    }
  }
};

/**
 * Initial Plan Node - Generates and sends initial plan message to user
 */
export const initialPlanNode = async (state: ExtendedState, config: any) => {
  const startTime = Date.now();
  logEvent('info', AgentType.TOOL, 'initial_plan_start', { startTime });

  try {
    // Get task state and user request
    const taskState = state.memory?.get('taskState') as TaskState;
    const userRequest = state.memory?.get('userRequest') as string;

    if (!taskState || !userRequest) {
      throw new Error('Missing task state or user request for initial plan generation');
    }

    if (!taskState.tasks || taskState.tasks.length === 0) {
      logEvent('info', AgentType.TOOL, 'no_tasks_for_plan');
      // No tasks, continue to supervisor without plan message
      return new Command({
        goto: AgentType.SUPERVISOR,
        update: {
          messages: state.messages,
          memory: state.memory
        }
      });
    }

    logEvent('info', AgentType.TOOL, 'generating_plan_message', {
      userRequest: userRequest.substring(0, 100),
      taskCount: taskState.tasks.length,
      taskTypes: taskState.tasks.map(t => t.type)
    });

    // Generate plan message
    const planMessage = await generateInitialPlanMessage(userRequest, taskState.tasks, state, config);

    if (planMessage && typeof planMessage === 'string') {
      logEvent('info', AgentType.TOOL, 'initial_plan_completed', {
        duration: Date.now() - startTime,
        messageLength: planMessage.length
      });

      // Send plan message to user and continue to supervisor
      return new Command({
        goto: AgentType.SUPERVISOR,
        update: {
          messages: [
            ...state.messages,
            new AIMessage({
              content: planMessage
            })
          ],
          memory: state.memory
        }
      });
    } else {
      logEvent('info', AgentType.TOOL, 'no_plan_message_generated');
      // No plan message generated, continue to supervisor
      return new Command({
        goto: AgentType.SUPERVISOR,
        update: {
          messages: state.messages,
          memory: state.memory
        }
      });
    }

  } catch (error) {
    logEvent('error', AgentType.TOOL, 'initial_plan_error', { 
      error: error.message,
      duration: Date.now() - startTime
    });
    
    // Continue to supervisor even if plan generation fails
    return new Command({
      goto: AgentType.SUPERVISOR,
      update: {
        messages: state.messages,
        memory: state.memory
      }
    });
  }
}; 