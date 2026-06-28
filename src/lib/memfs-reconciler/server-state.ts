/**
 * Build a ServerAgentState by pulling tags + blocks from Letta and the bare
 * repo file SHAs from the git client. Pure orchestration — no business logic.
 */

import type { LettaClientWrapper } from '../client/letta-client';
import type { GitClient } from './git-client';
import type { ServerAgentState, BlockSnapshot } from './plan';

export async function buildServerAgentState(
  letta: LettaClientWrapper,
  gitClient: GitClient,
  agentId: string,
): Promise<ServerAgentState> {
  const agent = await letta.getAgent(agentId);

  const rawBlocks = ((agent as any).blocks ?? []) as Array<{
    id?: string;
    label: string;
    value: string;
    description?: string;
    limit?: number;
    agent_owned?: boolean;
  }>;
  const blocks: BlockSnapshot[] = rawBlocks.map((b) => ({
    label: b.label,
    value: b.value ?? '',
    description: b.description,
    limit: b.limit ?? 0,
    agentOwned: b.agent_owned ?? true,
    id: b.id ?? '',
  }));

  const tags = ((agent as any).tags ?? []) as string[];
  const metadata = ((agent as any).metadata ?? {}) as Record<string, any>;

  // Pull the bare repo file SHAs. If the bare repo doesn't exist yet (first
  // migration), the sidecar auto-creates it on clone and we get an empty map.
  let bareRepoFiles = new Map<string, string>();
  try {
    bareRepoFiles = await gitClient.listBareRepoFiles(agentId);
  } catch (err) {
    // Don't fail the whole reconcile just because the bare repo isn't
    // reachable — that's recoverable, the executor will surface a clearer
    // error when it actually tries to push.
    // eslint-disable-next-line no-console
    console.error(`[buildServerAgentState] could not list bare repo for ${agentId}:`, (err as Error).message);
  }

  return {
    agentId,
    tags,
    metadata,
    blocks,
    bareRepoFiles,
  };
}
