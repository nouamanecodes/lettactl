import chalk from 'chalk';
import { createBoxWithRows, stripAnsi, shouldUseFancyUx } from '../box';

export interface BlockContentData {
  label: string;
  description?: string;
  limit?: number;
  value: string;
}

export function displayBlockContents(agentName: string, blocks: BlockContentData[], short: boolean): string {
  if (!shouldUseFancyUx()) {
    return displayBlockContentsPlain(agentName, blocks, short);
  }

  const lines: string[] = [];

  for (const block of blocks) {
    const meta = block.description
      ? `${block.description} | limit: ${block.limit || 'none'}`
      : `limit: ${block.limit || 'none'}`;

    let value = block.value || '(empty)';
    if (short && value.length > 300) {
      value = value.substring(0, 300) + '...';
    }

    const valueLines = value.split('\n').map(line => chalk.white(line));
    const metaLine = chalk.dim(meta);

    const allRows = [metaLine, '', ...valueLines];
    const maxLen = Math.max(...allRows.map(r => stripAnsi(r).length), block.label.length + 4);
    const width = Math.min(Math.max(maxLen + 4, 50), 120);

    lines.push(createBoxWithRows(block.label, allRows, width).join('\n'));
    lines.push('');
  }

  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n');
}

function displayBlockContentsPlain(agentName: string, blocks: BlockContentData[], short: boolean): string {
  const lines: string[] = [];
  lines.push(`Memory blocks for ${agentName} (${blocks.length}):`);
  lines.push('');

  for (const block of blocks) {
    lines.push(`--- ${block.label} ---`);
    if (block.description) lines.push(`Description: ${block.description}`);
    lines.push(`Limit: ${block.limit || 'none'}`);
    lines.push('');

    let value = block.value || '(empty)';
    if (short && value.length > 300) {
      value = value.substring(0, 300) + '...';
    }
    lines.push(value);
    lines.push('');
  }

  return lines.join('\n');
}
