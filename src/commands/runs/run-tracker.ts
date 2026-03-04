import { LettaClientWrapper } from '../../lib/client/letta-client';
import { normalizeResponse } from '../../lib/shared/response-normalizer';
import { getEffectiveRunStatus } from '../../lib/messaging/run-utils';
import { RunData, displayRuns, displayRunsPlain } from '../../lib/ux/display';
import { shouldUseFancyUx } from '../../lib/ux/box';
import { Run } from '../../types/run';
import { output } from '../../lib/shared/logger';

/**
 * Caches agent_id → agent_name mappings to avoid repeated API calls
 */
export class AgentNameCache {
  private cache = new Map<string, string>();
  private loaded = false;
  private client: LettaClientWrapper;

  constructor(client: LettaClientWrapper) {
    this.client = client;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    const agents = await this.client.listAgents();
    const agentList = normalizeResponse(agents);
    for (const agent of agentList) {
      this.cache.set(agent.id, agent.name);
    }
    this.loaded = true;
  }

  getName(agentId: string): string {
    return this.cache.get(agentId) || agentId.slice(0, 12) + '...';
  }
}

/**
 * Format elapsed time between two dates as a human-readable string
 */
export function formatElapsed(createdAt: string, completedAt?: string): string {
  const start = new Date(createdAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const diffMs = Math.max(0, end - start);
  const totalSeconds = Math.floor(diffMs / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Convert a Run API object to display data
 */
export function runToDisplayData(run: Run, cache: AgentNameCache): RunData {
  const effectiveStatus = getEffectiveRunStatus(run);
  return {
    id: run.id,
    agentName: cache.getName(run.agent_id),
    status: effectiveStatus,
    elapsed: formatElapsed(run.created_at, run.completed_at),
    stopReason: run.stop_reason,
  };
}

/**
 * Clear terminal screen (only when TTY)
 */
export function clearScreen(): void {
  if (process.stdout.isTTY) {
    process.stdout.write('\x1B[2J\x1B[0f');
  }
}

/**
 * Render a run table with optional header, clearing the screen first
 */
export function renderRunTable(runs: RunData[], header?: string): void {
  clearScreen();

  if (header) {
    output(header);
    output('');
  }

  const timestamp = new Date().toLocaleTimeString();
  output(`Last updated: ${timestamp}`);
  output('');

  if (runs.length === 0) {
    output('No runs found.');
    return;
  }

  const table = shouldUseFancyUx() ? displayRuns(runs) : displayRunsPlain(runs);
  output(table);
}
