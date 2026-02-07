import chalk from 'chalk';
import { purple, STATUS } from '../../lib/ux/constants';
import { createBoxWithRows, truncate, shouldUseFancyUx } from '../../lib/ux/box';

// === Data Types ===

export interface MemoryUsageRow {
  agent: string;
  block: string;
  limit: number;
  used: number;
  fillPct: number;
  shared?: boolean;
  preview: string;
}

export interface BlockAnalysis {
  label: string;
  topics: number;
  status: string;
  split: boolean;
  summary: string;
  stale: string | null;
  missing: string | null;
}

export interface OverallAnalysis {
  redundancy: string;
  contradictions: string | null;
  actions: string[];
}

export interface AgentAnalysis {
  agent: string;
  blocks: BlockAnalysis[];
  overall: OverallAnalysis;
  error?: string;
}

// === Fill % Color ===

function fillColor(pct: number): (s: string) => string {
  if (pct >= 80) return chalk.red;
  if (pct >= 50) return chalk.yellow;
  return chalk.green;
}

function fillStatus(pct: number): string {
  if (pct >= 80) return STATUS.fail;
  if (pct >= 50) return STATUS.warn;
  return STATUS.ok;
}

// === Usage Table ===

export function displayMemoryUsage(rows: MemoryUsageRow[]): string {
  if (!shouldUseFancyUx()) {
    return displayMemoryUsagePlain(rows);
  }

  const termW = process.stdout.columns || 120;
  const uniqueAgents = new Set(rows.map(r => r.agent));
  const singleAgent = uniqueAgents.size === 1;

  const agentW = singleAgent ? 0 : Math.min(Math.max(...rows.map(r => r.agent.length), 5) + 1, 24);
  const blockW = Math.min(Math.max(...rows.map(r => r.block.length + (r.shared ? 2 : 0)), 5) + 1, 28);
  const numW = 5 + 1 + 5 + 1 + 4; // limit(5) + space + used(5) + space + fill(4)
  const previewW = Math.max(termW - agentW - blockW - numW - 12, 10);

  const tableRows: string[] = [];
  for (const r of rows) {
    const pctStr = `${r.fillPct}%`.padStart(4);
    const blockLabel = r.shared ? `${r.block} *` : r.block;
    const prev = truncate(r.preview.replace(/\n/g, ' '), previewW);

    let row = fillStatus(r.fillPct) + ' ';
    if (!singleAgent) {
      row += chalk.white(truncate(r.agent, agentW - 1).padEnd(agentW));
    }
    row += chalk.white(truncate(blockLabel, blockW - 1).padEnd(blockW)) +
      purple(r.limit.toString().padStart(5)) + ' ' +
      chalk.white(r.used.toString().padStart(5)) + ' ' +
      fillColor(r.fillPct)(pctStr) + ' ' +
      chalk.dim(prev);

    tableRows.push(row);
  }

  let header = '  ';
  if (!singleAgent) {
    header += chalk.dim('AGENT'.padEnd(agentW));
  }
  header += chalk.dim('BLOCK'.padEnd(blockW)) +
    chalk.dim('LIMIT'.padStart(5)) + ' ' +
    chalk.dim('USED'.padStart(5)) + ' ' +
    chalk.dim('FILL') + ' ' +
    chalk.dim('PREVIEW');

  const hasShared = rows.some(r => r.shared);
  const title = singleAgent
    ? `Memory: ${rows[0].agent} (${rows.length} blocks)`
    : `Memory Usage (${rows.length} blocks, ${uniqueAgents.size} agents)`;
  const width = Math.min(agentW + blockW + numW + previewW + 8, termW - 2);
  const boxLines = createBoxWithRows(title, [header, ...tableRows], width);

  if (hasShared) {
    boxLines.push(chalk.dim('  * shared block (attached to multiple agents)'));
  }

  return boxLines.join('\n');
}

