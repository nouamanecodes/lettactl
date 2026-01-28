import { LettaClientWrapper } from '../../lib/letta-client';
import { AgentResolver } from '../../lib/agent-resolver';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { normalizeToArray, computeAgentCounts } from '../../lib/resource-usage';
import { output } from '../../lib/logger';
import { GetOptions } from './types';

export async function getFiles(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  options?: GetOptions,
  spinnerEnabled?: boolean,
  agentId?: string
) {
  const isWide = options?.output === 'wide';

  let label = 'Loading files...';
  if (agentId) label = 'Loading agent files...';
  else if (options?.shared) label = 'Loading shared files...';
  else if (options?.orphaned) label = 'Loading orphaned files...';

  const spinner = createSpinner(label, spinnerEnabled).start();

  // Helper to safely get files from a folder
  const getFolderFiles = async (folderId: string): Promise<any[]> => {
    try {
      const files = await client.listFolderFiles(folderId);
      return Array.isArray(files) ? files : ((files as any)?.items || []);
    } catch {
      return [];
    }
  };

  try {
    let fileList: any[] = [];
    let agentCounts: Map<string, number> | undefined;

    if (agentId) {
      // For agent-specific files, get folders attached to agent then get their files
      const agentFolders = normalizeToArray(await client.listAgentFolders(agentId));

      for (const folder of agentFolders) {
        const files = await getFolderFiles(folder.id);
        for (const file of files) {
          fileList.push({
            ...file,
            folderName: folder.name,
            folderId: folder.id,
          });
        }
      }
    } else {
      // Get all folders and their files
      spinner.text = 'Fetching all folders...';
      const allFolders = await client.listFolders();

      spinner.text = 'Computing folder usage...';
      agentCounts = await computeAgentCounts(client, resolver, 'folders', allFolders.map((f: any) => f.id));

      spinner.text = 'Fetching files from folders...';
      for (const folder of allFolders) {
        const files = await getFolderFiles(folder.id);
        for (const file of files) {
          fileList.push({
            ...file,
            folderName: folder.name,
            folderId: folder.id,
          });
        }
      }

      // Filter based on flag (by folder's agent count)
      if (options?.shared) {
        fileList = fileList.filter((f: any) => (agentCounts!.get(f.folderId) || 0) >= 2);
      } else if (options?.orphaned) {
        fileList = fileList.filter((f: any) => (agentCounts!.get(f.folderId) || 0) === 0);
      }
    }

    spinner.stop();

    if (OutputFormatter.handleJsonOutput(fileList, options?.output)) {
      return;
    }

    if (fileList.length === 0) {
      if (agentId) output('No files attached to this agent');
      else if (options?.shared) output('No shared files found (in folders attached to 2+ agents)');
      else if (options?.orphaned) output('No orphaned files found (in folders attached to 0 agents)');
      else output('No files found');
      return;
    }

    output(OutputFormatter.createFileTable(fileList, agentCounts, isWide));
  } catch (error) {
    spinner.fail('Failed to load files');
    throw error;
  }
}
