import { LettaClientWrapper } from '../../lib/letta-client';
import { normalizeResponse, sleep } from '../../lib/response-normalizer';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { getMessageContent } from '../messages';
import { Run } from '../../types/run';
import { output } from '../../lib/logger';

export async function waitForRun(client: LettaClientWrapper, runId: string, verbose: boolean) {
  const pollInterval = 1000; // 1 second
  const timeout = 5 * 60 * 1000; // 5 minutes
  const startTime = Date.now();

  output(`Waiting for run ${runId}...`);

  while (true) {
    const run = await client.getRun(runId) as Run;

    if (verbose) {
      output(`  Status: ${run.status}`);
    }

    if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
      output('');
      output(`Run ${run.status}.`);

      if (run.stop_reason) {
        output(`Stop reason: ${run.stop_reason}`);
      }

      // Show messages if completed
      if (run.status === 'completed') {
        await showRunMessages(client, runId);
      }

      return;
    }

    if (Date.now() - startTime > timeout) {
      output('');
      output('Timeout waiting for run to complete.');
      process.exit(1);
    }

    await sleep(pollInterval);
  }
}

export async function streamRun(client: LettaClientWrapper, runId: string) {
  // Check run status first
  const run = await client.getRun(runId) as Run;

  if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
    output(`Run ${run.status}.`);
    await showRunMessages(client, runId);
    return;
  }

  // Fall back to wait mode for consistent behavior
  await waitForRun(client, runId, false);
}

export async function showRunMessages(client: LettaClientWrapper, runId: string, outputFormat?: string) {
  const messagesResponse = await client.getRunMessages(runId);
  const messages = normalizeResponse(messagesResponse);

  if (OutputFormatter.handleJsonOutput(messages, outputFormat)) {
    return;
  }

  if (messages.length === 0) {
    output('No messages.');
    return;
  }

  output('');
  output('Messages:');
  output('-'.repeat(40));

  for (const msg of messages) {
    const role = msg.role || msg.message_type || 'unknown';
    const content = getMessageContent(msg) || JSON.stringify(msg);

    if (role === 'assistant_message' || role === 'assistant') {
      output(`[Assistant] ${content}`);
    } else if (role === 'user_message' || role === 'user') {
      output(`[User] ${content}`);
    } else if (role === 'tool_call_message' || role === 'tool_call') {
      output(`[Tool Call] ${msg.tool_call?.name || 'unknown'}`);
    } else if (role === 'tool_return_message' || role === 'tool_return') {
      output(`[Tool Return] ${content}`);
    }
  }
}
