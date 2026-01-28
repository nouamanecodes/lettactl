import { LettaClientWrapper } from '../../lib/letta-client';
import { AgentResolver } from '../../lib/agent-resolver';
import { output, error } from '../../lib/logger';
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
