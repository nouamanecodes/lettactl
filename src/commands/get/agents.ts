import { LettaClientWrapper } from '../../lib/letta-client';
import { AgentResolver } from '../../lib/agent-resolver';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { output } from '../../lib/logger';
import { AgentDataFetcher, DetailLevel } from '../../lib/agent-data-fetcher';
import { GetOptions } from './types';

export async function getAgents(
  _resolver: AgentResolver,
  client: LettaClientWrapper,
  options?: GetOptions,
  spinnerEnabled?: boolean
) {
  const isWide = options?.output === 'wide';
  const fetcher = new AgentDataFetcher(client);

  // Determine detail level based on output format
  // 'standard' fetches tools/blocks counts (default for readable output)
  // 'full' also fetches folders, files, MCP servers (for wide view)
  const detailLevel: DetailLevel = isWide ? 'full' : 'standard';

  const spinner = createSpinner('Loading agents...', spinnerEnabled).start();

  try {
    spinner.text = 'Fetching agent details...';

    const agents = await fetcher.fetchAllAgents(detailLevel);

    spinner.stop();

    // For JSON output, return the raw data
    if (options?.output === 'json') {
      const rawData = agents.map(a => a.raw);
      OutputFormatter.handleJsonOutput(rawData, 'json');
      return;
    }

    if (options?.output === 'yaml') {
      const rawData = agents.map(a => a.raw);
      output(OutputFormatter.formatOutput(rawData, 'yaml'));
      return;
    }

    output(OutputFormatter.createAgentTable(agents, isWide));
  } catch (error) {
    spinner.fail('Failed to load agents');
    throw error;
  }
}
