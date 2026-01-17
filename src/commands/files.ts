import { LettaClientWrapper } from '../lib/letta-client';
import { AgentResolver } from '../lib/agent-resolver';
import { OutputFormatter } from '../lib/ux/output-formatter';

interface AgentFile {
  id: string;
  file_id: string;
  file_name: string;
  folder_id: string;
  folder_name: string;
  is_open: boolean;
  last_accessed_at: string;
}

export async function filesCommand(agentName: string, options: { output?: string }, command: any) {
  const verbose = command.parent?.opts().verbose || false;
  const client = new LettaClientWrapper();
  const resolver = new AgentResolver(client);

  // Resolve agent name to ID
  const { agent } = await resolver.findAgentByName(agentName);
  if (!agent) {
    console.error(`Agent "${agentName}" not found`);
    process.exit(1);
  }

  // Fetch files
  const baseUrl = process.env.LETTA_BASE_URL;
  const response = await fetch(`${baseUrl}/v1/agents/${agent.id}/files`);

  if (!response.ok) {
    console.error(`Failed to fetch files: ${response.status}`);
    process.exit(1);
  }

  const data = await response.json() as { files: AgentFile[] };
  const files = data.files || [];

  if (OutputFormatter.handleJsonOutput(files, options.output)) {
    return;
  }

  console.log(`Files for agent: ${agentName}`);
  console.log('='.repeat(40));

  if (files.length === 0) {
    console.log('\nNo files attached');
    return;
  }

  // Group by folder
  const byFolder = new Map<string, AgentFile[]>();
  for (const file of files) {
    const folder = file.folder_name || 'unknown';
    if (!byFolder.has(folder)) {
      byFolder.set(folder, []);
    }
    byFolder.get(folder)!.push(file);
  }

  // Summary
  const openCount = files.filter(f => f.is_open).length;
  const closedCount = files.length - openCount;
  console.log(`\nTotal: ${files.length} files (${openCount} open, ${closedCount} closed)\n`);

  // List by folder
  for (const [folder, folderFiles] of byFolder) {
    console.log(`Folder: ${folder}`);
    for (const file of folderFiles) {
      const status = file.is_open ? '[OPEN]  ' : '[CLOSED]';
      const name = file.file_name.replace(`${folder}/`, '');
      console.log(`  ${status} ${name}`);

      if (verbose) {
        console.log(`           ID: ${file.file_id}`);
        console.log(`           Last accessed: ${file.last_accessed_at || 'never'}`);
      }
    }
    console.log('');
  }
}
