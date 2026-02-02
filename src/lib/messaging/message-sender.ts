import { LettaClientWrapper } from '../client/letta-client';

export interface MessageOptions {
  stream?: boolean;
  async?: boolean;
  maxSteps?: number;
  enableThinking?: boolean;
}

export interface MessageResponse {
  success: boolean;
  response?: any;
  error?: string;
}

/**
 * Send a message to an agent using the Letta SDK
 * Extracted from CLI sendMessageCommand for reuse
 */
export async function sendMessageToAgent(
  client: LettaClientWrapper,
  agentId: string,
  message: string,
  options: MessageOptions = {}
): Promise<MessageResponse> {
  try {
    // Build params exactly like the CLI does
    const params: any = {
      messages: [
        {
          role: 'user',
          content: message
        }
      ]
    };

    if (options.maxSteps) params.max_steps = options.maxSteps;
    if (options.enableThinking) params.enable_thinking = options.enableThinking;

    let response;

    // Call the underlying SDK methods exactly like the CLI
    if (options.async) {
      response = await client.createAsyncMessage(agentId, params);
    } else if (options.stream) {
      response = await client.streamMessage(agentId, { ...params, streaming: true });
    } else {
      response = await client.createMessage(agentId, params);
    }

    return {
      success: true,
      response
    };

  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to send message'
    };
  }
}