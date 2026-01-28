import { LettaClientWrapper } from '../../lib/letta-client';
import { AgentResolver } from '../../lib/agent-resolver';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { normalizeToArray, findAttachedAgents } from '../../lib/resource-usage';
import { displayFileDetails, FileDetailsData } from '../../lib/ux/display';
import { output } from '../../lib/logger';
import { DescribeOptions } from './types';

export async function describeFile(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  name: string,
  options?: DescribeOptions,
  spinnerEnabled?: boolean
) {
  const spinner = createSpinner(`Loading details for file ${name}...`, spinnerEnabled).start();

  try {
    // Find file by name or ID across all folders
    spinner.text = 'Searching for file...';
    const allFolders = await client.listFolders();

    let foundFile: any = null;
    const foldersContainingFile: { name: string; id: string; agentCount?: number }[] = [];

    // Search through all folders to find the file
    for (const folder of allFolders) {
      const files = normalizeToArray(await client.listFolderFiles(folder.id));
      const matchingFile = files.find((f: any) =>
        f.name === name || f.file_name === name || f.id === name
      );

      if (matchingFile) {
        if (!foundFile) {
          foundFile = matchingFile;
        }
        // Compute agents attached to this folder
        const attachedAgents = await findAttachedAgents(client, resolver, 'folders', folder.id);
        foldersContainingFile.push({
          name: folder.name || folder.id,
          id: folder.id,
          agentCount: attachedAgents.length,
        });
      }
    }

    if (!foundFile) {
      spinner.fail(`File "${name}" not found`);
      throw new Error(`File "${name}" not found in any folder`);
    }

    spinner.stop();

    if (OutputFormatter.handleJsonOutput({ ...foundFile, folders: foldersContainingFile }, options?.output)) {
      return;
    }

    const displayData: FileDetailsData = {
      id: foundFile.id || foundFile.file_id,
      name: foundFile.name || foundFile.file_name,
      size: foundFile.size || foundFile.file_size,
      mimeType: foundFile.mime_type || foundFile.content_type,
      created: foundFile.created_at,
      folders: foldersContainingFile,
    };

    output(displayFileDetails(displayData));
  } catch (error) {
    spinner.fail(`Failed to load details for file ${name}`);
    throw error;
  }
}
