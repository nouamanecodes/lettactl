import { LettaClientWrapper } from '../../lib/client/letta-client';
import { createSpinner } from '../../lib/ux/spinner';
import { output, error } from '../../lib/shared/logger';
import { DeleteAllOptions } from './types';

export async function deleteAllMcpServers(client: LettaClientWrapper, options?: DeleteAllOptions, spinnerEnabled: boolean = true) {
  const listSpinner = createSpinner('Loading MCP servers...', spinnerEnabled).start();
  const servers = await client.listMcpServers();
  const serverList = Array.isArray(servers) ? servers : [];
  listSpinner.stop();

  let serversToDelete = serverList;
  if (options?.pattern) {
    const pattern = new RegExp(options.pattern, 'i');
    serversToDelete = serverList.filter((s: any) =>
      pattern.test(s.server_name || s.name || '') || pattern.test(s.id)
    );
  }

  if (serversToDelete.length === 0) {
    output(options?.pattern ? `No MCP servers found matching pattern: ${options.pattern}` : 'No MCP servers found to delete');
    return;
  }

  output(`Found ${serversToDelete.length} MCP server(s) to delete:`);
  serversToDelete.forEach((s: any, i: number) => {
    const name = (s as any).server_name || (s as any).name || s.id;
    output(`  ${i + 1}. ${name} (${s.id})`);
  });

  if (!options?.force) {
    output('\nThis will permanently delete all listed MCP servers.');
    output('Use --force to confirm deletion.');
    process.exit(1);
  }

  const spinner = createSpinner(`Deleting ${serversToDelete.length} MCP servers...`, spinnerEnabled).start();
  let deleted = 0;
  for (const server of serversToDelete) {
    const serverName = (server as any).server_name || (server as any).name || server.id;
    try {
      await client.deleteMcpServer(server.id!);
      deleted++;
    } catch (err: any) {
      error(`Failed to delete MCP server ${serverName}: ${err.message}`);
    }
  }
  spinner.succeed(`Deleted ${deleted}/${serversToDelete.length} MCP server(s)`);
}
