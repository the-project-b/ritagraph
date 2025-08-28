import { GetThreadItemsByLanggraphThreadIdQuery } from "../../../../generated/graphql.js";
import { createGraphQLClient } from "../../../../utils/graphql/client.js";
import { Result } from "../../../../utils/types/result.js";
import { DataChangeProposal } from "../../../shared-types/base-annotation.js";
import { AssumedConfigType, EdgeDecision } from "../../graph-state.js";

export const finalMessageEdgeDecision: EdgeDecision = async (
  _,
  config,
  getAuthUser,
) => {
  const { thread_id: langgraphThreadId, run_id } =
    config.configurable as unknown as AssumedConfigType;
  const { token: accessToken, appdataHeader } = getAuthUser(config);

  const client = createGraphQLClient({
    accessToken,
    appdataHeader,
  });

  const proposalsResult = await getProposalsOfThatRun(
    client,
    langgraphThreadId,
    run_id,
  );

  if (Result.isFailure(proposalsResult)) {
    return "finalMessage";
  }

  const proposals = Result.unwrap(proposalsResult);

  if (proposals.length === 0) {
    return "finalMessage";
  }

  return "finalMessageForChanges";
};

export async function getProposalsOfThatRun(
  client: ReturnType<typeof createGraphQLClient>,
  langgraphThreadId: string,
  runId: string,
): Promise<Result<Array<DataChangeProposal>, Error>> {
  try {
    const { threadByLanggraphId } =
      await client.getThreadItemsByLanggraphThreadId({
        langgraphId: langgraphThreadId,
      });

    const proposalsOfThatRun = threadByLanggraphId.threadItems
      .filter((i) => i.data.type === "DATA_CHANGE_PROPOSAL")
      .map(toProposal)
      .filter((item) => item.runId === runId);

    return Result.success(proposalsOfThatRun);
  } catch (error) {
    return Result.failure(error);
  }
}

function toProposal(
  item: NonNullable<
    GetThreadItemsByLanggraphThreadIdQuery["threadByLanggraphId"]
  >["threadItems"][number],
): DataChangeProposal {
  return item.data.proposal;
}
