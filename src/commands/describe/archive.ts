import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { findAttachedAgents } from '../../lib/resources/resource-usage';
import { output } from '../../lib/shared/logger';
import { displayArchiveDetails, ArchiveDetailsData } from '../../lib/ux/display';
import { DescribeOptions } from './types';

export async function describeArchive(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  name: string,
  options: DescribeOptions = {},
  spinnerEnabled?: boolean
) {
  const spinner = createSpinner(`Loading details for archive ${name}...`, spinnerEnabled).start();

  try {
    const allArchives = await client.listArchives();
    const archive = allArchives.find((a: any) => a.name === name || a.id === name);

    if (!archive) {
      spinner.fail(`Archive "${name}" not found`);
      throw new Error(`Archive "${name}" not found`);
    }

    spinner.text = 'Finding attached agents...';
    const attachedAgents = await findAttachedAgents(client, resolver, 'archives', archive.id);

    spinner.stop();

    if (OutputFormatter.handleJsonOutput({ ...archive, attached_agents: attachedAgents }, options?.output)) {
      return;
    }

    const embedding = archive.embedding_config?.embedding_model || archive.embedding || undefined;

    const displayData: ArchiveDetailsData = {
      id: archive.id,
      name: archive.name,
      description: archive.description,
      embedding,
      vectorDbProvider: archive.vector_db_provider,
      created: archive.created_at,
      updated: archive.updated_at,
      attachedAgents: attachedAgents.map((a: any) => ({ name: a.name, id: a.id })),
    };

    output(displayArchiveDetails(displayData));
  } catch (error) {
    spinner.fail(`Failed to load details for archive ${name}`);
    throw error;
  }
}
