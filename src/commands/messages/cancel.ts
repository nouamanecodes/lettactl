import { LettaClientWrapper } from '../../lib/letta-client';
import { AgentResolver } from '../../lib/agent-resolver';
import { output, error } from '../../lib/logger';
import { CancelOptions } from './types';

export async function cancelMessagesCommand(
  agentName: string,
  options: CancelOptions,
  command: any
) {
  const verbose = command.parent?.opts().verbose || false;

  try {
    const client = new LettaClientWrapper();
    const resolver = new AgentResolver(client);

    // Find the agent
    const { agent } = await resolver.findAgentByName(agentName);

    if (verbose) {
      output(`Canceling messages for agent: ${agent.name} (${agent.id})`);
      if (options.runIds) {
        output(`Specific run IDs: ${options.runIds}`);
      }
    }

    const runIds = options.runIds ? options.runIds.split(',').map(id => id.trim()) : undefined;
    const response = await client.cancelMessages(agent.id, runIds);

    output(`Messages canceled for agent ${agent.name}`);

    if (verbose) {
      output('Cancel response:', JSON.stringify(response, null, 2));
    }

  } catch (err: any) {
    error(`Failed to cancel messages for agent ${agentName}:`, err.message);
    throw err;
  }
}
