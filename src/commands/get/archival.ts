import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { output } from '../../lib/shared/logger';
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

  const hasFilters = !!(options?.archivalTags || options?.after || options?.before);
  const isSearch = !!(options?.query || hasFilters);
  const label = isSearch ? `Searching archival memory...` : 'Loading archival memory...';
  const spinner = createSpinner(label, spinnerEnabled).start();

  try {
    let entries: any[];

    if (isSearch) {
      // Use search endpoint — supports tags, datetime, and semantic query
      const query = options?.query || '*';
      const tags = options?.archivalTags?.split(',').map(t => t.trim()).filter(Boolean);
      const result = await client.searchAgentArchival(agentId, query, {
        limit: options?.limit,
        tags,
        tagMatchMode: options?.tagMatchMode as 'any' | 'all' | undefined,
        startDatetime: options?.after,
        endDatetime: options?.before,
      });
      entries = (result as any).results?.map((r: any) => ({
        ...r,
        text: r.content || r.text,
        created_at: r.timestamp || r.created_at,
        score: r.score,
      })) || [];
    } else {
      const result = await client.listAgentArchival(agentId, options?.limit);
      entries = Array.isArray(result) ? result : [];
    }

    spinner.stop();

    if (OutputFormatter.handleJsonOutput(entries, options?.output)) {
      return;
    }

    if (entries.length === 0) {
      if (isSearch) output(`No archival entries found for ${agentName}`);
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
