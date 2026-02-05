import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { createSpinner } from '../../lib/ux/spinner';
import { computeAgentCounts } from '../../lib/resources/resource-usage';
import { output } from '../../lib/shared/logger';
import { displayOrphanedResources } from '../../lib/ux/display';
import { deleteWithProgress } from './helpers';

export async function cleanupOrphanedArchives(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  isDryRun: boolean,
  spinnerEnabled?: boolean,
  verbose?: boolean
): Promise<number> {
  const useSpinner = spinnerEnabled ?? true;
  const isVerbose = verbose ?? false;
  const spinner = createSpinner('Finding orphaned archives...', useSpinner).start();

  try {
    const allArchives = await client.listArchives();
    const archiveIds = allArchives.map((a: any) => a.id);

    const agentCounts = await computeAgentCounts(client, resolver, 'archives', archiveIds);
    const orphanedArchives = allArchives.filter((a: any) => agentCounts.get(a.id) === 0);

    if (orphanedArchives.length === 0) {
      spinner.succeed('No orphaned archives found');
      return 0;
    }

    spinner.stop();

    const items = orphanedArchives.map((archive: any) => ({
      name: archive.name || archive.id,
      detail: archive.embedding_config?.embedding_model || archive.embedding || 'unknown embedding',
    }));
    output(displayOrphanedResources('Archives', items));

    if (!isDryRun) {
      const items = orphanedArchives.map((archive: any) => ({
        id: archive.id,
        name: archive.name || archive.id
      }));
      return await deleteWithProgress({
        items,
        resourceType: 'archives',
        deleteFn: (id) => client.deleteArchive(id),
        useSpinner,
        verbose: isVerbose
      });
    }

    return orphanedArchives.length;
  } catch (error) {
    spinner.fail('Failed to find orphaned archives');
    throw error;
  }
}
