import chalk from 'chalk';
import { purple } from '../constants';
import { BOX, shouldUseFancyUx } from '../box';

export interface EntryListItem {
  metaLine: string;
  content: string;
}

export function displayEntryList(title: string, items: EntryListItem[], note?: string): string {
  if (!shouldUseFancyUx()) {
    return displayEntryListPlain(title, items, note);
  }

  const lines: string[] = [];
  const width = 80;

  lines.push(purple(BOX.horizontal.repeat(3)) + ' ' + purple(title) + ' ' + purple(BOX.horizontal.repeat(Math.max(0, width - title.length - 6))));

  if (note) {
    lines.push(chalk.dim(note));
  }
  lines.push('');

  for (const item of items) {
    lines.push(item.metaLine);
    for (const line of item.content.split('\n')) {
      lines.push('  ' + chalk.white(line));
    }
    lines.push('');
  }

  return lines.join('\n');
}

function displayEntryListPlain(title: string, items: EntryListItem[], note?: string): string {
  const lines: string[] = [];

  lines.push(title);
  if (note) {
    lines.push(note);
  }
  lines.push('');

  for (const item of items) {
    lines.push(item.metaLine);
    for (const line of item.content.split('\n')) {
      lines.push(`  ${line}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
