import { LettaClientWrapper } from '../../lib/client/letta-client';
import { createSpinner } from '../../lib/ux/spinner';
import { output } from '../../lib/shared/logger';
import { displayOrphanedResources } from '../../lib/ux/display';
import { deleteWithProgress } from './helpers';

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
      const items = orphanedBlocks.map((block: any) => ({
        id: block.id,
        name: block.label || block.id
      }));
      return await deleteWithProgress({
        items,
        resourceType: 'blocks',
        deleteFn: (id) => client.deleteBlock(id),
        useSpinner,
        verbose: isVerbose
      });
    }

    return orphanedBlocks.length;
  } catch (error) {
    spinner.fail('Failed to find orphaned blocks');
    throw error;
  }
}
