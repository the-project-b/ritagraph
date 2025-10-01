import { createLogger } from "@the-project-b/logging";
import { createRitaGraph } from "@the-project-b/rita-graphs";

const logger = createLogger({ service: "experiments" }).child({
  module: "GraphFactory",
});

/**
 * Creates the Rita graph target function for evaluations
 * This is what gets passed to the experiments package
 */
export async function createRitaGraphTarget(context: {
  token: string;
  userId: string;
  companyId: string;
}) {
  try {
    // Create the Rita graph with the provided auth context
    const getAuthUser = () => ({
      id: context.userId,
      token: context.token,
      companies: [
        {
          companyId: context.companyId,
          companyName: "Evaluation Company",
          role: "user",
        },
      ],
    });

    const graphFactory = createRitaGraph(getAuthUser);
    const graph = await graphFactory();

    logger.debug("Created Rita graph for evaluation", {
      userId: context.userId,
      companyId: context.companyId,
    });

    return graph;
  } catch (error) {
    logger.error("Failed to create Rita graph", {
      error: error instanceof Error ? error.message : String(error),
      userId: context.userId,
      companyId: context.companyId,
    });
    throw error;
  }
}
