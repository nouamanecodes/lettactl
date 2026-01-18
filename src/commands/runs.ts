import { LettaClientWrapper } from '../lib/letta-client';
import { AgentResolver } from '../lib/agent-resolver';
import { normalizeResponse, sleep } from '../lib/response-normalizer';
import { formatStatus, OutputFormatter } from '../lib/ux/output-formatter';
import { getMessageContent } from './messages';
import { Run } from '../types/run';
import { output, error } from '../lib/logger';

export async function listRunsCommand(
  options: { active?: boolean; agent?: string; limit?: number; output?: string },
  command: any
) {
  const verbose = command.parent?.opts().verbose || false;
  const client = new LettaClientWrapper();

  let agentId: string | undefined;
  if (options.agent) {
    const resolver = new AgentResolver(client);
    const { agent } = await resolver.findAgentByName(options.agent);
    agentId = agent.id;
  }

  const runsResponse = await client.listRuns({
    agentId,
    active: options.active,
    limit: options.limit || 20
  });

  const runs = normalizeResponse(runsResponse) as Run[];

  if (OutputFormatter.handleJsonOutput(runs, options.output)) {
    return;
  }

  if (runs.length === 0) {
    output('No runs found.');
    return;
  }

  output('Runs');
  output('='.repeat(80));
  output('');

  for (const run of runs) {
    const status = formatStatus(run.status);
    const created = new Date(run.created_at).toLocaleString();

    output(`${run.id}`);
    output(`  Status:  ${status}`);
    output(`  Agent:   ${run.agent_id}`);
    output(`  Created: ${created}`);

    if (run.completed_at) {
      const completed = new Date(run.completed_at).toLocaleString();
      output(`  Completed: ${completed}`);
    }

    if (run.stop_reason) {
      output(`  Stop reason: ${run.stop_reason}`);
    }

    if (verbose && run.background !== undefined) {
      output(`  Background: ${run.background}`);
    }

    output('');
  }

  output(`Total: ${runs.length} run(s)`);
}

export async function getRunCommand(
  runId: string,
  options: { wait?: boolean; stream?: boolean; messages?: boolean; output?: string },
  command: any
) {
  const verbose = command.parent?.opts().verbose || false;
  const client = new LettaClientWrapper();

  if (options.wait) {
    await waitForRun(client, runId, verbose);
    return;
  }

  if (options.stream) {
    await streamRun(client, runId);
    return;
  }

  if (options.messages) {
    await showRunMessages(client, runId, options.output);
    return;
  }

  // Default: show run details
  const run = await client.getRun(runId) as Run;

  if (OutputFormatter.handleJsonOutput(run, options.output)) {
    return;
  }

  output(`Run: ${run.id}`);
  output('='.repeat(50));
  output('');
  output(`Status:     ${formatStatus(run.status)}`);
  output(`Agent:      ${run.agent_id}`);
  output(`Created:    ${new Date(run.created_at).toLocaleString()}`);

  if (run.completed_at) {
    output(`Completed:  ${new Date(run.completed_at).toLocaleString()}`);
  }

  if (run.stop_reason) {
    output(`Stop reason: ${run.stop_reason}`);
  }

  if (verbose) {
    output(`Background: ${run.background ?? false}`);
  }
}

export async function deleteRunCommand(
  runId: string,
  _options: {},
  _command: any
) {
  const client = new LettaClientWrapper();

  try {
    await client.deleteRun(runId);
    output(`Run ${runId} deleted.`);
  } catch (err: any) {
    error(`Failed to delete run: ${err.message}`);
    process.exit(1);
  }
}

async function waitForRun(client: LettaClientWrapper, runId: string, verbose: boolean) {
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

async function streamRun(client: LettaClientWrapper, runId: string) {
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

async function showRunMessages(client: LettaClientWrapper, runId: string, outputFormat?: string) {
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
