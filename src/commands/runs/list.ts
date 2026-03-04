import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { normalizeResponse, sleep } from '../../lib/shared/response-normalizer';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { displayRuns } from '../../lib/ux/display';
import { Run } from '../../types/run';
import { output } from '../../lib/shared/logger';
import { ListRunsOptions } from './types';
import { AgentNameCache, runToDisplayData, renderRunTable } from './run-tracker';

export async function listRunsCommand(
  options: ListRunsOptions,
  command: any
) {
  const client = new LettaClientWrapper();

  let agentId: string | undefined;
  if (options.agent) {
    const resolver = new AgentResolver(client);
    const { agent } = await resolver.findAgentByName(options.agent);
    agentId = agent.id;
  }

  const fetchRuns = async () => {
    const runsResponse = await client.listRuns({
      agentId,
      active: options.active,
      limit: options.limit || 20
    });
    return normalizeResponse(runsResponse) as Run[];
  };

  const runs = await fetchRuns();

  if (OutputFormatter.handleJsonOutput(runs, options.output)) {
    return;
  }

  // Build agent name cache for display
  const cache = new AgentNameCache(client);
  await cache.load();

  if (options.watch) {
    await watchRuns(fetchRuns, cache, options);
    return;
  }

  // Non-watch: render table once
  if (runs.length === 0) {
    output('No runs found.');
    return;
  }

  const displayData = runs.map(r => runToDisplayData(r, cache));
  output(displayRuns(displayData));
}

async function watchRuns(
  fetchRuns: () => Promise<Run[]>,
  cache: AgentNameCache,
  options: ListRunsOptions
) {
  const pollInterval = 2000;
  const filterLabel = options.active ? 'active ' : '';
  const agentLabel = options.agent ? ` for ${options.agent}` : '';
  const header = `Watching ${filterLabel}runs${agentLabel} (Ctrl+C to stop)`;

  // Handle graceful shutdown
  let running = true;
  const cleanup = () => { running = false; };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    while (running) {
      const runs = await fetchRuns();
      const displayData = runs.map(r => runToDisplayData(r, cache));
      renderRunTable(displayData, header);
      await sleep(pollInterval);
    }
  } finally {
    process.removeListener('SIGINT', cleanup);
    process.removeListener('SIGTERM', cleanup);
  }
}
