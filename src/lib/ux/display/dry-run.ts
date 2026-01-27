import chalk from 'chalk';
import { purple } from '../constants';
import { BOX, createBoxWithRows, shouldUseFancyUx } from '../box';

export function displayDryRunSeparator(): string {
  if (!shouldUseFancyUx()) {
    return '='.repeat(50);
  }
  return purple(BOX.horizontal.repeat(50));
}

export interface DryRunSummaryData {
  created: number;
  updated: number;
  unchanged: number;
  totalChanges: number;
}

export function displayDryRunSummary(data: DryRunSummaryData): string {
  if (!shouldUseFancyUx()) {
    return displayDryRunSummaryPlain(data);
  }

  const rows: string[] = [];
  if (data.created > 0) rows.push(chalk.green(`[+] ${data.created} agent(s) to create`));
  if (data.updated > 0) rows.push(purple(`[~] ${data.updated} agent(s) to update`));
  if (data.unchanged > 0) rows.push(chalk.dim(`[=] ${data.unchanged} agent(s) unchanged`));
  rows.push('');
  rows.push(chalk.white(`Total changes: ${data.totalChanges}`));

  if (data.totalChanges === 0) {
    rows.push(chalk.dim('No changes to apply.'));
  } else {
    rows.push(chalk.dim('Run "lettactl apply" to apply these changes.'));
  }

  const width = 50;
  return createBoxWithRows('Dry Run Summary', rows, width).join('\n');
}

function displayDryRunSummaryPlain(data: DryRunSummaryData): string {
  const lines: string[] = [];
  lines.push('Summary:');
  if (data.created > 0) lines.push(`  [+] ${data.created} agent(s) to create`);
  if (data.updated > 0) lines.push(`  [~] ${data.updated} agent(s) to update`);
  if (data.unchanged > 0) lines.push(`  [=] ${data.unchanged} agent(s) unchanged`);
  lines.push(`  Total changes: ${data.totalChanges}`);
  if (data.totalChanges === 0) {
    lines.push('');
    lines.push('No changes to apply.');
  } else {
    lines.push('');
    lines.push('Run "lettactl apply" to apply these changes.');
  }
  return lines.join('\n');
}

export function displayDryRunAction(name: string, action: 'create' | 'update' | 'unchanged', detail?: string): string {
  const tag = action === 'create' ? '[+]' : action === 'update' ? '[~]' : '[=]';
  const label = action === 'create' ? 'CREATE'
    : action === 'update' ? `UPDATE${detail ? ` - ${detail}` : ''}`
    : 'no changes';

  if (!shouldUseFancyUx()) {
    return `${tag} ${name} (${label})`;
  }

  const tagColor = action === 'create' ? chalk.green(tag)
    : action === 'update' ? purple(tag)
    : chalk.dim(tag);
  const labelColor = action === 'create' ? chalk.green(label)
    : action === 'update' ? purple(label)
    : chalk.dim(label);

  return `${tagColor} ${chalk.white(name)} ${chalk.dim('(')}${labelColor}${chalk.dim(')')}`;
}
