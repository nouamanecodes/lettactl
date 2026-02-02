import chalk from 'chalk';
import { purple } from '../constants';
import { BOX, createBoxWithRows, shouldUseFancyUx } from '../box';

export function displayDryRunHeader(hasChanges: boolean): string {
  const width = 60;
  if (!shouldUseFancyUx()) {
    if (hasChanges) {
      return `${'='.repeat(width)}\nDRIFT DETECTED - Server differs from config\n${'='.repeat(width)}`;
    }
    return `${'='.repeat(width)}\nNO DRIFT - Server matches config\n${'='.repeat(width)}`;
  }

  if (hasChanges) {
    return `${purple(BOX.horizontal.repeat(width))}\n${chalk.yellow.bold('DRIFT DETECTED')} ${chalk.dim('- Server differs from config')}\n${purple(BOX.horizontal.repeat(width))}`;
  }
  return `${purple(BOX.horizontal.repeat(width))}\n${chalk.green.bold('NO DRIFT')} ${chalk.dim('- Server matches config')}\n${purple(BOX.horizontal.repeat(width))}`;
}

export function displayDryRunSeparator(): string {
  if (!shouldUseFancyUx()) {
    return '='.repeat(60);
  }
  return purple(BOX.horizontal.repeat(60));
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
  if (data.updated > 0) rows.push(purple(`[~] ${data.updated} agent(s) to update (drift)`));
  if (data.unchanged > 0) rows.push(chalk.dim(`[=] ${data.unchanged} agent(s) unchanged`));
  rows.push('');
  rows.push(chalk.white(`Total changes: ${data.totalChanges}`));

  if (data.totalChanges === 0) {
    rows.push(chalk.dim('Server matches config. No changes needed.'));
  } else {
    rows.push('');
    rows.push(chalk.dim('To apply config to server:'));
    rows.push(chalk.cyan('  lettactl apply -f <config>'));
    if (data.updated > 0) {
      rows.push('');
      rows.push(chalk.dim('To capture server state instead:'));
      rows.push(chalk.cyan('  lettactl export agent <name> -f yaml'));
    }
  }

  const width = 55;
  return createBoxWithRows('Dry Run Summary', rows, width).join('\n');
}

function displayDryRunSummaryPlain(data: DryRunSummaryData): string {
  const lines: string[] = [];
  lines.push('Summary:');
  if (data.created > 0) lines.push(`  [+] ${data.created} agent(s) to create`);
  if (data.updated > 0) lines.push(`  [~] ${data.updated} agent(s) to update (drift)`);
  if (data.unchanged > 0) lines.push(`  [=] ${data.unchanged} agent(s) unchanged`);
  lines.push(`  Total changes: ${data.totalChanges}`);
  if (data.totalChanges === 0) {
    lines.push('');
    lines.push('Server matches config. No changes needed.');
  } else {
    lines.push('');
    lines.push('To apply config to server:');
    lines.push('  lettactl apply -f <config>');
    if (data.updated > 0) {
      lines.push('');
      lines.push('To capture server state instead:');
      lines.push('  lettactl export agent <name> -f yaml');
    }
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
