/**
 * This is just some bogus tool to test tool interactions and human approval flows
 *
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";

const weatherSearch = tool(
  (_input: { city: string }) => {
    return "Sunny!";
  },
  {
    name: "weather_search",
    description: "Search for the weather",
    schema: z.object({
      city: z.string(),
    }),
  }
);

export { weatherSearch };
