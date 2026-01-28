import { LettaClientWrapper } from '../../lib/letta-client';
import { AgentResolver } from '../../lib/agent-resolver';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { normalizeToArray, findAttachedAgents } from '../../lib/resource-usage';
import { displayFolderDetails, FolderDetailsData } from '../../lib/ux/display';
import { output } from '../../lib/logger';
import { DescribeOptions } from './types';

export async function describeFolder(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  name: string,
  options?: DescribeOptions,
  spinnerEnabled?: boolean
) {
  const spinner = createSpinner(`Loading details for folder ${name}...`, spinnerEnabled).start();

  try {
    // Find folder by name
    const allFolders = await client.listFolders();
    const folder = allFolders.find((f: any) => f.name === name || f.id === name);

    if (!folder) {
      spinner.fail(`Folder "${name}" not found`);
      throw new Error(`Folder "${name}" not found`);
    }

    // Get folder files
    spinner.text = 'Loading folder contents...';
    const fileList = normalizeToArray(await client.listFolderFiles(folder.id));

    // Compute which agents use this folder
    spinner.text = 'Finding attached agents...';
    const attachedAgents = await findAttachedAgents(client, resolver, 'folders', folder.id);

    spinner.stop();

    if (OutputFormatter.handleJsonOutput({ ...folder, files: fileList, attached_agents: attachedAgents }, options?.output)) {
      return;
    }

    const displayData: FolderDetailsData = {
      id: folder.id,
      name: folder.name,
      description: folder.description,
      created: folder.created_at,
      attachedAgents: attachedAgents.map((a: any) => ({ name: a.name, id: a.id })),
      files: fileList.map((f: any) => f.name || f.file_name || f.id),
    };

    output(displayFolderDetails(displayData));
  } catch (error) {
    spinner.fail(`Failed to load details for folder ${name}`);
    throw error;
  }
}
