import chalk from 'chalk';
import { purple } from '../constants';
import { displayEntryList, EntryListItem } from './entry-list';

export interface MessageDisplayData {
  content: string | null;
  role: string;
  timestamp: string;
}

export function displayMessages(
  agentName: string,
  messages: MessageDisplayData[],
  limitNote: string
): string {
  const title = `Messages for ${agentName} (${messages.length})`;

  const items: EntryListItem[] = messages.map(msg => {
    const roleColor = msg.role === 'user_message' ? chalk.green
      : msg.role === 'assistant_message' ? purple
      : chalk.dim;

    return {
      metaLine: chalk.dim(msg.timestamp) + roleColor(` [${msg.role}]`),
      content: msg.content || `[${msg.role}]`,
    };
  });

  return displayEntryList(title, items, limitNote || undefined);
}
