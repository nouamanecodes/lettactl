import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { withErrorHandling } from '../../lib/shared/error-handler';
import { getSpinnerEnabled } from '../../lib/ux/spinner';
import { output } from '../../lib/shared/logger';
import { displayCleanupNote } from '../../lib/ux/display';
import { SUPPORTED_RESOURCES, CleanupOptions } from './types';
import { cleanupOrphanedBlocks } from './blocks';
import { cleanupOrphanedFolders } from './folders';
import { cleanupOrphanedArchives } from './archives';

async function cleanupCommandImpl(
  resource: string,
  options: CleanupOptions,
  command?: any
) {
  const verbose = Boolean(command?.parent?.opts().verbose);
  const spinnerEnabled = getSpinnerEnabled(command) ?? true;

  if (!SUPPORTED_RESOURCES.includes(resource)) {
    throw new Error(`Unsupported resource type: ${resource}. Supported: ${SUPPORTED_RESOURCES.join(', ')}`);
  }

  const client = new LettaClientWrapper();
  const resolver = new AgentResolver(client);

  // Default to dry-run if --force not specified
  const isDryRun = !options.force || Boolean(options.dryRun);

  if (isDryRun) {
    output(displayCleanupNote(0, true).replace(/\d+ orphaned/, '...'));
    output('');
  }

  let totalDeleted = 0;

  if (resource === 'blocks' || resource === 'all') {
    const deleted = await cleanupOrphanedBlocks(client, isDryRun, spinnerEnabled, verbose);
    totalDeleted += deleted;
  }

  if (resource === 'folders' || resource === 'all') {
    const deleted = await cleanupOrphanedFolders(client, resolver, isDryRun, spinnerEnabled, verbose);
    totalDeleted += deleted;
  }

  if (resource === 'archives' || resource === 'all') {
    const deleted = await cleanupOrphanedArchives(client, resolver, isDryRun, spinnerEnabled, verbose);
    totalDeleted += deleted;
  }

  output('');
  output(displayCleanupNote(totalDeleted, isDryRun));
}

export const cleanupCommand = withErrorHandling('Cleanup command', cleanupCommandImpl);
