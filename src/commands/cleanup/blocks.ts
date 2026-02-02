import { LettaClientWrapper } from '../../lib/client/letta-client';
import { createSpinner } from '../../lib/ux/spinner';
import { log, warn, output } from '../../lib/shared/logger';
import { displayOrphanedResources } from '../../lib/ux/display';

export async function cleanupOrphanedBlocks(
  client: LettaClientWrapper,
  isDryRun: boolean,
  spinnerEnabled?: boolean,
  verbose?: boolean
): Promise<number> {
  const useSpinner = spinnerEnabled ?? true;
  const isVerbose = verbose ?? false;
  const spinner = createSpinner('Finding orphaned blocks...', useSpinner).start();

  try {
    const orphanedBlocks = await client.listBlocks({ connectedAgentsCountEq: [0] });

    if (orphanedBlocks.length === 0) {
      spinner.succeed('No orphaned blocks found');
      return 0;
    }

    spinner.stop();

    const items = orphanedBlocks.map((block: any) => ({
      name: block.label || block.name || block.id,
      detail: `${block.value?.length || 0} chars`,
    }));
    output(displayOrphanedResources('Blocks', items));

    if (!isDryRun) {
      const deleteSpinner = createSpinner(`Deleting ${orphanedBlocks.length} orphaned blocks...`, useSpinner).start();

      let deleted = 0;
      for (const block of orphanedBlocks) {
        try {
          await client.deleteBlock(block.id);
          deleted++;
          if (isVerbose) log(`Deleted block: ${block.label || block.id}`);
        } catch (err: any) {
          warn(`Failed to delete block ${block.label || block.id}: ${err.message}`);
        }
      }

      deleteSpinner.succeed(`Deleted ${deleted} orphaned blocks`);
      return deleted;
    }

    return orphanedBlocks.length;
  } catch (error) {
    spinner.fail('Failed to find orphaned blocks');
    throw error;
  }
}
