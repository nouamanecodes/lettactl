import { LettaClientWrapper } from '../../lib/letta-client';
import { AgentResolver } from '../../lib/agent-resolver';
import { normalizeResponse } from '../../lib/response-normalizer';
import { formatStatus, OutputFormatter } from '../../lib/ux/output-formatter';
import { Run } from '../../types/run';
import { output } from '../../lib/logger';
import { ListRunsOptions } from './types';

export async function listRunsCommand(
  options: ListRunsOptions,
  command: any
) {
  const verbose = command.parent?.opts().verbose || false;
  const client = new LettaClientWrapper();

  let agentId: string | undefined;
  if (options.agent) {
    const resolver = new AgentResolver(client);
    const { agent } = await resolver.findAgentByName(options.agent);
    agentId = agent.id;
  }

  const runsResponse = await client.listRuns({
    agentId,
    active: options.active,
    limit: options.limit || 20
  });

  const runs = normalizeResponse(runsResponse) as Run[];

  if (OutputFormatter.handleJsonOutput(runs, options.output)) {
    return;
  }

  if (runs.length === 0) {
    output('No runs found.');
    return;
  }

  output('Runs');
  output('='.repeat(80));
  output('');

  for (const run of runs) {
    const status = formatStatus(run.status);
    const created = new Date(run.created_at).toLocaleString();

    output(`${run.id}`);
    output(`  Status:  ${status}`);
    output(`  Agent:   ${run.agent_id}`);
    output(`  Created: ${created}`);

    if (run.completed_at) {
      const completed = new Date(run.completed_at).toLocaleString();
      output(`  Completed: ${completed}`);
    }

    if (run.stop_reason) {
      output(`  Stop reason: ${run.stop_reason}`);
    }

    if (verbose && run.background !== undefined) {
      output(`  Background: ${run.background}`);
    }

    output('');
  }

  output(`Total: ${runs.length} run(s)`);
}
