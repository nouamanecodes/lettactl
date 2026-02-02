import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { createSpinner } from '../../lib/ux/spinner';
import { computeAgentCounts } from '../../lib/resources/resource-usage';
import { log, warn, output } from '../../lib/shared/logger';
import { displayOrphanedResources } from '../../lib/ux/display';

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
      const deleteSpinner = createSpinner(`Deleting ${orphanedArchives.length} orphaned archives...`, useSpinner).start();

      let deleted = 0;
      for (const archive of orphanedArchives) {
        try {
          await client.deleteArchive(archive.id);
          deleted++;
          if (isVerbose) log(`Deleted archive: ${archive.name || archive.id}`);
        } catch (err: any) {
          warn(`Failed to delete archive ${archive.name || archive.id}: ${err.message}`);
        }
      }

      deleteSpinner.succeed(`Deleted ${deleted} orphaned archives`);
      return deleted;
    }

    return orphanedArchives.length;
  } catch (error) {
    spinner.fail('Failed to find orphaned archives');
    throw error;
  }
}