function displayMemoryUsagePlain(rows: MemoryUsageRow[]): string {
  const lines: string[] = [];
  const uniqueAgents = new Set(rows.map(r => r.agent));
  const singleAgent = uniqueAgents.size === 1;

  const agentW = singleAgent ? 0 : Math.min(Math.max(...rows.map(r => r.agent.length), 5) + 1, 24);
  const blockW = Math.min(Math.max(...rows.map(r => r.block.length + (r.shared ? 2 : 0)), 5) + 1, 28);

  let header = '';
  if (!singleAgent) header += 'AGENT'.padEnd(agentW);
  header += 'BLOCK'.padEnd(blockW) + ' LIMIT  USED FILL  PREVIEW';
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const r of rows) {
    const prev = truncate(r.preview.replace(/\n/g, ' '), 30);
    const blockLabel = r.shared ? `${r.block} *` : r.block;
    let line = '';
    if (!singleAgent) line += truncate(r.agent, agentW - 1).padEnd(agentW);
    line += truncate(blockLabel, blockW - 1).padEnd(blockW) +
      r.limit.toString().padStart(5) + ' ' +
      r.used.toString().padStart(5) + ' ' +
      `${r.fillPct}%`.padStart(4) + '  ' +
      prev;
    lines.push(line);
  }

  const hasShared = rows.some(r => r.shared);
  if (hasShared) {
    lines.push('');
    lines.push('* shared block (attached to multiple agents)');
  }

  return lines.join('\n');
}

// === Analysis Display ===

export function displayMemoryAnalysis(analyses: AgentAnalysis[]): string {
  if (!shouldUseFancyUx()) {
    return displayMemoryAnalysisPlain(analyses);
  }

  const lines: string[] = [];

  // Block analysis table
  const blockRows: string[] = [];
  const agentW = Math.max(...analyses.map(a => a.agent.length), 5) + 1;
  const blockW = Math.max(...analyses.flatMap(a => a.blocks.map(b => b.label.length)), 5) + 1;

  for (const a of analyses) {
    if (a.error) {
      blockRows.push(STATUS.fail + '  ' +
        chalk.white(a.agent.padEnd(agentW)) +
        chalk.red(`Error: ${a.error}`));
      continue;
    }

    for (const b of a.blocks) {
      const statusColor = b.status === 'healthy' ? chalk.green :
        b.status === 'empty' ? chalk.dim :
        b.status === 'near-full' ? chalk.red : chalk.yellow;

      const row = STATUS.info + '  ' +
        chalk.white(a.agent.padEnd(agentW)) +
        chalk.white(b.label.padEnd(blockW)) +
        chalk.white(b.topics.toString().padStart(6)) + '  ' +
        statusColor(b.status.padEnd(10)) +
        (b.split ? chalk.red('yes'.padEnd(6)) : chalk.dim('no'.padEnd(6))) +
        chalk.dim(truncate(b.summary, 40));

      blockRows.push(row);
    }
  }

  const header = '   ' +
    chalk.dim('AGENT'.padEnd(agentW)) +
    chalk.dim('BLOCK'.padEnd(blockW)) +
    chalk.dim('TOPICS') + '  ' +
    chalk.dim('STATUS'.padEnd(10)) +
    chalk.dim('SPLIT') + ' ' +
    chalk.dim('SUMMARY');

  const width = agentW + blockW + 70;
  const boxLines = createBoxWithRows(`Memory Analysis (${analyses.length} agents)`, [header, ...blockRows], width);
  lines.push(boxLines.join('\n'));

  // Health issues section
  const issues: string[] = [];
  for (const a of analyses) {
    if (a.error) continue;
    for (const b of a.blocks) {
      if (b.stale) {
        issues.push(`  ${a.agent}/${b.label}: ${chalk.yellow('STALE')} — ${b.stale}`);
      }
      if (b.missing) {
        issues.push(`  ${a.agent}/${b.label}: ${chalk.cyan('MISSING')} — ${b.missing}`);
      }
    }
  }

  if (issues.length > 0) {
    lines.push('');
    lines.push(chalk.white('Health Issues:'));
    lines.push(...issues);
  }

  // Overall section
  const overalls: string[] = [];
  for (const a of analyses) {
    if (a.error) continue;
    const o = a.overall;
    let line = `  ${chalk.white(a.agent)}:  redundancy=${o.redundancy}`;
    if (o.contradictions) {
      line += `, ${chalk.red('contradictions')}: ${o.contradictions}`;
    }
    overalls.push(line);

    if (o.actions.length > 0) {
      overalls.push(`    ${chalk.cyan('Actions')}: ${o.actions.join(', ')}`);
    }
  }

  if (overalls.length > 0) {
    lines.push('');
    lines.push(chalk.white('Overall:'));
    lines.push(...overalls);
  }

  return lines.join('\n');
}

