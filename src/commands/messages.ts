import { LettaClientWrapper } from '../lib/letta-client';
import { AgentResolver } from '../lib/agent-resolver';
import { normalizeResponse, sleep } from '../lib/response-normalizer';
import { OutputFormatter } from '../lib/ux/output-formatter';
import { createSpinner, getSpinnerEnabled } from '../lib/ux/spinner';
import { sendMessageToAgent } from '../lib/message-sender';
import { bulkSendMessage } from '../lib/bulk-messenger';
import { log, output, error } from '../lib/logger';
import { Run } from '../types/run';

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
      output(`Listing messages for agent: ${agent.name} (${agent.id})`);
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
      output(JSON.stringify(messages, null, 2));
      return;
    }

    if (messages.length === 0) {
      output(`No messages found for agent ${agent.name}`);
      return;
    }

    // Format as table
    output(`Messages for ${agent.name}:`);
    output(`Found ${messages.length} message(s)\n`);
    
    for (const message of messages) {
      const timestamp = message.created_at 
        ? new Date(message.created_at).toLocaleString() 
        : 'Unknown time';
      
      output(`${timestamp}`);
      output(`  Role: ${message.role || 'unknown'}`);
      
      // Handle different message content types
      const content = getMessageContent(message);
      if (content) {
        const preview = content.length > 100 
          ? content.substring(0, 100) + '...' 
          : content;
        output(`  Content: ${preview}`);
      } else {
        output(`  Preview: [${message.message_type || message.role || 'Unknown type'}]`);
      }
      output('');
    }

  } catch (err: any) {
    error(`Failed to list messages for agent ${agentName}:`, err.message);
    throw err;
  }
}

export async function sendMessageCommand(
  agentNameOrMessage: string,
  messageOrUndefined: string | undefined,
  options: {
    stream?: boolean;
    sync?: boolean;
    noWait?: boolean;
    maxSteps?: number;
    enableThinking?: boolean;
    all?: string;
    file?: string;
    confirm?: boolean;
    timeout?: number;
    output?: string;
  },
  command: any
) {
  const verbose = command.parent?.opts().verbose || false;

  // Handle bulk messaging mode
  if (options.all || options.file) {
    // When using --all, first arg is the message (agent is optional)
    const message = messageOrUndefined || agentNameOrMessage;
    if (!message) {
      error('Message is required');
      process.exit(1);
    }
    try {
      await bulkSendMessage(message, {
        pattern: options.all,
        configFile: options.file,
        confirm: options.confirm,
        timeout: options.timeout,
        verbose,
      }, output);
      return;
    } catch (err: any) {
      error(`Bulk message failed: ${err.message}`);
      throw err;
    }
  }

  // Single agent mode - both args required
  const agentName = agentNameOrMessage;
  const message = messageOrUndefined;
  if (!agentName || !message) {
    error('Both agent name and message are required');
    process.exit(1);
  }

  try {
    const client = new LettaClientWrapper();
    const resolver = new AgentResolver(client);
    const spinnerEnabled = getSpinnerEnabled(command);

    // Find the agent
    const { agent } = await resolver.findAgentByName(agentName);

    if (verbose) {
      output(`Sending message to agent: ${agent.name} (${agent.id})`);
      output(`Message: ${message}`);
      output(`Options: ${JSON.stringify(options, null, 2)}`);
    }

    // Streaming mode
    if (options.stream) {
      const result = await sendMessageToAgent(client, agent.id, message, { stream: true });

      if (!result.success) {
        throw new Error(result.error);
      }

      output(`Streaming response from ${agent.name}:`);
      output('---');

      try {
        for await (const chunk of result.response) {
          const chunkData = chunk as any;

          if (chunkData.type === 'message_delta' && chunkData.content) {
            process.stdout.write(chunkData.content);
          } else if (chunkData.text) {
            process.stdout.write(chunkData.text);
          } else if (typeof chunk === 'string') {
            process.stdout.write(chunk);
          } else {
            const content = getMessageContent(chunkData);
            if (content) {
              process.stdout.write(content);
            }
          }
        }
        output();
      } catch (streamError) {
        output('\n[Streaming completed]');
      }
      output('---');
      return;
    }

    // Sync mode (old behavior) - blocks until response
    if (options.sync) {
      const spinner = createSpinner(`Sending message to ${agent.name}...`, spinnerEnabled).start();

      const result = await sendMessageToAgent(client, agent.id, message, {
        maxSteps: options.maxSteps,
        enableThinking: options.enableThinking,
      });

      if (!result.success) {
        spinner.fail(`Failed to send message to ${agent.name}`);
        throw new Error(result.error);
      }

      spinner.succeed(`Response from ${agent.name}:`);
      displaySyncResponse(result.response, verbose, options.output);
      return;
    }

    // Default: Async mode with polling (runs indefinitely until complete)
    const spinner = createSpinner(`Sending message to ${agent.name}...`, spinnerEnabled).start();

    // Send async message
    const result = await sendMessageToAgent(client, agent.id, message, {
      async: true,
      maxSteps: options.maxSteps,
      enableThinking: options.enableThinking,
    });

    if (!result.success) {
      spinner.fail(`Failed to send message to ${agent.name}`);
      throw new Error(result.error);
    }

    const runId = result.response.id;

    // If --no-wait, just return the run ID
    if (options.noWait) {
      spinner.succeed(`Message sent. Run ID: ${runId}`);
      output(`Check status with: lettactl run ${runId}`);
      return;
    }

    // Poll for completion
    spinner.text = `Processing message... (run: ${runId.slice(0, 8)}...)`;

    const pollInterval = 3000; // 3 seconds
    const progressInterval = 15; // Log progress every 15 seconds
    let lastStatus = '';
    let lastProgressLog = 0;
    const startTime = Date.now();

    while (true) {
      const run = await client.getRun(runId) as Run;

      // Update spinner with status changes
      if (run.status !== lastStatus) {
        lastStatus = run.status;
        if (verbose) {
          log(`Status changed to: ${run.status}`);
        }
      }

      // Update spinner text with elapsed time
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      const timeStr = formatElapsedTime(elapsedSeconds);
      spinner.text = `${agent.name} is thinking... ${timeStr} (${run.status})`;

      // Log progress message every 15 seconds
      if (elapsedSeconds > 0 && elapsedSeconds % progressInterval === 0 && elapsedSeconds !== lastProgressLog) {
        lastProgressLog = elapsedSeconds;
        log(`Still waiting for ${agent.name}... ${timeStr} elapsed`);
      }

      if (run.status === 'completed') {
        spinner.succeed(`Response from ${agent.name} (${timeStr}):`);
        await displayRunMessages(client, runId, verbose, options.output);
        return;
      }

      if (run.status === 'failed') {
        spinner.fail(`Message failed after ${timeStr}`);
        if (run.stop_reason) {
          error(`Reason: ${run.stop_reason}`);
        }
        process.exit(1);
      }

      if (run.status === 'cancelled') {
        spinner.fail(`Message was cancelled after ${timeStr}`);
        process.exit(1);
      }

      await sleep(pollInterval);
    }

  } catch (err: any) {
    error(`Failed to send message to agent ${agentName}:`, err.message);
    throw err;
  }
}

