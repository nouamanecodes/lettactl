import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { output, error } from '../../lib/shared/logger';
import { isAgentResourceSurfaceUnavailable, shouldPrintNotAvailableForAgent } from '../get/availability';

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
    error(`Agent "${agentName}" not found`);
    process.exit(1);
  }

  if (await isAgentResourceSurfaceUnavailable(client, agent.id)) {
    if (OutputFormatter.handleJsonOutput([], options.output)) return;
    output(`Files for agent: ${agentName}`);
    output('='.repeat(40));
    output('\nnot available');
    return;
  }

  // Fetch files
  const baseUrl = process.env.LETTA_BASE_URL;
  const headers: Record<string, string> = {};
  if (process.env.LETTA_API_KEY) headers.Authorization = `Bearer ${process.env.LETTA_API_KEY}`;
  if (process.env.LETTA_PROJECT_ID) headers['X-Project-Id'] = process.env.LETTA_PROJECT_ID;
  if (process.env.LETTA_PROJECT) headers['X-Project'] = process.env.LETTA_PROJECT;
  const response = await fetch(`${baseUrl}/v1/agents/${agent.id}/files`, { headers });

  if (!response.ok) {
    error(`Failed to fetch files: ${response.status}`);
    process.exit(1);
  }

  const data = await response.json() as { files: AgentFile[] };
  const files = data.files || [];

  if (OutputFormatter.handleJsonOutput(files, options.output)) {
    return;
  }

  output(`Files for agent: ${agentName}`);
  output('='.repeat(40));

  if (files.length === 0) {
    if (await shouldPrintNotAvailableForAgent(client, agent.id, files, options.output)) {
      output('\nnot available');
    } else {
      output('\nNo files attached');
    }
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
  output(`\nTotal: ${files.length} files (${openCount} open, ${closedCount} closed)\n`);

  // List by folder
  for (const [folder, folderFiles] of byFolder) {
    output(`Folder: ${folder}`);
    for (const file of folderFiles) {
      const status = file.is_open ? '[OPEN]  ' : '[CLOSED]';
      const name = file.file_name.replace(`${folder}/`, '');
      output(`  ${status} ${name}`);

      if (verbose) {
        output(`           ID: ${file.file_id}`);
        output(`           Last accessed: ${file.last_accessed_at || 'never'}`);
      }
    }
    output('');
  }
}
