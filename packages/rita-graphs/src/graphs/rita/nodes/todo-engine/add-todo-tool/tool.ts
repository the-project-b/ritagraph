import { tool } from "@langchain/core/tools";
import z from "../../../../../../../../node_modules/zod/v3/external.cjs";
import { ToolFactoryToolDefintion } from "../../../../../tools/tool-factory";
import { localeToLanguage } from "../../../../../utils/format-helpers/locale-to-language";
import { AgentTodoItem } from "../todo-engine";

export const addTodoTool: ToolFactoryToolDefintion<{
  addTodo: (todo: Omit<AgentTodoItem, "id">) => void;
  locale: "EN" | "DE";
}> = ({ extendedContext }) =>
  tool(
    async ({ todo }, { runId }) => {
      const { addTodo } = extendedContext;

      addTodo({
        taskDescription: todo.taskDescription,
        translatedTaskDescription: todo.translatedTaskDescription,
        relatedEmployeeName: todo.relatedEmployeeName,
        effectiveDate: todo.effectiveDate,
        createdAt: new Date().toISOString(),
        status: "pending",
        runId,
        iteration: 0,
      });

      return "Todo added";
    },
    {
      name: "add_todo",
      description: "Add a todo item to the list",
      schema: z.object({
        todo: z.object({
          taskDescription: z.string(),
          translatedTaskDescription: z
            .string()
            .describe(
              `The translated task description in ${localeToLanguage(extendedContext.locale)}`,
            ),
          relatedEmployeeName: z.string(),
          effectiveDate: z.string(),
        }),
      }),
    },
  );
