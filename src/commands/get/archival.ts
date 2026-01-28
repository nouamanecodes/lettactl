import { LettaClientWrapper } from '../../lib/letta-client';
import { AgentResolver } from '../../lib/agent-resolver';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { output } from '../../lib/logger';
import { GetOptions } from './types';

export async function getArchival(
  client: LettaClientWrapper,
  _resolver: AgentResolver,
  options?: GetOptions,
  spinnerEnabled?: boolean,
  agentId?: string,
  agentName?: string
) {
  if (!agentId || !agentName) {
    throw new Error('Agent name is required for archival memory. Usage: lettactl get archival <agent>');
  }

  const isSearch = !!options?.query;
  const label = isSearch ? `Searching archival memory for "${options!.query}"...` : 'Loading archival memory...';
  const spinner = createSpinner(label, spinnerEnabled).start();

  try {
    let entries: any[];

    if (isSearch) {
      const result = await client.searchAgentArchival(agentId, options!.query!);
      // Search returns { count, results: [{ id, content, timestamp, tags }] }
      entries = (result as any).results?.map((r: any) => ({
        ...r,
        text: r.content || r.text,
        created_at: r.timestamp || r.created_at,
        score: r.score,
      })) || [];
    } else {
      const result = await client.listAgentArchival(agentId);
      entries = Array.isArray(result) ? result : [];
    }

    spinner.stop();

    if (OutputFormatter.handleJsonOutput(entries, options?.output)) {
      return;
    }

    if (entries.length === 0) {
      if (isSearch) output(`No archival entries matching "${options!.query}" for ${agentName}`);
      else output(`No archival memory entries for ${agentName}`);
      return;
    }

    if (options?.full) {
      output(OutputFormatter.createArchivalContentView(entries, agentName));
    } else {
      output(OutputFormatter.createArchivalTable(entries, agentName));
    }
  } catch (error) {
    spinner.fail('Failed to load archival memory');
    throw error;
  }
}
