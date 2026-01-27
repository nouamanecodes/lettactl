import chalk from 'chalk';
import { purple } from '../constants';
import { BOX, shouldUseFancyUx } from '../box';

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
  if (!shouldUseFancyUx()) {
    return displayMessagesPlain(agentName, messages, limitNote);
  }

  const lines: string[] = [];
  const width = 80;

  const title = `Messages for ${agentName} (${messages.length})`;
  lines.push(purple(BOX.horizontal.repeat(3)) + ' ' + purple(title) + ' ' + purple(BOX.horizontal.repeat(Math.max(0, width - title.length - 6))));

  if (limitNote) {
    lines.push(chalk.dim(limitNote));
  }
  lines.push('');

  for (const msg of messages) {
    const roleColor = msg.role === 'user_message' ? chalk.green
      : msg.role === 'assistant_message' ? purple
      : chalk.dim;

    lines.push(chalk.dim(msg.timestamp) + roleColor(` [${msg.role}]`));
    lines.push('  ' + chalk.white(msg.content || `[${msg.role}]`));
    lines.push('');
  }

  return lines.join('\n');
}

function displayMessagesPlain(
  agentName: string,
  messages: MessageDisplayData[],
  limitNote: string
): string {
  const lines: string[] = [];

  lines.push(`Messages for ${agentName}:`);
  lines.push(`Found ${messages.length} message(s)${limitNote ? ' ' + limitNote : ''}`);
  lines.push('');

  for (const msg of messages) {
    lines.push(msg.timestamp);
    lines.push(`  Role: ${msg.role}`);
    lines.push(`  Content: ${msg.content || `[${msg.role}]`}`);
    lines.push('');
  }

  return lines.join('\n');
}
