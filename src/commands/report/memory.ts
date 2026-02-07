import { minimatch } from 'minimatch';

import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { normalizeResponse } from '../../lib/shared/response-normalizer';
import { bulkSendMessage, promptConfirmation } from '../../lib/messaging/bulk-messenger';
import { createSpinner } from '../../lib/ux/spinner';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { output, log } from '../../lib/shared/logger';
import { ReportOptions } from './types';
import {
  MemoryUsageRow,
  AgentAnalysis,
  displayMemoryUsage,
  displayMemoryAnalysis,
  parseAnalysisResponse,
} from './memory-display';

/**
 * Report on memory block usage for one or more agents
 */
export async function reportMemory(
  agentName: string | undefined,
  options: ReportOptions,
  spinnerEnabled: boolean
) {
  const client = new LettaClientWrapper();
  const resolver = new AgentResolver(client);

  // Resolve target agents
  const spinner = createSpinner('Resolving agents...', spinnerEnabled).start();
  let agents: Array<{ id: string; name: string }>;

  try {
    agents = await resolveAgents(client, resolver, agentName, options);
  } catch (err: any) {
    spinner.fail(err.message);
    throw err;
  }

  if (agents.length === 0) {
    spinner.fail('No agents found');
    return;
  }

  spinner.text = `Fetching memory blocks for ${agents.length} agent(s)...`;

  // Fetch blocks for all agents in parallel
  const agentBlocks = await Promise.all(
    agents.map(async (agent) => {
      try {
        const blocks = await client.listAgentBlocks(agent.id);
        const blockList = Array.isArray(blocks) ? blocks : ((blocks as any)?.items || []);
        return { agent, blocks: blockList };
      } catch {
        return { agent, blocks: [] };
      }
    })
  );

  spinner.stop();

  // Build usage rows — deduplicate shared blocks (same ID across agents)
  const usageRows: MemoryUsageRow[] = [];
  const seenBlockIds = new Map<string, string[]>(); // blockId → [agentNames]

  // First pass: collect which agents share which block IDs
  for (const { agent, blocks } of agentBlocks) {
    for (const block of blocks) {
      const blockId = block.id || '';
      if (!seenBlockIds.has(blockId)) {
        seenBlockIds.set(blockId, []);
      }
      seenBlockIds.get(blockId)!.push(agent.name);
    }
  }

  // Second pass: build rows, only show each block once
  const emittedBlockIds = new Set<string>();
  for (const { agent, blocks } of agentBlocks) {
    for (const block of blocks) {
      const blockId = block.id || '';

      // Skip if we already emitted this shared block
      if (emittedBlockIds.has(blockId)) continue;
      emittedBlockIds.add(blockId);

      const value = block.value || '';
      const limit = block.limit || 0;
      const used = value.length;
      const fillPct = limit > 0 ? Math.round((used / limit) * 100) : 0;
      const sharedWith = seenBlockIds.get(blockId) || [agent.name];

      usageRows.push({
        agent: sharedWith.length > 1 ? sharedWith.join(', ') : agent.name,
        block: block.label || block.name || block.id,
        limit,
        used,
        fillPct,
        shared: sharedWith.length > 1,
        preview: value.slice(0, 60),
      });
    }
  }

  // JSON output
  if (options.output === 'json') {
    const jsonData = options.analyze
      ? { usage: usageRows, analyze: 'use --analyze flag with table output' }
      : usageRows;
    output(JSON.stringify(jsonData, null, 2));

    // If not analyzing, we're done
    if (!options.analyze) return;
  }

  // Display usage table (always shown, even in analyze mode)
  if (options.output !== 'json') {
    output(displayMemoryUsage(usageRows));
  }

  // Analyze mode — message each agent
  if (options.analyze) {
    await runAnalysis(client, agents, agentBlocks, options, spinnerEnabled);
  }
}

/**
 * Send analysis prompts to agents and display results
 */
