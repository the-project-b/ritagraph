import { tool } from "@langchain/core/tools";
import z from "../../../../../../../../../node_modules/zod/v3/external.cjs";
import { ToolFactoryToolDefintion } from "../../../../../../tools/tool-factory";
import { localeToLanguage } from "../../../../../../utils/format-helpers/locale-to-language";
import { AgentTodoItem } from "../../todo-engine";

export const addMultipleTodosTool: ToolFactoryToolDefintion<{
  addMultipleTodos: (todos: Omit<AgentTodoItem, "id">[]) => void;
  locale: "EN" | "DE";
}> = ({ extendedContext }) =>
  tool(
    async ({ todos }, { runId }) => {
      const { addMultipleTodos } = extendedContext;

      addMultipleTodos(
        todos.map((todo) => ({
          taskDescription: todo.changeDescription,
          translatedTaskDescription: todo.translatedChangeDescription,
          relatedEmployeeName: todo.nameOfAffectedEmployee,
          effectiveDate: todo.effectiveDate,
          createdAt: new Date().toISOString(),
          status: "pending",
          runId,
          iteration: 0,
        })),
      );

      return "Todos added";
    },
    {
      name: "add_multiple_todos",
      description:
        "Extract a change request / requests from the users message. One todo per change request per employee. Again only one employee change per todo.",
      schema: z.object({
        todos: z.array(
          z.object({
            changeDescription: z.string(),
            translatedChangeDescription: z
              .string()
              .describe(
                `The translated task description in ${localeToLanguage(extendedContext.locale)}`,
              ),
            nameOfAffectedEmployee: z
              .string()
              .describe(
                "The name of the employee whose data will be changed. (Only one employee per todo)",
              ),
            effectiveDate: z.string(),
          }),
        ),
      }),
    },
  );
