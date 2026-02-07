import { minimatch } from 'minimatch';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as readline from 'readline';

import { LettaClientWrapper } from '../client/letta-client';
import { AgentResolver } from '../client/agent-resolver';
import { normalizeResponse } from '../shared/response-normalizer';
import { isRunTerminal, getEffectiveRunStatus } from './run-utils';
import { Run } from '../../types/run';

export interface BulkMessageOptions {
  pattern?: string;       // glob pattern for agent names
  configFile?: string;    // fleet config path
  confirm?: boolean;      // skip confirmation prompt
  timeout?: number;       // per-agent timeout in seconds (undefined = no timeout)
  verbose?: boolean;
  collectResponse?: boolean;  // extract assistant response text from completed runs
  messageFn?: (agent: { id: string; name: string }) => string;  // per-agent message builder
  agents?: Array<{ id: string; name: string }>;  // pre-resolved agents (skip resolution)
}

export interface BulkMessageResult {
  agentName: string;
  agentId: string;
  status: 'completed' | 'failed' | 'timeout' | 'cancelled';
  duration: number;
  runId: string;
  error?: string;
  responseText?: string;  // assistant response (when collectResponse is true)
}

const CONCURRENCY_LIMIT = 5;
const POLL_INTERVAL_MS = 1000;

/**
 * Send a message to multiple agents matching a pattern or defined in a config file
 */
export async function bulkSendMessage(
  message: string,
  options: BulkMessageOptions,
  outputFn: (msg: string) => void = console.log
): Promise<BulkMessageResult[]> {
  const client = new LettaClientWrapper();

  // Use pre-resolved agents or resolve from pattern/config
  let agents: Array<{ id: string; name: string }>;
  if (options.agents) {
    agents = options.agents;
  } else {
    const resolver = new AgentResolver(client);
    agents = await resolveTargetAgents(client, resolver, options);
  }

  if (agents.length === 0) {
    if (options.pattern) {
      outputFn(`No agents found matching pattern: ${options.pattern}`);
    } else if (options.configFile) {
      outputFn(`No agents found from config file: ${options.configFile}`);
    }
    return [];
  }

  // Show confirmation
  const maxDisplay = 5;
  outputFn(`\nThis will send 1 message to ${agents.length} agent(s)${options.pattern ? ` matching "${options.pattern}"` : ''}:`);
  agents.slice(0, maxDisplay).forEach(agent => {
    outputFn(`  - ${agent.name}`);
  });
  if (agents.length > maxDisplay) {
    outputFn(`  ... and ${agents.length - maxDisplay} more`);
  }
  outputFn('');
  outputFn('Bulk messaging sends messages in async mode.');

  if (!options.confirm) {
    const confirmed = await promptConfirmation('Proceed? (y/N) ');
    if (!confirmed) {
      outputFn('Aborted.');
      return [];
    }
  }

  outputFn('');

  // Process agents with concurrency limit
  const results: BulkMessageResult[] = [];
  const queue = [...agents];
  const inProgress: Promise<void>[] = [];

  const processAgent = async (agent: { id: string; name: string }) => {
    const startTime = Date.now();
    const result: BulkMessageResult = {
      agentName: agent.name,
      agentId: agent.id,
      status: 'failed',
      duration: 0,
      runId: '',
    };

    try {
      // Send async message (use per-agent messageFn if provided)
      const agentMessage = options.messageFn ? options.messageFn(agent) : message;
      const run = await client.createAsyncMessage(agent.id, {
        messages: [{ role: 'user', content: agentMessage }]
      });
      result.runId = run.id;

      // Poll for completion
      const timeoutMs = options.timeout ? options.timeout * 1000 : undefined;

      while (true) {
        const runStatus = await client.getRun(run.id) as Run;

        // Check for terminal state using both status and stop_reason
        if (isRunTerminal(runStatus)) {
          const effectiveStatus = getEffectiveRunStatus(runStatus);

          if (effectiveStatus === 'completed') {
            result.status = 'completed';
            if (options.collectResponse) {
              result.responseText = await extractResponseText(client, run.id);
            }
            break;
          } else if (effectiveStatus === 'failed') {
            result.status = 'failed';
            result.error = runStatus.stop_reason ? `Run failed: ${runStatus.stop_reason}` : 'Run failed';
            break;
          } else if (effectiveStatus === 'cancelled') {
            result.status = 'cancelled';
            result.error = 'Run cancelled';
            break;
          }
        }

        // Check timeout if specified
        if (timeoutMs && (Date.now() - startTime) >= timeoutMs) {
          result.status = 'timeout';
          result.error = `Timed out after ${options.timeout}s`;
          break;
        }

        await sleep(POLL_INTERVAL_MS);
      }
    } catch (err: any) {
      result.status = 'failed';
      result.error = err.message;
    }

    result.duration = (Date.now() - startTime) / 1000;

    // Print status line
    const durationStr = result.duration.toFixed(1);
    if (result.status === 'completed') {
      outputFn(`OK ${agent.name} (${durationStr}s)`);
    } else {
      outputFn(`FAIL ${agent.name}: ${result.error || 'unknown error'}`);
    }

    results.push(result);
  };

  // Process with concurrency limit
  while (queue.length > 0 || inProgress.length > 0) {
    // Start new tasks up to concurrency limit
    while (queue.length > 0 && inProgress.length < CONCURRENCY_LIMIT) {
      const agent = queue.shift()!;
      const promise = processAgent(agent).then(() => {
        // Remove from in-progress when done
        const idx = inProgress.indexOf(promise);
        if (idx !== -1) inProgress.splice(idx, 1);
      });
      inProgress.push(promise);
    }

    // Wait for at least one to complete if at capacity
    if (inProgress.length >= CONCURRENCY_LIMIT || (queue.length === 0 && inProgress.length > 0)) {
      await Promise.race(inProgress);
    }
  }

  // Print summary
  const completed = results.filter(r => r.status === 'completed').length;
  const failed = results.filter(r => r.status !== 'completed').length;
  outputFn('');
  outputFn(`Completed: ${completed}/${results.length}${failed > 0 ? `, Failed: ${failed}` : ''}`);

  return results;
}

