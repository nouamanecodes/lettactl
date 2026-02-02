import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { normalizeToArray, computeAgentCounts } from '../../lib/resources/resource-usage';
import { output } from '../../lib/shared/logger';
import { GetOptions } from './types';

export async function getArchives(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  options: GetOptions = {},
  spinnerEnabled?: boolean,
  agentId?: string
) {
  let label = 'Loading archives...';
  if (agentId) label = 'Loading agent archives...';
  else if (options?.shared) label = 'Loading shared archives...';
  else if (options?.orphaned) label = 'Loading orphaned archives...';

  const spinner = createSpinner(label, spinnerEnabled).start();

  try {
    let archiveList: any[];
    let agentCounts: Map<string, number> | undefined;

    if (agentId) {
      archiveList = normalizeToArray(await client.listAgentArchives(agentId));
    } else {
      archiveList = await client.listArchives();
    }

    if (!agentId) {
      spinner.text = 'Computing archive usage...';
      agentCounts = await computeAgentCounts(client, resolver, 'archives', archiveList.map((a: any) => a.id));

      if (options?.shared) {
        archiveList = archiveList.filter((a: any) => (agentCounts?.get(a.id) || 0) > 1);
      } else if (options?.orphaned) {
        archiveList = archiveList.filter((a: any) => (agentCounts?.get(a.id) || 0) === 0);
      }
    }

    spinner.stop();

    if (OutputFormatter.handleJsonOutput(archiveList, options?.output)) {
      return;
    }

    if (archiveList.length === 0) {
      if (agentId) output('No archives attached to this agent');
      else if (options?.shared) output('No shared archives found (attached to 2+ agents)');
      else if (options?.orphaned) output('No orphaned archives found (attached to 0 agents)');
      else output('No archives found');
      return;
    }

    output(OutputFormatter.createArchiveTable(archiveList, agentCounts));
  } catch (error) {
    spinner.fail('Failed to load archives');
    throw error;
  }
}
