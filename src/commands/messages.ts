import { LettaClientWrapper } from '../lib/letta-client';
import { AgentResolver } from '../lib/agent-resolver';
import { normalizeResponse } from '../lib/response-normalizer';
import { OutputFormatter } from '../lib/ux/output-formatter';
import { createSpinner, getSpinnerEnabled } from '../lib/ux/spinner';
import { sendMessageToAgent } from '../lib/message-sender';

/**
 * Safely extracts content from different message types
 */
export function getMessageContent(message: any): string | null {
  // Try different properties that might contain the message content
  if (message.text) return message.text;
  if (message.content) {
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
      // Handle content arrays (multi-modal content)
      return message.content
        .map((item: any) => item.text || item.content || '[Non-text content]')
        .join(' ');
    }
    return JSON.stringify(message.content);
  }
  if (message.message && typeof message.message === 'string') return message.message;
  return null;
}

export async function listMessagesCommand(
  agentName: string,
  options: {
    limit?: number;
    order?: string;
    before?: string;
    after?: string;
    output?: string;
  },
  command: any
) {
  const verbose = command.parent?.opts().verbose || false;
  
  try {
    const client = new LettaClientWrapper();
    const resolver = new AgentResolver(client);

    // Find the agent
    const { agent } = await resolver.findAgentByName(agentName);
    
    if (verbose) {
      console.log(`Listing messages for agent: ${agent.name} (${agent.id})`);
    }

    // Prepare query options
    const queryOptions: any = {};
    if (options.limit) queryOptions.limit = options.limit;
    if (options.order) queryOptions.order = options.order;
    if (options.before) queryOptions.before = options.before;
    if (options.after) queryOptions.after = options.after;

    // Get messages
    const response = await client.listMessages(agent.id, queryOptions);
    const messages = normalizeResponse(response);

    if (options.output === 'json') {
      console.log(JSON.stringify(messages, null, 2));
      return;
    }

    if (messages.length === 0) {
      console.log(`No messages found for agent ${agent.name}`);
      return;
    }

    // Format as table
    console.log(`Messages for ${agent.name}:`);
    console.log(`Found ${messages.length} message(s)\n`);
    
    for (const message of messages) {
      const timestamp = message.created_at 
        ? new Date(message.created_at).toLocaleString() 
        : 'Unknown time';
      
      console.log(`${timestamp}`);
      console.log(`  Role: ${message.role || 'unknown'}`);
      
      // Handle different message content types
      const content = getMessageContent(message);
      if (content) {
        const preview = content.length > 100 
          ? content.substring(0, 100) + '...' 
          : content;
        console.log(`  Content: ${preview}`);
      } else {
        console.log(`  Preview: [${message.message_type || message.role || 'Unknown type'}]`);
      }
      console.log('');
    }

  } catch (error: any) {
    console.error(`Failed to list messages for agent ${agentName}:`, error.message);
    throw error;
  }
}

