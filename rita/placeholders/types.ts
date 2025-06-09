import { MergedAnnotation } from "../states/states";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";

export interface PlaceholderContext {
  state: typeof MergedAnnotation.State;
  config: LangGraphRunnableConfig<any>;
}

export interface PlaceholderResolver {
  name: string;
  resolve: (context: PlaceholderContext) => Promise<string> | string;
}

export interface PlaceholderRegistry {
  [key: string]: PlaceholderResolver;
}

// Supervisor-related types
export type MergedState = typeof MergedAnnotation.State;

export type AgentConfig = {
  name: string;
  agent: any; // The compiled agent
  description?: string;
  // Peer communication: which other agents this agent can directly communicate with
  canTalkTo?: string[]; // Agent names this agent can directly handoff to
};

export type PeerCommunicationConfig = {
  enabled: boolean;
  // If true, agents return to supervisor after peer communication
  // If false, peer communication can chain indefinitely until manual return
  alwaysReturnToSupervisor?: boolean;
  // Maximum number of peer-to-peer handoffs before forcing return to supervisor
  maxPeerHops?: number;
};

export type CustomSupervisorConfig = {
  agents: AgentConfig[];
  llm: ChatOpenAI;
  supervisorName?: string;
  prompt?: string;
  outputMode?: 'full_history' | 'last_message';
  addHandoffBackMessages?: boolean;
  stateSchema: any;
  // New: Peer communication configuration
  peerCommunication?: PeerCommunicationConfig;
};