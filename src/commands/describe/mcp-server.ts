import { LettaClientWrapper } from '../../lib/letta-client';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { displayMcpServerDetails, McpServerDetailsData } from '../../lib/ux/display';
import { output } from '../../lib/logger';
import { DescribeOptions } from './types';

export async function describeMcpServer(
  client: LettaClientWrapper,
  name: string,
  options?: DescribeOptions,
  spinnerEnabled?: boolean
) {
  const spinner = createSpinner(`Loading details for MCP server ${name}...`, spinnerEnabled).start();

  try {
    // Find MCP server by name or ID
    const serverList = await client.listMcpServers();
    const servers = Array.isArray(serverList) ? serverList : [];
    const server = servers.find((s: any) =>
      s.server_name === name || s.name === name || s.id === name
    );

    if (!server) {
      spinner.fail(`MCP server "${name}" not found`);
      throw new Error(`MCP server "${name}" not found`);
    }

    // Get tools for this MCP server
    spinner.text = 'Loading MCP server tools...';
    let tools: any[] = [];
    try {
      const toolList = await client.listMcpServerTools(server.id!);
      tools = Array.isArray(toolList) ? toolList : [];
    } catch (e) {
      // Tools might not be available
    }

    spinner.stop();

    // Cast to any for flexible property access
    const s: any = server;

    if (OutputFormatter.handleJsonOutput({ ...s, tools }, options?.output)) {
      return;
    }

    const displayData: McpServerDetailsData = {
      id: s.id,
      name: s.server_name || s.name || 'Unknown',
      type: s.mcp_server_type,
      serverUrl: s.server_url,
      command: s.command,
      args: s.args,
      authHeader: s.auth_header,
      tools: tools.map((t: any) => ({ name: t.name || t.id, description: t.description })),
    };

    output(displayMcpServerDetails(displayData));
  } catch (error) {
    spinner.fail(`Failed to load details for MCP server ${name}`);
    throw error;
  }
}
