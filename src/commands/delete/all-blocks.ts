import { LettaClientWrapper } from '../../lib/letta-client';
import { normalizeResponse } from '../../lib/response-normalizer';
import { createSpinner } from '../../lib/ux/spinner';
import { output, error } from '../../lib/logger';
import { DeleteAllOptions } from './types';

export async function deleteAllBlocks(client: LettaClientWrapper, options?: DeleteAllOptions, spinnerEnabled: boolean = true) {
  const listSpinner = createSpinner('Loading blocks...', spinnerEnabled).start();
  const blocks = await client.listBlocks();
  const blockList = normalizeResponse(blocks);
  listSpinner.stop();

  let blocksToDelete = blockList;
  if (options?.pattern) {
    const pattern = new RegExp(options.pattern, 'i');
    blocksToDelete = blockList.filter((b: any) => pattern.test(b.label || b.name || '') || pattern.test(b.id));
  }

  if (blocksToDelete.length === 0) {
    output(options?.pattern ? `No blocks found matching pattern: ${options.pattern}` : 'No blocks found to delete');
    return;
  }

  output(`Found ${blocksToDelete.length} block(s) to delete:`);
  blocksToDelete.forEach((b: any, i: number) => output(`  ${i + 1}. ${b.label || b.name || b.id} (${b.id})`));

  if (!options?.force) {
    output('\nThis will permanently delete all listed memory blocks.');
    output('WARNING: Blocks attached to agents will cause errors.');
    output('Use --force to confirm deletion.');
    process.exit(1);
  }

  const spinner = createSpinner(`Deleting ${blocksToDelete.length} blocks...`, spinnerEnabled).start();
  let deleted = 0;
  for (const block of blocksToDelete) {
    try {
      await client.deleteBlock(block.id);
      deleted++;
    } catch (err: any) {
      error(`Failed to delete block ${block.label || block.id}: ${err.message}`);
    }
  }
  spinner.succeed(`Deleted ${deleted}/${blocksToDelete.length} block(s)`);
}
