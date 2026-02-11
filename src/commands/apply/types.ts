export interface ApplyOptions {
  file: string;
  agent?: string;
  match?: string;
  dryRun?: boolean;
  force?: boolean;
  root?: string;
  manifest?: string;
  skipFirstMessage?: boolean;
}

export interface DeployResult {
  agents: Record<string, string>;  // name → letta_agent_id
  created: string[];
  updated: string[];
  unchanged: string[];
}
