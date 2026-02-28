import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { output } from '../../lib/shared/logger';
import { displayConversations, ConversationData } from '../../lib/ux/display';
import { GetOptions } from './types';

export async function getConversations(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  options: GetOptions = {},
  spinnerEnabled?: boolean,
  agentId?: string,
  agentName?: string
) {
  if (!agentId) {
    throw new Error('Agent name is required for listing conversations');
  }

  const spinner = createSpinner(`Loading conversations for ${agentName || agentId}...`, spinnerEnabled).start();

  try {
    const conversations = await client.listConversations(agentId);

    spinner.stop();

    if (OutputFormatter.handleJsonOutput(conversations, options?.output)) {
      return;
    }

    if (conversations.length === 0) {
      output(`No conversations found for agent ${agentName || agentId}`);
      output(`Create one with: lettactl create conversation ${agentName || agentId}`);
      return;
    }

    const displayData: ConversationData[] = conversations.map((conv: any) => ({
      id: conv.id,
      agentId: conv.agent_id || agentId,
      summary: conv.name || conv.summary || '',
      messageCount: conv.message_count ?? conv.num_messages ?? 0,
      created: conv.created_at,
      updated: conv.updated_at,
    }));

    output(displayConversations(displayData));
  } catch (error) {
    spinner.fail(`Failed to load conversations`);
    throw error;
  }
}