function displayMemoryAnalysisPlain(analyses: AgentAnalysis[]): string {
  const lines: string[] = [];
  const agentW = Math.max(...analyses.map(a => a.agent.length), 5) + 1;
  const blockW = Math.max(...analyses.flatMap(a => a.blocks.map(b => b.label.length)), 5) + 1;

  const header = 'AGENT'.padEnd(agentW) + 'BLOCK'.padEnd(blockW) + 'TOPICS  STATUS      SPLIT  SUMMARY';
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const a of analyses) {
    if (a.error) {
      lines.push(`${a.agent.padEnd(agentW)}Error: ${a.error}`);
      continue;
    }

    for (const b of a.blocks) {
      const line = a.agent.padEnd(agentW) +
        b.label.padEnd(blockW) +
        b.topics.toString().padStart(6) + '  ' +
        b.status.padEnd(10) + '  ' +
        (b.split ? 'yes' : 'no').padEnd(6) +
        truncate(b.summary, 40);
      lines.push(line);
    }
  }

  // Health issues
  const issues: string[] = [];
  for (const a of analyses) {
    if (a.error) continue;
    for (const b of a.blocks) {
      if (b.stale) issues.push(`  ${a.agent}/${b.label}: STALE — ${b.stale}`);
      if (b.missing) issues.push(`  ${a.agent}/${b.label}: MISSING — ${b.missing}`);
    }
  }
  if (issues.length > 0) {
    lines.push('');
    lines.push('Health Issues:');
    lines.push(...issues);
  }

  // Overall
  for (const a of analyses) {
    if (a.error) continue;
    const o = a.overall;
    let line = `  ${a.agent}: redundancy=${o.redundancy}`;
    if (o.contradictions) line += `, contradictions: ${o.contradictions}`;
    lines.push(line);
    if (o.actions.length > 0) {
      lines.push(`    Actions: ${o.actions.join(', ')}`);
    }
  }

  return lines.join('\n');
}

// === Response Parser ===

/**
 * Parse marked-text analysis response from an agent.
 * Format uses === BLOCK: name === and KEY: value lines.
 * Gracefully handles partial/malformed responses.
 */
export function parseAnalysisResponse(agentName: string, responseText: string): AgentAnalysis {
  const blocks: BlockAnalysis[] = [];
  let overall: OverallAnalysis = { redundancy: 'unknown', contradictions: null, actions: [] };

  // Split into sections on === markers
  const sections = responseText.split(/^===\s*/m).filter(Boolean);

  for (const section of sections) {
    const lines = section.trim().split('\n');
    const headerLine = lines[0] || '';

    // Parse block section: "BLOCK: persona ==="
    const blockMatch = headerLine.match(/^BLOCK:\s*(.+?)\s*={0,3}\s*$/);
    if (blockMatch) {
      const kv = parseKeyValues(lines.slice(1));
      blocks.push({
        label: blockMatch[1].trim(),
        topics: parseInt(kv['TOPICS'] || '0', 10) || 0,
        status: (kv['STATUS'] || 'unknown').toLowerCase(),
        split: (kv['SPLIT'] || 'no').toLowerCase() === 'yes',
        summary: kv['SUMMARY'] || '',
        stale: kv['STALE'] === 'null' || !kv['STALE'] ? null : kv['STALE'],
        missing: kv['MISSING'] === 'null' || !kv['MISSING'] ? null : kv['MISSING'],
      });
      continue;
    }

    // Parse overall section: "OVERALL ==="
    const overallMatch = headerLine.match(/^OVERALL\s*={0,3}\s*$/);
    if (overallMatch) {
      const kv = parseKeyValues(lines.slice(1));
      overall = {
        redundancy: (kv['REDUNDANCY'] || 'unknown').toLowerCase(),
        contradictions: kv['CONTRADICTIONS'] === 'null' || !kv['CONTRADICTIONS'] ? null : kv['CONTRADICTIONS'],
        actions: kv['ACTIONS'] ? kv['ACTIONS'].split(',').map(a => a.trim()).filter(Boolean) : [],
      };
    }
  }

  return { agent: agentName, blocks, overall };
}

function parseKeyValues(lines: string[]): Record<string, string> {
  const kv: Record<string, string> = {};
  for (const line of lines) {
    const match = line.match(/^([A-Z_]+):\s*(.*)$/);
    if (match) {
      kv[match[1]] = match[2].trim();
    }
  }
  return kv;
}
