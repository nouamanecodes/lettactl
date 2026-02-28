import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { output } from '../../lib/shared/logger';
import { displayConversationDetails, ConversationDetailsData } from '../../lib/ux/display';
import { DescribeOptions } from './types';

export async function describeConversation(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  name: string,
  options: DescribeOptions = {},
  spinnerEnabled?: boolean
) {
  const spinner = createSpinner(`Loading details for conversation ${name}...`, spinnerEnabled).start();

  try {
    const conversation = await client.getConversation(name);

    // Best-effort agent name resolution
    let agentName: string | undefined;
    const agentId = (conversation as any).agent_id;
    if (agentId) {
      try {
        const agent = await client.getAgent(agentId);
        agentName = (agent as any).name;
      } catch {
        // Best-effort — skip if agent lookup fails
      }
    }

    spinner.stop();

    if (OutputFormatter.handleJsonOutput(conversation, options?.output)) {
      return;
    }

    const conv = conversation as any;
    const displayData: ConversationDetailsData = {
      id: conv.id,
      agentId: agentId || '-',
      agentName,
      name: conv.name,
      summary: conv.summary,
      messageCount: conv.message_count ?? conv.num_messages,
      status: conv.status,
      created: conv.created_at,
      updated: conv.updated_at,
    };

    output(displayConversationDetails(displayData));
  } catch (error) {
    spinner.fail(`Failed to load details for conversation ${name}`);
    throw error;
  }
}