/**
 * Resolve target agents from pattern or config file
 */
async function resolveTargetAgents(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  options: BulkMessageOptions
): Promise<Array<{ id: string; name: string }>> {
  const allAgents = await resolver.getAllAgents();

  if (options.configFile) {
    // Load agent names from config file
    const configContent = fs.readFileSync(options.configFile, 'utf8');
    const config = yaml.load(configContent) as any;

    if (!config.agents || !Array.isArray(config.agents)) {
      throw new Error(`Invalid config file: missing 'agents' array`);
    }

    const configAgentNames = new Set(config.agents.map((a: any) => a.name));

    // Filter to only agents that exist and are in the config
    return allAgents
      .filter(agent => configAgentNames.has(agent.name))
      .map(agent => ({ id: agent.id, name: agent.name }));
  }

  if (options.pattern) {
    // Filter by glob pattern
    return allAgents
      .filter(agent => minimatch(agent.name, options.pattern!))
      .map(agent => ({ id: agent.id, name: agent.name }));
  }

  throw new Error('Either --all <pattern> or -f <config-file> must be specified');
}

/**
 * Extract assistant response text from a completed run
 */
async function extractResponseText(client: LettaClientWrapper, runId: string): Promise<string | undefined> {
  try {
    const messagesResponse = await client.getRunMessages(runId);
    const messages = normalizeResponse(messagesResponse);

    const parts: string[] = [];
    for (const msg of messages) {
      if (msg.message_type === 'assistant_message' ||
          msg.type === 'assistant_message' ||
          (msg.role === 'assistant' && !msg.type?.includes('system'))) {
        const content = msg.content || msg.text || msg.assistant_message || msg.message;
        if (typeof content === 'string') {
          parts.push(content);
        } else if (Array.isArray(content)) {
          const text = content.map((item: any) => item.text || item.content || '').join(' ');
          if (text) parts.push(text);
        }
      }
    }

    return parts.length > 0 ? parts.join('\n') : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Prompt user for confirmation
 */
export async function promptConfirmation(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(prompt, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
