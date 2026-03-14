export interface ApplyOptions {
  file: string;
  agent?: string;
  match?: string;
  dryRun?: boolean;
  force?: boolean;
  root?: string;
  manifest?: string;
  skipFirstMessage?: boolean;
  canary?: boolean;
  canaryPrefix?: string;
  promote?: boolean;
  cleanup?: boolean;
  compact?: boolean;
  compactTags?: string;
  compactMatch?: string;
  recalibrate?: boolean;
  recalibrateMessage?: string;
  recalibrateTags?: string;
  recalibrateMatch?: string;
  wait?: boolean;  // Commander maps --no-wait to wait=false
}

export interface DeployResult {
  agents: Record<string, string>;  // name → letta_agent_id
  created: string[];
  updated: string[];
  unchanged: string[];
}
