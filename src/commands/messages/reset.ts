import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { output, error } from '../../lib/shared/logger';
import { ResetOptions } from './types';

export async function resetMessagesCommand(
  agentName: string,
  options: ResetOptions,
  command: any
) {
  const verbose = command.parent?.opts().verbose || false;

  try {
    const client = new LettaClientWrapper();
    const resolver = new AgentResolver(client);

    // Find the agent
    const { agent } = await resolver.findAgentByName(agentName);

    if (verbose) {
      output(`Resetting messages for agent: ${agent.name} (${agent.id})`);
      output(`Add default messages: ${options.addDefault || false}`);
    }

    const response = await client.resetMessages(agent.id, options.addDefault);

    output(`Messages reset for agent ${agent.name}`);

    if (verbose && response) {
      output('Agent state after reset:', JSON.stringify(response, null, 2));
    }

  } catch (err: any) {
    error(`Failed to reset messages for agent ${agentName}:`, err.message);
    throw err;
  }
}
