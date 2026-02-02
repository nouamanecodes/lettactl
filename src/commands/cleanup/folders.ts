import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { createSpinner } from '../../lib/ux/spinner';
import { normalizeToArray, computeAgentCounts } from '../../lib/resources/resource-usage';
import { log, warn, output } from '../../lib/shared/logger';
import { displayOrphanedResources } from '../../lib/ux/display';

export async function cleanupOrphanedFolders(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  isDryRun: boolean,
  spinnerEnabled?: boolean,
  verbose?: boolean
): Promise<number> {
  const useSpinner = spinnerEnabled ?? true;
  const isVerbose = verbose ?? false;
  const spinner = createSpinner('Finding orphaned folders...', useSpinner).start();

  try {
    const allFolders = await client.listFolders();
    const folderIds = allFolders.map((f: any) => f.id);

    const agentCounts = await computeAgentCounts(client, resolver, 'folders', folderIds);
    const orphanedFolders = allFolders.filter((f: any) => agentCounts.get(f.id) === 0);

    if (orphanedFolders.length === 0) {
      spinner.succeed('No orphaned folders found');
      return 0;
    }

    spinner.text = 'Counting files in orphaned folders...';
    const folderFileCounts: Map<string, number> = new Map();
    let totalFiles = 0;

    for (const folder of orphanedFolders) {
      try {
        const files = normalizeToArray(await client.listFolderFiles(folder.id));
        folderFileCounts.set(folder.id, files.length);
        totalFiles += files.length;
      } catch {
        folderFileCounts.set(folder.id, 0);
      }
    }

    spinner.stop();

    const items = orphanedFolders.map((folder: any) => ({
      name: folder.name || folder.id,
      detail: `${folderFileCounts.get(folder.id) || 0} files`,
    }));
    output(displayOrphanedResources('Folders', items, `containing ${totalFiles} files`));

    if (!isDryRun) {
      const deleteSpinner = createSpinner(`Deleting ${orphanedFolders.length} orphaned folders...`, useSpinner).start();

      let deleted = 0;
      for (const folder of orphanedFolders) {
        try {
          await client.deleteFolder(folder.id);
          deleted++;
          if (isVerbose) log(`Deleted folder: ${folder.name || folder.id}`);
        } catch (err: any) {
          warn(`Failed to delete folder ${folder.name || folder.id}: ${err.message}`);
        }
      }

      deleteSpinner.succeed(`Deleted ${deleted} orphaned folders (and their files)`);
      return deleted;
    }

    return orphanedFolders.length;
  } catch (error) {
    spinner.fail('Failed to find orphaned folders');
    throw error;
  }
}
