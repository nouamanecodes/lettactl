import { LettaClientWrapper } from '../../lib/letta-client';
import { AgentResolver } from '../../lib/agent-resolver';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { normalizeToArray, computeAgentCounts } from '../../lib/resource-usage';
import { output } from '../../lib/logger';
import { GetOptions } from './types';

export async function getTools(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  options?: GetOptions,
  spinnerEnabled?: boolean,
  agentId?: string
) {
  const isWide = options?.output === 'wide';

  let label = 'Loading tools...';
  if (agentId) label = 'Loading agent tools...';
  else if (options?.shared) label = 'Loading shared tools...';
  else if (options?.orphaned) label = 'Loading orphaned tools...';

  const spinner = createSpinner(label, spinnerEnabled).start();

  try {
    let toolList: any[];
    let agentCounts: Map<string, number> | undefined;

    if (agentId) {
      // For agent-specific tools, no need for agent counts
      toolList = normalizeToArray(await client.listAgentTools(agentId));
    } else {
      // Always compute agent counts for tool listing
      spinner.text = 'Fetching all tools...';
      const allTools = await client.listTools();

      spinner.text = 'Computing tool usage...';
      agentCounts = await computeAgentCounts(client, resolver, 'tools', allTools.map((t: any) => t.id));

      // Filter based on flag
      if (options?.shared) {
        toolList = allTools.filter((t: any) => (agentCounts!.get(t.id) || 0) >= 2);
      } else if (options?.orphaned) {
        toolList = allTools.filter((t: any) => (agentCounts!.get(t.id) || 0) === 0);
      } else {
        toolList = allTools;
      }
    }
    spinner.stop();

    if (OutputFormatter.handleJsonOutput(toolList, options?.output)) {
      return;
    }

    if (toolList.length === 0) {
      if (agentId) output('No tools attached to this agent');
      else if (options?.shared) output('No shared tools found (attached to 2+ agents)');
      else if (options?.orphaned) output('No orphaned tools found (attached to 0 agents)');
      else output('No tools found');
      return;
    }

    output(OutputFormatter.createToolTable(toolList, isWide, agentCounts));
  } catch (error) {
    spinner.fail('Failed to load tools');
    throw error;
  }
}
