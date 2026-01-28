import chalk from 'chalk';
import { purple } from '../constants';
import { truncate, formatDate } from '../box';
import { displayEntryList, EntryListItem } from './entry-list';

export interface ArchivalEntryData {
  id: string;
  text: string;
  created?: string;
  tags?: string[];
  source?: string;
  score?: number;
}

function buildMetaLine(entry: ArchivalEntryData): string {
  const parts: string[] = [];
  parts.push(chalk.dim(formatDate(entry.created)));
  if (entry.tags?.length) parts.push(purple(entry.tags.join(', ')));
  if (entry.source) parts.push(chalk.dim(`source: ${entry.source}`));
  if (entry.score !== undefined) parts.push(chalk.dim(`score: ${entry.score.toFixed(3)}`));
  return parts.join('  ');
}

export function displayArchival(agentName: string, entries: ArchivalEntryData[]): string {
  const title = `Archival Memory — ${agentName} (${entries.length} entries)`;

  const items: EntryListItem[] = entries.map(entry => ({
    metaLine: buildMetaLine(entry),
    content: truncate(entry.text.replace(/\n/g, ' '), 120),
  }));

  return displayEntryList(title, items);
}

export function displayArchivalContents(agentName: string, entries: ArchivalEntryData[]): string {
  const title = `Archival Memory — ${agentName} (${entries.length} entries)`;

  const items: EntryListItem[] = entries.map(entry => ({
    metaLine: buildMetaLine(entry),
    content: entry.text,
  }));

  return displayEntryList(title, items);
}
