import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { normalizeResponse, sleep } from '../../lib/shared/response-normalizer';
import { isRunTerminal, getEffectiveRunStatus } from '../../lib/messaging/run-utils';
import { Run } from '../../types/run';
import { output, error } from '../../lib/shared/logger';
import { TrackRunsOptions } from './types';
import { AgentNameCache, runToDisplayData, renderRunTable } from './run-tracker';
import { showRunMessages } from './utils';

export async function trackRunsCommand(
  runIds: string[],
  options: TrackRunsOptions,
  _command: any
) {
  const client = new LettaClientWrapper();
  const cache = new AgentNameCache(client);
  await cache.load();

  // Resolve run IDs from --agent if no explicit IDs given
  if (runIds.length === 0 && options.agent) {
    const resolver = new AgentResolver(client);
    const { agent } = await resolver.findAgentByName(options.agent);

    const runsResponse = await client.listRuns({ agentId: agent.id, active: true });
    const activeRuns = normalizeResponse(runsResponse) as Run[];

    if (activeRuns.length === 0) {
      output(`No active runs found for agent "${options.agent}".`);
      return;
    }

    runIds = activeRuns.map(r => r.id);
    output(`Tracking ${runIds.length} active run(s) for agent "${options.agent}"`);
  }

  if (runIds.length === 0) {
    error('No run IDs specified. Provide run IDs or use --agent <name>.');
    process.exit(1);
  }

  const pollInterval = 1000;
  const completedRuns = new Set<string>();
  let anyFailed = false;

  // Handle graceful shutdown
  let running = true;
  const cleanup = () => { running = false; };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    while (running) {
      // Fetch all tracked runs
      const runs: Run[] = [];
      for (const id of runIds) {
        try {
          const run = await client.getRun(id) as Run;
          runs.push(run);
        } catch (err: any) {
          error(`Failed to fetch run ${id}: ${err.message}`);
        }
      }

      const displayData = runs.map(r => runToDisplayData(r, cache));
      renderRunTable(displayData, `Tracking ${runIds.length} run(s)`);

      // Check for newly completed runs
      for (const run of runs) {
        if (isRunTerminal(run) && !completedRuns.has(run.id)) {
          completedRuns.add(run.id);
          const effectiveStatus = getEffectiveRunStatus(run);

          output('');
          output(`Run ${run.id.slice(0, 12)}... ${effectiveStatus}.`);

          if (effectiveStatus === 'failed' || effectiveStatus === 'cancelled') {
            anyFailed = true;
            if (run.stop_reason) {
              output(`  Stop reason: ${run.stop_reason}`);
            }
          }

          // Show messages for completed runs
          if (effectiveStatus === 'completed') {
            try {
              await showRunMessages(client, run.id);
            } catch {
              // Messages may not be available
            }
          }
        }
      }

      // Auto-exit when all runs are terminal
      if (completedRuns.size >= runIds.length) {
        output('');
        output(`All ${runIds.length} run(s) completed.`);
        break;
      }

      await sleep(pollInterval);
    }
  } finally {
    process.removeListener('SIGINT', cleanup);
    process.removeListener('SIGTERM', cleanup);
  }

  // Exit code 1 if any run failed (CI/CD friendly)
  if (anyFailed) {
    process.exit(1);
  }
}
