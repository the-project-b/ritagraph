/**
 * This is just some bogus tool to test tool interactions and human approval flows
 *
 */

import { getCurrentTaskInput } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const listPendingMutations = () =>
  tool(
    async () => {
      console.log("[TOOL > list_pending_mutations]");

      const currentTaskInput = getCurrentTaskInput();

      const mutations = (currentTaskInput as any).mutations;

      if (!mutations) {
        return {
          info: "No mutations found",
        };
      }

      return {
        instructions: `
These are the pending mutation ids with their description. You can use them to approve the based on the confirmation of the user.
`,
        mutations: mutations.filter(
          (mutation) => mutation.status === "pending"
        ),
      };
    },
    {
      name: "list_pending_mutations",
      description:
        "All mutations have to be approved by the user. This tool will list all pending mutations, which then can be approved by using their id and the corresponding tool call",
      schema: z.object({}),
    }
  );
