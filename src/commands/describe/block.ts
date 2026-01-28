import { LettaClientWrapper } from '../../lib/letta-client';
import { AgentResolver } from '../../lib/agent-resolver';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { findAttachedAgents } from '../../lib/resource-usage';
import { displayBlockDetails, BlockDetailsData } from '../../lib/ux/display';
import { output } from '../../lib/logger';
import { DescribeOptions } from './types';

export async function describeBlock(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  name: string,
  options?: DescribeOptions,
  spinnerEnabled?: boolean
) {
  const spinner = createSpinner(`Loading details for block ${name}...`, spinnerEnabled).start();

  try {
    // Find block by name/label
    const allBlocks = await client.listBlocks();
    const block = allBlocks.find((b: any) => b.label === name || b.name === name || b.id === name);

    if (!block) {
      spinner.fail(`Block "${name}" not found`);
      throw new Error(`Block "${name}" not found`);
    }

    // Compute which agents use this block
    spinner.text = 'Finding attached agents...';
    const attachedAgents = await findAttachedAgents(client, resolver, 'blocks', block.id);

    spinner.stop();

    if (OutputFormatter.handleJsonOutput({ ...block, attached_agents: attachedAgents }, options?.output)) {
      return;
    }

    const displayData: BlockDetailsData = {
      id: block.id,
      label: block.label || block.name || 'Unknown',
      description: block.description,
      limit: block.limit,
      currentSize: block.value?.length || 0,
      created: block.created_at,
      attachedAgents: attachedAgents.map((a: any) => ({ name: a.name, id: a.id })),
      valuePreview: block.value?.length > 500 ? block.value.substring(0, 500) + '...' : block.value,
      agentCount: attachedAgents.length,
    };

    output(displayBlockDetails(displayData));
  } catch (error) {
    spinner.fail(`Failed to load details for block ${name}`);
    throw error;
  }
}
