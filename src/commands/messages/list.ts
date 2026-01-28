import { LettaClientWrapper } from '../../lib/letta-client';
import { AgentResolver } from '../../lib/agent-resolver';
import { normalizeResponse } from '../../lib/response-normalizer';
import { output, error } from '../../lib/logger';
import { displayMessages, MessageDisplayData } from '../../lib/ux/display';
import { ListOptions } from './types';
import { getMessageContent } from './utils';

export async function listMessagesCommand(
  agentName: string,
  options: ListOptions,
  command: any
) {
  const verbose = command.parent?.opts().verbose || false;

  try {
    const client = new LettaClientWrapper();
    const resolver = new AgentResolver(client);

    // Find the agent
    const { agent } = await resolver.findAgentByName(agentName);

    if (verbose) {
      output(`Listing messages for agent: ${agent.name} (${agent.id})`);
    }

    // Default to 10 messages unless --all or explicit --limit
    const effectiveLimit = options.all ? undefined : (options.limit || 10);

    // Prepare query options
    const queryOptions: any = {};
    if (effectiveLimit) queryOptions.limit = effectiveLimit;
    if (options.order) queryOptions.order = options.order;
    if (options.before) queryOptions.before = options.before;
    if (options.after) queryOptions.after = options.after;

    // Get messages
    const response = await client.listMessages(agent.id, queryOptions);
    let messages = normalizeResponse(response);

    if (options.output === 'json') {
      output(JSON.stringify(messages, null, 2));
      return;
    }

    // Filter out system messages unless --system flag
    const totalCount = messages.length;
    if (!options.system) {
      messages = messages.filter((m: any) => (m.message_type || m.role) !== 'system_message');
    }

    if (messages.length === 0) {
      output(`No messages found for agent ${agent.name}`);
      return;
    }

    // Format messages
    const systemCount = totalCount - messages.length;
    let limitNote = effectiveLimit && totalCount >= effectiveLimit
      ? `(showing last ${effectiveLimit}, use --all to see full history)`
      : '';
    if (systemCount > 0) {
      const systemNote = `(${systemCount} system message${systemCount > 1 ? 's' : ''} hidden, use --system to show)`;
      limitNote = limitNote ? `${limitNote} ${systemNote}` : systemNote;
    }

    // Map to display data
    const displayData: MessageDisplayData[] = messages.map(message => ({
      timestamp: message.date || message.created_at
        ? new Date(message.date || message.created_at).toLocaleString()
        : 'Unknown time',
      role: message.message_type || message.role || 'unknown',
      content: getMessageContent(message),
    }));

    output(displayMessages(agent.name, displayData, limitNote));

  } catch (err: any) {
    error(`Failed to list messages for agent ${agentName}:`, err.message);
    throw err;
  }
}
