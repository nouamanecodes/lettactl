import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { output } from '../../lib/shared/logger';
import { AgentDataFetcher, DetailLevel } from '../../lib/client/agent-data-fetcher';
import { GetOptions } from './types';
import { DEFAULT_CANARY_PREFIX, isCanaryName } from '../../lib/apply/canary';

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

    // Parse tags filter
    const tagFilter = options?.tags
      ? options.tags.split(',').map(t => t.trim()).filter(Boolean)
      : undefined;

    let agents = await fetcher.fetchAllAgents(detailLevel, tagFilter ? { tags: tagFilter } : undefined);

    // Filter to canary agents only
    if (options?.canary) {
      agents = agents.filter(a => isCanaryName(a.name, DEFAULT_CANARY_PREFIX));
    }

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
