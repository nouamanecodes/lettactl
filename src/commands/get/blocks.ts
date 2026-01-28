import { LettaClientWrapper } from '../../lib/letta-client';
import { AgentResolver } from '../../lib/agent-resolver';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { normalizeToArray, computeAgentCounts } from '../../lib/resource-usage';
import { output } from '../../lib/logger';
import { GetOptions } from './types';

export async function getBlocks(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  options?: GetOptions,
  spinnerEnabled?: boolean,
  agentId?: string,
  agentName?: string
) {
  const isWide = options?.output === 'wide';
  let label = 'Loading blocks...';
  if (agentId) label = 'Loading agent blocks...';
  else if (options?.shared) label = 'Loading shared blocks...';
  else if (options?.orphaned) label = 'Loading orphaned blocks...';

  const spinner = createSpinner(label, spinnerEnabled).start();

  try {
    let blockList: any[];
    let agentCounts: Map<string, number> | undefined;

    if (agentId) {
      // For agent-specific blocks, no need for agent counts
      blockList = normalizeToArray(await client.listAgentBlocks(agentId));
    } else if (options?.shared) {
      blockList = await client.listBlocks({ connectedAgentsCountGt: 1 });
    } else if (options?.orphaned) {
      blockList = await client.listBlocks({ connectedAgentsCountEq: [0] });
    } else {
      blockList = await client.listBlocks();
    }

    // Always compute agent counts for block type tagging
    spinner.text = 'Computing block usage...';
    agentCounts = await computeAgentCounts(client, resolver, 'blocks', blockList.map((b: any) => b.id));

    spinner.stop();

    if (OutputFormatter.handleJsonOutput(blockList, options?.output)) {
      return;
    }

    if (blockList.length === 0) {
      if (agentId) output('No blocks attached to this agent');
      else if (options?.shared) output('No shared blocks found (attached to 2+ agents)');
      else if (options?.orphaned) output('No orphaned blocks found (attached to 0 agents)');
      else output('No blocks found');
      return;
    }

    // Full content view when agent specified
    if (agentId && agentName) {
      output(OutputFormatter.createBlockContentView(blockList, agentName, options?.short || false, agentCounts));
      return;
    }

    output(OutputFormatter.createBlockTable(blockList, isWide, agentCounts));
  } catch (error) {
    spinner.fail('Failed to load blocks');
    throw error;
  }
}