async function runAnalysis(
  client: LettaClientWrapper,
  agents: Array<{ id: string; name: string }>,
  agentBlocks: Array<{ agent: { id: string; name: string }; blocks: any[] }>,
  options: ReportOptions,
  spinnerEnabled: boolean
) {
  // Build block data map for prompt generation
  const blocksByAgent = new Map<string, any[]>();
  for (const { agent, blocks } of agentBlocks) {
    blocksByAgent.set(agent.id, blocks);
  }

  // Confirmation
  if (!options.confirm) {
    output('');
    output(`This will message ${agents.length} agent(s) to analyze their memory (costs tokens).`);
    const confirmed = await promptConfirmation('Proceed? (y/N) ');
    if (!confirmed) {
      output('Aborted.');
      return;
    }
  }

  output('');

  // Send messages using bulk messenger with per-agent prompts
  const results = await bulkSendMessage('', {
    agents,
    confirm: true,  // we already confirmed above
    collectResponse: true,
    messageFn: (agent) => buildAnalysisPrompt(blocksByAgent.get(agent.id) || []),
  }, (msg) => log(msg));

  // Parse responses
  const analyses: AgentAnalysis[] = [];
  for (const result of results) {
    if (result.status === 'completed' && result.responseText) {
      analyses.push(parseAnalysisResponse(result.agentName, result.responseText));
    } else {
      analyses.push({
        agent: result.agentName,
        blocks: [],
        overall: { redundancy: 'unknown', contradictions: null, actions: [] },
        error: result.error || `${result.status}`,
      });
    }
  }

  // Display
  if (options.output === 'json') {
    output(JSON.stringify(analyses, null, 2));
  } else {
    output('');
    output(displayMemoryAnalysis(analyses));
  }
}

/**
 * Build the analysis prompt for an agent given its blocks
 */
function buildAnalysisPrompt(blocks: any[]): string {
  const blockDescriptions = blocks.map(block => {
    const value = block.value || '';
    const limit = block.limit || 0;
    const used = value.length;
    const fillPct = limit > 0 ? Math.round((used / limit) * 100) : 0;
    const label = block.label || block.name || 'unnamed';
    const preview = value.slice(0, 500);
    return `Block "${label}" (${used}/${limit} chars, ${fillPct}% full):\n"""${preview}"""`;
  }).join('\n\n');

  return `Review your memory blocks and report on each one using EXACTLY this format.
Do not use markdown. Use the exact section markers shown.

${blockDescriptions}

For each block above, write a section like this:

=== BLOCK: <block label> ===
TOPICS: <number of distinct topics stored in this block>
STATUS: <healthy|crowded|near-full|empty>
SPLIT: <yes|no>
SUMMARY: <1 sentence on what this block contains>
STALE: <any outdated facts, old dates, or deprecated references, or null>
MISSING: <topics you frequently get asked about but have no memory block for, or null>

After all blocks, write one overall section:

=== OVERALL ===
REDUNDANCY: <none|low|moderate|high — is info duplicated across blocks?>
CONTRADICTIONS: <any conflicting info between blocks, or null>
ACTIONS: <comma-separated list of suggested changes to your memory layout>`;
}

/**
 * Resolve agents from name, --all, --match, or --tags
 */
async function resolveAgents(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  agentName: string | undefined,
  options: ReportOptions
): Promise<Array<{ id: string; name: string }>> {
  // Single agent by name
  if (agentName) {
    const { agent } = await resolver.findAgentByName(agentName);
    return [{ id: agent.id, name: agent.name }];
  }

  // By tags
  if (options.tags) {
    const tagFilter = options.tags.split(',').map(t => t.trim()).filter(Boolean);
    const agents = await client.listAgents({ tags: tagFilter });
    const agentList = normalizeResponse(agents);
    return agentList.map((a: any) => ({ id: a.id, name: a.name }));
  }

  // All agents or wildcard match
  const allAgents = await resolver.getAllAgents();

  if (options.all) {
    return allAgents.map((a: any) => ({ id: a.id, name: a.name }));
  }

  if (options.match) {
    return allAgents
      .filter((a: any) => minimatch(a.name, options.match!))
      .map((a: any) => ({ id: a.id, name: a.name }));
  }

  throw new Error('Specify an agent name, --all, --match <pattern>, or --tags <tags>');
}
