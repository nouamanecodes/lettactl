import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { normalizeResponse } from '../../lib/shared/response-normalizer';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { output } from '../../lib/shared/logger';
import { GetOptions } from './types';
import { shouldUseFancyUx, BOX } from '../../lib/ux/box';
import chalk from 'chalk';
import { purple } from '../../lib/ux/constants';

export async function getAll(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  options?: GetOptions,
  spinnerEnabled?: boolean
) {
  const spinner = createSpinner('Loading server overview...', spinnerEnabled).start();

  const [agents, blocks, tools, folders, archives, mcpServers] = await Promise.all([
    resolver.getAllAgents().catch(() => []),
    client.listBlocks().catch(() => []),
    client.listTools().catch(() => []),
    client.listFolders().catch(() => []),
    client.listArchives().catch(() => []),
    client.listMcpServers().catch(() => []),
  ]);

  const agentList = normalizeResponse(agents);
  const blockList = normalizeResponse(blocks);
  const toolList = normalizeResponse(tools);
  const folderList = normalizeResponse(folders);
  const archiveList = normalizeResponse(archives);
  const mcpList = normalizeResponse(mcpServers);

  spinner.stop();

  const summary = {
    agents: { count: agentList.length, items: agentList.map((a: any) => a.name) },
    blocks: { count: blockList.length, items: blockList.map((b: any) => b.label || b.name) },
    tools: { count: toolList.length, items: toolList.map((t: any) => t.name) },
    folders: { count: folderList.length, items: folderList.map((f: any) => f.name) },
    archives: { count: archiveList.length, items: archiveList.map((a: any) => a.name) },
    mcpServers: { count: mcpList.length, items: mcpList.map((m: any) => m.name || m.server_name) },
  };

  if (OutputFormatter.handleJsonOutput(summary, options?.output)) {
    return;
  }

  if (shouldUseFancyUx()) {
    output(renderFancyOverview(summary, agentList));
  } else {
    output(renderPlainOverview(summary, agentList));
  }
}

interface ResourceSummary {
  agents: { count: number; items: string[] };
  blocks: { count: number; items: string[] };
  tools: { count: number; items: string[] };
  folders: { count: number; items: string[] };
  archives: { count: number; items: string[] };
  mcpServers: { count: number; items: string[] };
}

function renderFancyOverview(summary: ResourceSummary, agentList: any[]): string {
  const width = 70;
  const lines: string[] = [];

  // Header
  lines.push(purple(BOX.horizontal.repeat(width)));
  lines.push(purple(' Server Overview'));
  lines.push(purple(BOX.horizontal.repeat(width)));

  // Resource counts
  lines.push('');
  const counts = [
    ['Agents', summary.agents.count],
    ['Blocks', summary.blocks.count],
    ['Tools', summary.tools.count],
    ['Folders', summary.folders.count],
    ['Archives', summary.archives.count],
    ['MCP Servers', summary.mcpServers.count],
  ] as const;

  for (const [label, count] of counts) {
    const countStr = String(count);
    const dots = '.'.repeat(Math.max(2, 30 - label.length - countStr.length));
    lines.push(`  ${chalk.white(label)} ${chalk.dim(dots)} ${count > 0 ? chalk.white(countStr) : chalk.dim('0')}`);
  }

  // Agent list with models
  if (agentList.length > 0) {
    lines.push('');
    lines.push(purple(BOX.horizontal.repeat(3)) + ' ' + purple('Agents') + ' ' + purple(BOX.horizontal.repeat(width - 11)));
    const showAgents = agentList.slice(0, 20);
    for (const agent of showAgents) {
      const model = agent.llm_config?.handle || agent.llm_config?.model || '';
      const modelShort = model.length > 30 ? model.substring(0, 27) + '...' : model;
      lines.push(`  ${chalk.white(agent.name)}${modelShort ? chalk.dim(` · ${modelShort}`) : ''}`);
    }
    if (agentList.length > 20) {
      lines.push(chalk.dim(`  ... and ${agentList.length - 20} more`));
    }
  }

  return lines.join('\n');
}

function renderPlainOverview(summary: ResourceSummary, agentList: any[]): string {
  const lines: string[] = [];

  lines.push('Server Overview');
  lines.push('='.repeat(40));
  lines.push(`Agents:       ${summary.agents.count}`);
  lines.push(`Blocks:       ${summary.blocks.count}`);
  lines.push(`Tools:        ${summary.tools.count}`);
  lines.push(`Folders:      ${summary.folders.count}`);
  lines.push(`Archives:     ${summary.archives.count}`);
  lines.push(`MCP Servers:  ${summary.mcpServers.count}`);

  if (agentList.length > 0) {
    lines.push('');
    lines.push('Agents:');
    const showAgents = agentList.slice(0, 20);
    for (const agent of showAgents) {
      const model = agent.llm_config?.handle || agent.llm_config?.model || '';
      lines.push(`  - ${agent.name}${model ? ` (${model})` : ''}`);
    }
    if (agentList.length > 20) {
      lines.push(`  ... and ${agentList.length - 20} more`);
    }
  }

  return lines.join('\n');
}
