import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { output, error } from '../../lib/shared/logger';
import { CompactOptions } from './types';

export async function compactMessagesCommand(
  agentName: string,
  _options: CompactOptions,
  command: any
) {
  const verbose = command.parent?.opts().verbose || false;

  try {
    const client = new LettaClientWrapper();
    const resolver = new AgentResolver(client);

    // Find the agent
    const { agent } = await resolver.findAgentByName(agentName);

    if (verbose) {
      output(`Compacting messages for agent: ${agent.name} (${agent.id})`);
    }

    await client.compactMessages(agent.id);

    output(`Messages compacted for agent ${agent.name}`);

  } catch (err: any) {
    error(`Failed to compact messages for agent ${agentName}:`, err.message);
    throw err;
  }
}
