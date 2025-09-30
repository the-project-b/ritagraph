/**
 * Our agents can have issues. Some can be fixed by a retry some not. Some need to question the user.
 * We need to discretize the errors and provide a reason for the error. And how the human or the agent can fix it.
 */

export enum AgentErrorType {
  INSUFFICIENT_INFORMATION = "INSUFFICIENT_INFORMATION",
  INCORRECT_INFORMATION = "INCORRECT_INFORMATION",
  TOOL_NOT_AVAILABLE = "TOOL_NOT_AVAILABLE",
  TOOL_DID_NOT_GET_RIGHT_PARAMS = "TOOL_DID_NOT_GET_RIGHT_PARAMS",
}

export const AgentErrorToReason = {
  [AgentErrorType.INSUFFICIENT_INFORMATION]:
    "Agent did not get enough information. And user should be asked if it can provide more information.",
  [AgentErrorType.INCORRECT_INFORMATION]:
    "The information provided seemed to be inocrrect. Ask user to double check.",
  [AgentErrorType.TOOL_NOT_AVAILABLE]:
    "Tool throws an error and seems to be not usable. Communicate with the user that as of now the request cannot be finsihed. Try again later",
  [AgentErrorType.TOOL_DID_NOT_GET_RIGHT_PARAMS]:
    "Tool did not get right params. Agent might have confused some Ids double check and use the tool again.",
};