/**
 * Format elapsed time as human-readable string
 */
function formatElapsedTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const weeks = Math.floor(seconds / 604800);
  const days = Math.floor((seconds % 604800) / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  // Under 1 hour: Xm Ys
  if (seconds < 3600) {
    return `${mins}m ${secs}s`;
  }

  // Under 1 day: Xh Ym
  if (seconds < 86400) {
    return `${hours}h ${mins}m`;
  }

  // Under 1 week: Xd Yh
  if (seconds < 604800) {
    return `${days}d ${hours}h`;
  }

  // 1 week or more: just show weeks
  return `${weeks}w`;
}

/**
 * Display response from sync message
 */
function displaySyncResponse(response: any, verbose: boolean, outputFormat?: string): void {
  if (outputFormat === 'json') {
    output(JSON.stringify(response, null, 2));
    return;
  }

  output('---');

  if (response.messages && response.messages.length > 0) {
    const assistantMessages = response.messages.filter((msg: any) =>
      msg.message_type === 'assistant_message' ||
      msg.type === 'assistant_message' ||
      (msg.role === 'assistant' && !msg.type?.includes('system'))
    );

    if (assistantMessages.length > 0) {
      const lastAssistant = assistantMessages[assistantMessages.length - 1];
      const messageContent = getMessageContent(lastAssistant);
      if (messageContent) {
        output(messageContent);
      } else {
        output(JSON.stringify(lastAssistant, null, 2));
      }
    } else {
      const lastMessage = response.messages[response.messages.length - 1];
      const messageContent = getMessageContent(lastMessage);
      if (messageContent) {
        output(messageContent);
      } else {
        output(JSON.stringify(lastMessage, null, 2));
      }
    }
  } else {
    output('[No response content]');
  }

  output('---');

  if (verbose && response.usage) {
    output(`Tokens used: ${response.usage.total_tokens || 'unknown'}`);
    output(`Stop reason: ${response.stop_reason || 'unknown'}`);
  }
}

/**
 * Display messages from a completed run
 */
async function displayRunMessages(client: LettaClientWrapper, runId: string, verbose: boolean, outputFormat?: string): Promise<void> {
  const messagesResponse = await client.getRunMessages(runId);
  const messages = normalizeResponse(messagesResponse);

  if (outputFormat === 'json') {
    output(JSON.stringify(messages, null, 2));
    return;
  }

  output('---');

  if (messages.length === 0) {
    output('[No response content]');
    output('---');
    return;
  }

  // Find assistant messages
  const assistantMessages = messages.filter((msg: any) =>
    msg.message_type === 'assistant_message' ||
    msg.type === 'assistant_message' ||
    (msg.role === 'assistant' && !msg.type?.includes('system'))
  );

  if (assistantMessages.length > 0) {
    // Show all assistant messages from this run
    for (const msg of assistantMessages) {
      const content = getMessageContent(msg);
      if (content) {
        output(content);
      }
    }
  } else {
    // Fallback: show last message
    const lastMessage = messages[messages.length - 1];
    const content = getMessageContent(lastMessage);
    if (content) {
      output(content);
    } else {
      output(JSON.stringify(lastMessage, null, 2));
    }
  }

  output('---');

  if (verbose) {
    output(`Total messages in run: ${messages.length}`);
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
      output(`Compacting messages for agent: ${agent.name} (${agent.id})`);
    }

    await client.compactMessages(agent.id);
    
    output(`Messages compacted for agent ${agent.name}`);

  } catch (err: any) {
    error(`Failed to compact messages for agent ${agentName}:`, err.message);
    throw err;
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