import { LettaClientWrapper } from '../../lib/letta-client';
import { AgentResolver } from '../../lib/agent-resolver';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { normalizeToArray, computeAgentCounts } from '../../lib/resource-usage';
import { output } from '../../lib/logger';
import { GetOptions } from './types';

export async function getFolders(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  options?: GetOptions,
  spinnerEnabled?: boolean,
  agentId?: string
) {
  const isWide = options?.output === 'wide';

  let label = 'Loading folders...';
  if (agentId) label = 'Loading agent folders...';
  else if (options?.shared) label = 'Loading shared folders...';
  else if (options?.orphaned) label = 'Loading orphaned folders...';

  const spinner = createSpinner(label, spinnerEnabled).start();

  // Helper to safely get file count for a folder
  const getFileCount = async (folderId: string): Promise<number> => {
    try {
      const files = await client.listFolderFiles(folderId);
      const fileList = Array.isArray(files) ? files : ((files as any)?.items || []);
      return fileList.length;
    } catch {
      return 0;
    }
  };

  try {
    let folderList: any[];
    let agentCounts: Map<string, number> | undefined;
    let fileCounts: Map<string, number> | undefined;

    if (agentId) {
      // For agent-specific folders, no need for agent counts
      folderList = normalizeToArray(await client.listAgentFolders(agentId));
    } else {
      // Always compute agent counts for folder listing
      spinner.text = 'Fetching all folders...';
      const allFolders = await client.listFolders();

      spinner.text = 'Computing folder usage...';
      agentCounts = await computeAgentCounts(client, resolver, 'folders', allFolders.map((f: any) => f.id));

      // Filter based on flag
      if (options?.shared) {
        folderList = allFolders.filter((f: any) => (agentCounts!.get(f.id) || 0) >= 2);
      } else if (options?.orphaned) {
        folderList = allFolders.filter((f: any) => (agentCounts!.get(f.id) || 0) === 0);
      } else {
        folderList = allFolders;
      }
    }

    // Compute file counts for all folders in parallel
    spinner.text = 'Computing file counts...';
    const fileCountResults = await Promise.all(
      folderList.map(async (f: any) => ({ id: f.id, count: await getFileCount(f.id) }))
    );
    fileCounts = new Map(fileCountResults.map(r => [r.id, r.count]));

    spinner.stop();

    if (OutputFormatter.handleJsonOutput(folderList, options?.output)) {
      return;
    }

    if (folderList.length === 0) {
      if (agentId) output('No folders attached to this agent');
      else if (options?.shared) output('No shared folders found (attached to 2+ agents)');
      else if (options?.orphaned) output('No orphaned folders found (attached to 0 agents)');
      else output('No folders found');
      return;
    }

    output(OutputFormatter.createFolderTable(folderList, isWide, agentCounts, fileCounts));
  } catch (error) {
    spinner.fail('Failed to load folders');
    throw error;
  }
}
