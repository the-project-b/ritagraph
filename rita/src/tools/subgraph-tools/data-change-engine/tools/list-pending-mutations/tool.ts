/**
 * This is just some bogus tool to test tool interactions and human approval flows
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ToolFactoryToolDefintion } from "../../../../tool-factory";
import { ExtendedToolContext } from "../../tool";

export const listDataChangeProposals: ToolFactoryToolDefintion<
  ExtendedToolContext
> = (ctx) =>
  tool(
    async () => {
      console.log("[TOOL > list_pending_mutations]");
      const mutations = ctx.extendedContext.listDataChangeProposals();

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
      name: "list_data_change_proposals",
      description:
        "All data change proposals have to be approved by the user. This tool will list all pending data change proposals, which then can be approved by using their id and the corresponding tool call",
      schema: z.object({}),
    }
  );
