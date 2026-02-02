import { LettaClientWrapper } from '../../lib/client/letta-client';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { output } from '../../lib/shared/logger';
import { GetOptions } from './types';

export async function getMcpServers(
  client: LettaClientWrapper,
  options?: GetOptions,
  spinnerEnabled?: boolean
) {
  const spinner = createSpinner('Loading MCP servers...', spinnerEnabled).start();

  try {
    const serverList = await client.listMcpServers();
    const servers = Array.isArray(serverList) ? serverList : [];

    spinner.stop();

    if (OutputFormatter.handleJsonOutput(servers, options?.output)) {
      return;
    }

    if (servers.length === 0) {
      output('No MCP servers found');
      return;
    }

    output(OutputFormatter.createMcpServerTable(servers));
  } catch (error) {
    spinner.fail('Failed to load MCP servers');
    throw error;
  }
}
