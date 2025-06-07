// Query planning logic extracted from query-agent.ts
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { Task } from "../../types";

export interface QueryPlan {
  selectedQuery: string;
  reasoning: string;
  executionPlan: Array<{
    tool: string;
    purpose: string;
    expectedInput: string;
    expectedOutput: string;
  }>;
}

export interface QueryContext {
  queryName: string;
  queryDetails: string;
  typeDetails: string;
  task: string;
}

/**
 * Creates execution plans for query tasks
 */
export class QueryPlanner {
  private model: ChatOpenAI;

  constructor() {
    this.model = new ChatOpenAI({
      model: "gpt-4",
      temperature: 0,
    });
  }

  /**
   * Analyzes a task and creates an execution plan
   */
  async createExecutionPlan(
    task: Task,
    queriesList: any,
    queryTools: any[],
    existingTypeDetailsContext: string = ''
  ): Promise<QueryPlan> {
    const planningPrompt = `You are a query planning assistant. Your job is to analyze the task and create an execution plan.

Task: ${task.description}

Available queries:
${JSON.stringify(queriesList, null, 2)}

Available tools:
${queryTools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}${existingTypeDetailsContext}

Please analyze the task and create an execution plan. The plan should:
1. Select the most appropriate query for the task
2. Determine which tools to use and in what order
3. Generate a complete GraphQL query directly

QUERY SELECTION PRIORITY:
1. FIRST: Check if type details exist and match the query to those types
2. SECOND: Match the query name to the task description
3. THIRD: Choose the most general/appropriate query for the task

NOTE: Type details are handled by a separate TYPE_DETAILS agent. Focus only on:
- graphql-list-queries (already done)
- graphql-get-query-details (to understand query structure)
- execute-query (to execute the final query)

If type details are needed, return requiresTypeDetails=true to trigger the TYPE_DETAILS agent.

Respond with a JSON object in this format:
{
  "selectedQuery": "name of the most appropriate query",
  "reasoning": "explanation of why this query was selected",
  "executionPlan": [
    {
      "tool": "tool name",
      "purpose": "what this tool will be used for",
      "expectedInput": "what input this tool needs",
      "expectedOutput": "what output we expect"
    }
  ]
}`;

    const planningResponse = await this.model.invoke([
      new HumanMessage(planningPrompt)
    ]);

    // Extract the execution plan
    let plan: QueryPlan;
    try {
      const content = typeof planningResponse.content === 'string' 
        ? planningResponse.content 
        : JSON.stringify(planningResponse.content);
      plan = JSON.parse(content);
    } catch (error) {
      console.error('Failed to parse planning response:', error);
      throw new Error('Failed to create execution plan');
    }

    console.log('Execution plan:', plan);
    return plan;
  }

  /**
   * Builds context about existing type details from state
   */
  buildExistingTypeDetailsContext(state: any): string {
    const taskState = state.memory?.get('taskState');
    if (!taskState || !taskState.tasks) {
      return '';
    }

    const completedTypeDetailsTasks = taskState.tasks.filter((t: any) => 
      t.type === 'type_details' && 
      t.status === 'completed' && 
      t.result && 
      t.result.success
    );
    
    if (completedTypeDetailsTasks.length === 0) {
      return '';
    }

    const typeAnalysis = completedTypeDetailsTasks.map((t: any) => {
      if (t.result.metadata && t.result.metadata.typesAnalyzed) {
        return `Types analyzed: ${t.result.metadata.typesAnalyzed.join(', ')}`;
      }
      return 'Type details available';
    }).join('\n');
    
    return `\n\nIMPORTANT - EXISTING TYPE DETAILS:
The following type details have already been analyzed in previous tasks:
${typeAnalysis}

When selecting a query, prefer queries that match these analyzed types:
- If HR types (like EmployeeAdvancedFilterForHrInput) were analyzed, choose HR-related queries
- If BPO types were analyzed, choose BPO-related queries
- If Employee types were analyzed, choose employee-related queries
- Match the query name to the types that were analyzed`;
  }
} 