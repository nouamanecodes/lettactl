import { LettaClientWrapper } from '../client/letta-client';
import { Run } from '../../types/run';
import { isRunTerminal } from './run-utils';
import { log } from '../shared/logger';

export const DEFAULT_WAIT_FOR_IDLE_POLL_MS = 1000;
export const DEFAULT_WAIT_FOR_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export interface WaitForIdleOptions {
  pollMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onWaitStart?: (agentId: string, activeRunIds: string[]) => void;
  onStillWaiting?: (agentId: string, elapsedMs: number, activeRunIds: string[]) => void;
  /** Internal label used in progress messages — caller's friendly name, falls back to id */
  label?: (agentId: string) => string;
}

export interface WaitForIdleResult {
  waited: boolean;
  runsObserved: Record<string, string[]>;
}

export class RequiresApprovalError extends Error {
  constructor(public agentId: string, public runIds: string[]) {
    super(
      `Agent ${agentId} has run(s) ${runIds.join(', ')} awaiting human approval. ` +
      `Resolve the approval first, or pass --no-wait-for-idle to override.`
    );
    this.name = 'RequiresApprovalError';
  }
}

export class WaitForIdleTimeoutError extends Error {
  constructor(public agentId: string, public elapsedMs: number) {
    super(`Timed out after ${Math.round(elapsedMs / 1000)}s waiting for agent ${agentId} to become idle`);
    this.name = 'WaitForIdleTimeoutError';
  }
}

function isRequiresApproval(run: Run): boolean {
  return run.stop_reason === 'requires_approval';
}

async function waitOne(
  client: LettaClientWrapper,
  agentId: string,
  opts: WaitForIdleOptions,
  startedAt: number
): Promise<string[]> {
  const pollMs = opts.pollMs ?? DEFAULT_WAIT_FOR_IDLE_POLL_MS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_WAIT_FOR_IDLE_TIMEOUT_MS;
  const deadline = timeoutMs > 0 ? startedAt + timeoutMs : Infinity;
  const observed = new Set<string>();
  let notifiedStart = false;
  let lastStillWaitingBucket = 0;
  const STILL_WAITING_INTERVAL_MS = 30_000;

  while (true) {
    if (opts.signal?.aborted) {
      throw new Error(`Wait for agent ${agentId} aborted`);
    }
    if (Date.now() > deadline) {
      throw new WaitForIdleTimeoutError(agentId, Date.now() - startedAt);
    }

    const listResp = await client.listRuns({ agentId, active: true });
    const runs: Run[] = Array.isArray(listResp) ? listResp : ((listResp as any)?.items || []);
    const blocking = runs.filter(r => !isRunTerminal(r));

    if (blocking.length === 0) {
      return Array.from(observed);
    }

    const approvalRuns = blocking.filter(isRequiresApproval).map(r => r.id);
    if (approvalRuns.length > 0) {
      throw new RequiresApprovalError(agentId, approvalRuns);
    }

    const blockingIds = blocking.map(r => r.id);
    blockingIds.forEach(id => observed.add(id));

    if (!notifiedStart) {
      notifiedStart = true;
      opts.onWaitStart?.(agentId, blockingIds);
    }

    const elapsedMs = Date.now() - startedAt;
    const bucket = Math.floor(elapsedMs / STILL_WAITING_INTERVAL_MS);
    if (bucket > lastStillWaitingBucket && bucket > 0) {
      lastStillWaitingBucket = bucket;
      opts.onStillWaiting?.(agentId, elapsedMs, blockingIds);
    }

    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
}

/**
 * Wait for all given agents to have no active runs.
 *
 * - Polls per agent in parallel (no batching limit — wait operations are cheap).
 * - Fails fast (RequiresApprovalError) if any run is paused awaiting human approval.
 * - Throws WaitForIdleTimeoutError per agent on timeout (default 5 min).
 *
 * Returns { waited: true } if any agent had active runs (and we waited), false otherwise.
 */
export async function waitForAgentIdle(
  client: LettaClientWrapper,
  agentIdOrIds: string | string[],
  opts: WaitForIdleOptions = {}
): Promise<WaitForIdleResult> {
  const ids = Array.isArray(agentIdOrIds) ? agentIdOrIds : [agentIdOrIds];
  if (ids.length === 0) return { waited: false, runsObserved: {} };

  const startedAt = Date.now();
  const runsObserved: Record<string, string[]> = {};

  const results = await Promise.all(
    ids.map(async id => {
      const observed = await waitOne(client, id, opts, startedAt);
      return [id, observed] as const;
    })
  );

  let waited = false;
  for (const [id, observed] of results) {
    runsObserved[id] = observed;
    if (observed.length > 0) waited = true;
  }

  return { waited, runsObserved };
}

/**
 * Default logging callback — emits "waiting for agent X..." once per agent when the gate engages,
 * and "still waiting..." every 30s. Pass to waitForAgentIdle as `onWaitStart` / `onStillWaiting`.
 */
export function defaultWaitLogger(label?: (agentId: string) => string) {
  const name = (id: string) => label?.(id) || id;
  return {
    onWaitStart: (agentId: string, runIds: string[]) => {
      const count = runIds.length;
      log(`Waiting for ${name(agentId)} to become idle (${count} active run${count === 1 ? '' : 's'})...`);
    },
    onStillWaiting: (agentId: string, elapsedMs: number) => {
      log(`Still waiting for ${name(agentId)}... ${Math.round(elapsedMs / 1000)}s elapsed`);
    },
  };
}
