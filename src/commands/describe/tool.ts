import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { findAttachedAgents } from '../../lib/resources/resource-usage';
import { displayToolDetails, ToolDetailsData } from '../../lib/ux/display';
import { output } from '../../lib/shared/logger';
import { DescribeOptions } from './types';

export async function describeTool(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  name: string,
  options?: DescribeOptions,
  spinnerEnabled?: boolean
) {
  const spinner = createSpinner(`Loading details for tool ${name}...`, spinnerEnabled).start();

  try {
    // Find tool by name
    const allTools = await client.listTools();
    const tool = allTools.find((t: any) => t.name === name || t.id === name);

    if (!tool) {
      spinner.fail(`Tool "${name}" not found`);
      throw new Error(`Tool "${name}" not found`);
    }

    // Compute which agents use this tool
    spinner.text = 'Finding attached agents...';
    const attachedAgents = await findAttachedAgents(client, resolver, 'tools', tool.id);

    spinner.stop();

    if (OutputFormatter.handleJsonOutput({ ...tool, attached_agents: attachedAgents }, options?.output)) {
      return;
    }

    const displayData: ToolDetailsData = {
      id: tool.id,
      name: tool.name,
      description: tool.description,
      module: tool.module,
      created: tool.created_at,
      attachedAgents: attachedAgents.map((a: any) => ({ name: a.name, id: a.id })),
      sourceCode: tool.source_code,
    };

    output(displayToolDetails(displayData));
  } catch (error) {
    spinner.fail(`Failed to load details for tool ${name}`);
    throw error;
  }
}
