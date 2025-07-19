/**
 * This is just some bogus tool to test tool interactions and human approval flows
 *
 */

import { Command, getCurrentTaskInput } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ToolMessage } from "@langchain/core/messages";

export const approveMutations = () =>
  tool(
    async ({ mutationIds }, { toolCall }) => {
      console.log("[TOOL > approve_mutations] ", mutationIds);

      const nonAffectedMutations = (
        getCurrentTaskInput() as any
      ).mutations.filter((mutation) => !mutationIds.includes(mutation.id));
      const affectedMutations = (getCurrentTaskInput() as any).mutations.filter(
        (mutation) => mutationIds.includes(mutation.id)
      );

      // run some code to approve the mutations
      return new Command({
        update: {
          mutations: [
            ...nonAffectedMutations,
            ...affectedMutations.map((mutation) => ({
              ...mutation,
              status: "approved",
            })),
          ],
          messages: [
            new ToolMessage({
              content: `Approved mutations ${affectedMutations
                .map((mutation) => mutation.description)
                .join("\n")}`,
              tool_call_id: toolCall.id,
            }),
          ],
        },
      });
    },
    {
      name: "approve_mutations",
      description:
        "You can approve pending mutations by their id with this tool. You can call this on behalf of the user.",
      schema: z.object({
        mutationIds: z.array(z.string()),
      }),
    }
  );
