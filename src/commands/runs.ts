import { LettaClientWrapper } from '../lib/letta-client';
import { AgentResolver } from '../lib/agent-resolver';
import { normalizeResponse, sleep } from '../lib/response-normalizer';
import { formatStatus, OutputFormatter } from '../lib/ux/output-formatter';
import { getMessageContent } from './messages';
import { Run } from '../types/run';

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
    console.log('No runs found.');
    return;
  }

  console.log('Runs');
  console.log('='.repeat(80));
  console.log('');

  for (const run of runs) {
    const status = formatStatus(run.status);
    const created = new Date(run.created_at).toLocaleString();

    console.log(`${run.id}`);
    console.log(`  Status:  ${status}`);
    console.log(`  Agent:   ${run.agent_id}`);
    console.log(`  Created: ${created}`);

    if (run.completed_at) {
      const completed = new Date(run.completed_at).toLocaleString();
      console.log(`  Completed: ${completed}`);
    }

    if (run.stop_reason) {
      console.log(`  Stop reason: ${run.stop_reason}`);
    }

    if (verbose && run.background !== undefined) {
      console.log(`  Background: ${run.background}`);
    }

    console.log('');
  }

  console.log(`Total: ${runs.length} run(s)`);
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

  console.log(`Run: ${run.id}`);
  console.log('='.repeat(50));
  console.log('');
  console.log(`Status:     ${formatStatus(run.status)}`);
  console.log(`Agent:      ${run.agent_id}`);
  console.log(`Created:    ${new Date(run.created_at).toLocaleString()}`);

  if (run.completed_at) {
    console.log(`Completed:  ${new Date(run.completed_at).toLocaleString()}`);
  }

  if (run.stop_reason) {
    console.log(`Stop reason: ${run.stop_reason}`);
  }

  if (verbose) {
    console.log(`Background: ${run.background ?? false}`);
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
    console.log(`Run ${runId} deleted.`);
  } catch (error: any) {
    console.error(`Failed to delete run: ${error.message}`);
    process.exit(1);
  }
}

async function waitForRun(client: LettaClientWrapper, runId: string, verbose: boolean) {
  const pollInterval = 1000; // 1 second
  const timeout = 5 * 60 * 1000; // 5 minutes
  const startTime = Date.now();

  console.log(`Waiting for run ${runId}...`);

  while (true) {
    const run = await client.getRun(runId) as Run;

    if (verbose) {
      console.log(`  Status: ${run.status}`);
    }

    if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
      console.log('');
      console.log(`Run ${run.status}.`);

      if (run.stop_reason) {
        console.log(`Stop reason: ${run.stop_reason}`);
      }

      // Show messages if completed
      if (run.status === 'completed') {
        await showRunMessages(client, runId);
      }

      return;
    }

    if (Date.now() - startTime > timeout) {
      console.log('');
      console.log('Timeout waiting for run to complete.');
      process.exit(1);
    }

    await sleep(pollInterval);
  }
}

async function streamRun(client: LettaClientWrapper, runId: string) {
  // Check run status first
  const run = await client.getRun(runId) as Run;

  if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
    console.log(`Run ${run.status}.`);
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
    console.log('No messages.');
    return;
  }

  console.log('');
  console.log('Messages:');
  console.log('-'.repeat(40));

  for (const msg of messages) {
    const role = msg.role || msg.message_type || 'unknown';
    const content = getMessageContent(msg) || JSON.stringify(msg);

    if (role === 'assistant_message' || role === 'assistant') {
      console.log(`[Assistant] ${content}`);
    } else if (role === 'user_message' || role === 'user') {
      console.log(`[User] ${content}`);
    } else if (role === 'tool_call_message' || role === 'tool_call') {
      console.log(`[Tool Call] ${msg.tool_call?.name || 'unknown'}`);
    } else if (role === 'tool_return_message' || role === 'tool_return') {
      console.log(`[Tool Return] ${content}`);
    }
  }
}