export async function sendMessageCommand(
  agentName: string,
  message: string,
  options: {
    stream?: boolean;
    async?: boolean;
    maxSteps?: number;
    enableThinking?: boolean;
  },
  command: any
) {
  const verbose = command.parent?.opts().verbose || false;
  
  try {
    const client = new LettaClientWrapper();
    const resolver = new AgentResolver(client);

    // Find the agent
    const { agent } = await resolver.findAgentByName(agentName);
    
    if (verbose) {
      console.log(`Sending message to agent: ${agent.name} (${agent.id})`);
      console.log(`Message: ${message}`);
      console.log(`Options: ${JSON.stringify(options, null, 2)}`);
    }

    // Use the modular message sender
    const result = await sendMessageToAgent(client, agent.id, message, options);
    
    if (!result.success) {
      throw new Error(result.error);
    }

    const response = result.response;

    if (options.async) {
      // Async message
      console.log(`Message sent asynchronously. Run ID: ${response.id}`);
      console.log(`Status: ${response.status}`);
      if (verbose) {
        console.log('Full response:', JSON.stringify(response, null, 2));
      }
    } else if (options.stream) {
      // Streaming message
      console.log(`Streaming response from ${agent.name}:`);
      console.log('---');
      
      // Handle streaming response 
      try {
        for await (const chunk of response) {
          // Use type assertion to handle dynamic chunk types
          const chunkData = chunk as any;
          
          if (chunkData.type === 'message_delta' && chunkData.content) {
            process.stdout.write(chunkData.content);
          } else if (chunkData.text) {
            process.stdout.write(chunkData.text);
          } else if (typeof chunk === 'string') {
            process.stdout.write(chunk);
          } else {
            // For debugging: show chunk structure
            const content = getMessageContent(chunkData);
            if (content) {
              process.stdout.write(content);
            }
          }
        }
        console.log(); // New line after streaming
      } catch (streamError) {
        console.log('\n[Streaming completed]');
      }
      console.log('---');
      console.log('Stream completed');
    } else {
      // Regular synchronous message
      const spinnerEnabled = getSpinnerEnabled(command);
      const spinner = createSpinner(`Sending message to ${agent.name}...`, spinnerEnabled).start();
      
      try {
        spinner.succeed(`Response from ${agent.name}:`);
      } catch (error) {
        spinner.fail(`Failed to send message to ${agent.name}`);
        throw error;
      }
      console.log('---');

      if (response.messages && response.messages.length > 0) {
        // Filter for assistant messages, excluding system alerts and internal messages
        const assistantMessages = response.messages.filter((msg: any) =>
          msg.message_type === 'assistant_message' ||
          msg.type === 'assistant_message' ||
          (msg.role === 'assistant' && !msg.type?.includes('system'))
        );

        if (assistantMessages.length > 0) {
          // Show the last assistant message
          const lastAssistant = assistantMessages[assistantMessages.length - 1];
          const messageContent = getMessageContent(lastAssistant);
          if (messageContent) {
            console.log(messageContent);
          } else {
            console.log(JSON.stringify(lastAssistant, null, 2));
          }
        } else {
          // Fallback: show last message if no assistant messages found
          const lastMessage = response.messages[response.messages.length - 1];
          const messageContent = getMessageContent(lastMessage);
          if (messageContent) {
            console.log(messageContent);
          } else {
            console.log(JSON.stringify(lastMessage, null, 2));
          }
        }
      } else {
        console.log('[No response content]');
      }

      console.log('---');
      
      if (verbose && response.usage) {
        console.log(`Tokens used: ${response.usage.total_tokens || 'unknown'}`);
        console.log(`Stop reason: ${response.stop_reason || 'unknown'}`);
      }
    }

  } catch (error: any) {
    console.error(`Failed to send message to agent ${agentName}:`, error.message);
    throw error;
  }
}

export async function resetMessagesCommand(
  agentName: string,
  options: {
    addDefault?: boolean;
  },
  command: any
) {
  const verbose = command.parent?.opts().verbose || false;
  
  try {
    const client = new LettaClientWrapper();
    const resolver = new AgentResolver(client);

    // Find the agent
    const { agent } = await resolver.findAgentByName(agentName);
    
    if (verbose) {
      console.log(`Resetting messages for agent: ${agent.name} (${agent.id})`);
      console.log(`Add default messages: ${options.addDefault || false}`);
    }

    const response = await client.resetMessages(agent.id, options.addDefault);
    
    console.log(`Messages reset for agent ${agent.name}`);
    
    if (verbose && response) {
      console.log('Agent state after reset:', JSON.stringify(response, null, 2));
    }

  } catch (error: any) {
    console.error(`Failed to reset messages for agent ${agentName}:`, error.message);
    throw error;
  }
}

export async function compactMessagesCommand(
  agentName: string,
  _options: {},
  command: any
) {
  const verbose = command.parent?.opts().verbose || false;
  
  try {
    const client = new LettaClientWrapper();
    const resolver = new AgentResolver(client);

    // Find the agent
    const { agent } = await resolver.findAgentByName(agentName);
    
    if (verbose) {
      console.log(`Compacting messages for agent: ${agent.name} (${agent.id})`);
    }

    await client.compactMessages(agent.id);
    
    console.log(`Messages compacted for agent ${agent.name}`);

  } catch (error: any) {
    console.error(`Failed to compact messages for agent ${agentName}:`, error.message);
    throw error;
  }
}

export async function cancelMessagesCommand(
  agentName: string,
  options: {
    runIds?: string;
  },
  command: any
) {
  const verbose = command.parent?.opts().verbose || false;
  
  try {
    const client = new LettaClientWrapper();
    const resolver = new AgentResolver(client);

    // Find the agent
    const { agent } = await resolver.findAgentByName(agentName);
    
    if (verbose) {
      console.log(`Canceling messages for agent: ${agent.name} (${agent.id})`);
      if (options.runIds) {
        console.log(`Specific run IDs: ${options.runIds}`);
      }
    }

    const runIds = options.runIds ? options.runIds.split(',').map(id => id.trim()) : undefined;
    const response = await client.cancelMessages(agent.id, runIds);
    
    console.log(`Messages canceled for agent ${agent.name}`);
    
    if (verbose) {
      console.log('Cancel response:', JSON.stringify(response, null, 2));
    }

  } catch (error: any) {
    console.error(`Failed to cancel messages for agent ${agentName}:`, error.message);
    throw error;
  }
}