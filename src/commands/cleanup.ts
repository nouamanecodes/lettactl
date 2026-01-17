import { LettaClientWrapper } from '../lib/letta-client';
import { AgentResolver } from '../lib/agent-resolver';
import { withErrorHandling } from '../lib/error-handler';
import { createSpinner, getSpinnerEnabled } from '../lib/ux/spinner';
import { normalizeToArray, computeAgentCounts } from '../lib/resource-usage';
import { log, warn, output } from '../lib/logger';
import chalk from 'chalk';

const SUPPORTED_RESOURCES = ['blocks', 'folders', 'all'];

interface CleanupOptions {
  force?: boolean;
  dryRun?: boolean;
}

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
    output(chalk.yellow('Dry-run mode: showing what would be deleted. Use --force to actually delete.\n'));
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

  if (isDryRun) {
    output(chalk.yellow(`\nWould delete ${totalDeleted} orphaned resource(s). Use --force to actually delete.`));
  } else {
    output(chalk.green(`\nDeleted ${totalDeleted} orphaned resource(s).`));
  }
}

async function cleanupOrphanedBlocks(
  client: LettaClientWrapper,
  isDryRun: boolean,
  spinnerEnabled?: boolean,
  verbose?: boolean
): Promise<number> {
  const useSpinner = spinnerEnabled ?? true;
  const isVerbose = verbose ?? false;
  const spinner = createSpinner('Finding orphaned blocks...', useSpinner).start();

  try {
    // Use the API's built-in filter for blocks with 0 connected agents
    const orphanedBlocks = await client.listBlocks({ connectedAgentsCountEq: [0] });

    if (orphanedBlocks.length === 0) {
      spinner.succeed('No orphaned blocks found');
      return 0;
    }

    spinner.stop();
    output(`\n${chalk.cyan('Orphaned Blocks')} (${orphanedBlocks.length}):`);

    for (const block of orphanedBlocks) {
      const label = block.label || block.name || block.id;
      const size = block.value?.length || 0;
      output(`  - ${label} (${size} chars)`);
    }

    if (!isDryRun) {
      const deleteSpinner = createSpinner(`Deleting ${orphanedBlocks.length} orphaned blocks...`, useSpinner).start();

      let deleted = 0;
      for (const block of orphanedBlocks) {
        try {
          await client.deleteBlock(block.id);
          deleted++;
          if (isVerbose) log(`Deleted block: ${block.label || block.id}`);
        } catch (error: any) {
          warn(`Failed to delete block ${block.label || block.id}: ${error.message}`);
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

async function cleanupOrphanedFolders(
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

    // Compute agent counts for each folder
    const agentCounts = await computeAgentCounts(client, resolver, 'folders', folderIds);

    // Find folders with 0 agents
    const orphanedFolders = allFolders.filter((f: any) => agentCounts.get(f.id) === 0);

    if (orphanedFolders.length === 0) {
      spinner.succeed('No orphaned folders found');
      return 0;
    }

    // Get file counts for each orphaned folder
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
    output(`\n${chalk.cyan('Orphaned Folders')} (${orphanedFolders.length}, containing ${totalFiles} files):`);

    for (const folder of orphanedFolders) {
      const fileCount = folderFileCounts.get(folder.id) || 0;
      output(`  - ${folder.name || folder.id} (${fileCount} files)`);
    }

    if (!isDryRun) {
      const deleteSpinner = createSpinner(`Deleting ${orphanedFolders.length} orphaned folders...`, useSpinner).start();

      let deleted = 0;
      for (const folder of orphanedFolders) {
        try {
          await client.deleteFolder(folder.id);
          deleted++;
          if (isVerbose) log(`Deleted folder: ${folder.name || folder.id}`);
        } catch (error: any) {
          warn(`Failed to delete folder ${folder.name || folder.id}: ${error.message}`);
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

export const cleanupCommand = withErrorHandling('Cleanup command', cleanupCommandImpl);
