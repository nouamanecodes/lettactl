import { LettaClientWrapper } from '../../lib/letta-client';
import { validateRequired } from '../../lib/validators';
import { createSpinner, getSpinnerEnabled } from '../../lib/ux/spinner';
import { output } from '../../lib/logger';
import { DeleteOptions } from './types';

export async function deleteMcpServer(name: string, options?: DeleteOptions, command?: any) {
  validateRequired(name, 'MCP server name', 'lettactl delete mcp-servers <name>');

  const client = new LettaClientWrapper();

  // Find MCP server by name or ID
  const serverList = await client.listMcpServers();
  const servers = Array.isArray(serverList) ? serverList : [];
  const server = servers.find((s: any) =>
    s.server_name === name || s.name === name || s.id === name
  );

  if (!server) {
    throw new Error(`MCP server "${name}" not found`);
  }

  if (!options?.force) {
    output(`This will permanently delete MCP server: ${name} (${server.id})`);
    output('Use --force to confirm deletion');
    process.exit(1);
  }

  const spinnerEnabled = getSpinnerEnabled(command);
  const spinner = createSpinner(`Deleting MCP server ${name}...`, spinnerEnabled).start();

  try {
    await client.deleteMcpServer(server.id!);
    spinner.succeed(`MCP server ${name} deleted successfully`);
  } catch (err) {
    spinner.fail(`Failed to delete MCP server ${name}`);
    throw err;
  }
}
