/**
 * The langgraph config is not really well typed. This is the place where we can fix it later.
 * And a way to unify extraction of regularly used values from the config.
 */
export function getRunIdFromConfig(config: unknown): string {
  const configObject = config as { configurable: { run_id: string } };
  return configObject.configurable.run_id;
}

export function getThreadIdFromConfig(config: unknown): string {
  const configObject = config as { configurable: { thread_id: string } };
  return configObject.configurable.thread_id;
}
