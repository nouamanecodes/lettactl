import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { output, error } from '../../lib/shared/logger';
import { CompactOptions } from './types';

export async function compactMessagesCommand(
  agentName: string,
  options: CompactOptions,
  command: any
) {
  const verbose = command.parent?.opts().verbose || false;

  try {
    const client = new LettaClientWrapper();
    const resolver = new AgentResolver(client);

    // Find the agent
    const { agent } = await resolver.findAgentByName(agentName);

    if (options.conversationId) {
      // Conversation compaction — resolve model
      let model = options.model;
      if (!model) {
        const fullAgent = await client.getAgent(agent.id);
        model = (fullAgent as any).llm_config?.model;
      }
      if (!model) {
        error('Could not determine model. Specify --model explicitly.');
        process.exit(1);
      }

      if (verbose) {
        output(`Compacting conversation ${options.conversationId} with model ${model}`);
      }

      await client.compactConversationMessages(options.conversationId, { model });
      output(`Conversation ${options.conversationId} compacted for agent ${agent.name}`);
    } else {
      if (verbose) {
        output(`Compacting messages for agent: ${agent.name} (${agent.id})`);
      }

      await client.compactMessages(agent.id);
      output(`Messages compacted for agent ${agent.name}`);
    }

  } catch (err: any) {
    error(`Failed to compact messages for agent ${agentName}:`, err.message);
    throw err;
  }
}
