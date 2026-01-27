import chalk from 'chalk';
import { purple, STATUS } from '../constants';
import { createBoxWithRows, stripAnsi, truncate, shouldUseFancyUx } from '../box';

export interface ApplySummaryData {
  succeeded: string[];
  failed: { name: string; err: string }[];
  unchanged: string[];
}

export function displayApplySummary(data: ApplySummaryData): string {
  const total = data.succeeded.length + data.failed.length + data.unchanged.length;
  const hasErrors = data.failed.length > 0;

  if (!shouldUseFancyUx()) {
    return displayApplySummaryPlain(data, total);
  }

  if (!hasErrors) {
    if (data.succeeded.length > 0) {
      return purple(`Apply completed: ${data.succeeded.length} applied, ${data.unchanged.length} unchanged`);
    }
    return purple(`Apply completed: all ${data.unchanged.length} agents already up to date`);
  }

  // Full box for error cases
  const rows: string[] = [];
  for (const name of data.succeeded) {
    rows.push(STATUS.ok + '  ' + chalk.white(name));
  }
  for (const name of data.unchanged) {
    rows.push(STATUS.info + '  ' + chalk.dim(name) + chalk.dim(' (unchanged)'));
  }
  for (const f of data.failed) {
    rows.push(STATUS.fail + '  ' + chalk.red(f.name) + chalk.dim(' - ') + chalk.red(truncate(f.err, 40)));
  }
  rows.push('');

  const parts: string[] = [];
  if (data.succeeded.length > 0) parts.push(`${data.succeeded.length} applied`);
  parts.push(`${data.failed.length} failed`);
  if (data.unchanged.length > 0) parts.push(`${data.unchanged.length} unchanged`);
  rows.push(chalk.dim(`${total} agents: ${parts.join(', ')}`));

  const width = Math.max(55, ...rows.map(r => stripAnsi(r).length + 4));
  return createBoxWithRows('Apply (with errors)', rows, width).join('\n');
}

function displayApplySummaryPlain(data: ApplySummaryData, total: number): string {
  const lines: string[] = [];
  if (data.failed.length > 0) {
    lines.push(`Apply completed with errors:`);
    lines.push(`  Succeeded: ${data.succeeded.length}/${total} agents`);
    lines.push(`  Failed: ${data.failed.length}/${total} agents`);
    if (data.unchanged.length > 0) lines.push(`  Unchanged: ${data.unchanged.length}/${total} agents`);
    lines.push('');
    lines.push('Failures:');
    for (const f of data.failed) {
      lines.push(`  - ${f.name}: ${f.err}`);
    }
  } else if (data.succeeded.length > 0) {
    lines.push(`Apply completed: ${data.succeeded.length} applied, ${data.unchanged.length} unchanged`);
  } else {
    lines.push(`Apply completed: all ${data.unchanged.length} agents already up to date`);
  }
  return lines.join('\n');
}
