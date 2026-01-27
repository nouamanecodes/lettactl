import chalk from 'chalk';
import { LETTA_PURPLE } from './constants';

const purple = chalk.hex(LETTA_PURPLE);

// Box drawing characters
export const BOX = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
};

/**
 * Strip ANSI codes for length calculation
 */
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLen: number): string {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '…';
}

/**
 * Format date to short readable format
 */
export function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return '-';
  }
}

/**
 * Check if fancy UX should be used (TTY and no --no-ux flag)
 */
export function shouldUseFancyUx(): boolean {
  return !process.argv.includes('--no-ux') && process.stdout.isTTY === true;
}

/**
 * Row data for a box - two columns: key and value
 */
export interface BoxRow {
  key: string;
  value: string;
}

/**
 * Create a box with title and two-column rows
 */
export function createBox(title: string, rows: BoxRow[], width: number): string[] {
  const lines: string[] = [];
  const innerWidth = width - 2;

  const maxKeyLen = Math.max(...rows.map(r => r.key.length));
  const keyColWidth = maxKeyLen + 1;
  const valueColWidth = innerWidth - keyColWidth - 1;

  const topBorder = purple(BOX.topLeft + BOX.horizontal.repeat(2)) +
    ' ' + purple(title) + ' ' +
    purple(BOX.horizontal.repeat(Math.max(0, innerWidth - title.length - 4)) + BOX.topRight);
  lines.push(topBorder);

  for (const row of rows) {
    const key = row.key.padEnd(keyColWidth);
    let value = row.value;
    if (value.length > valueColWidth) {
      value = value.substring(0, valueColWidth - 1) + '…';
    }
    value = value.padEnd(valueColWidth);

    const line = purple(BOX.vertical) + ' ' +
      purple(key) +
      chalk.dim(value) +
      purple(BOX.vertical);
    lines.push(line);
  }

  lines.push(purple(BOX.bottomLeft + BOX.horizontal.repeat(innerWidth) + BOX.bottomRight));

  return lines;
}

/**
 * Create a box with custom row formatting
 */
export function createBoxWithRows(title: string, rows: string[], width: number): string[] {
  const lines: string[] = [];
  const innerWidth = width - 2;

  const topBorder = purple(BOX.topLeft + BOX.horizontal.repeat(2)) +
    ' ' + purple(title) + ' ' +
    purple(BOX.horizontal.repeat(Math.max(0, innerWidth - title.length - 4)) + BOX.topRight);
  lines.push(topBorder);

  for (const row of rows) {
    const rowLen = stripAnsi(row).length;
    const padding = Math.max(0, innerWidth - rowLen - 1);
    const line = purple(BOX.vertical) + ' ' + row + ' '.repeat(padding) + purple(BOX.vertical);
    lines.push(line);
  }

  lines.push(purple(BOX.bottomLeft + BOX.horizontal.repeat(innerWidth) + BOX.bottomRight));

  return lines;
}

/**
 * Merge two columns of box lines side by side
 */
export function mergeColumns(left: string[], right: string[], gap: number = 2): string[] {
  const maxLen = Math.max(left.length, right.length);
  const lines: string[] = [];

  const leftWidth = left.length > 0 ? stripAnsi(left[0]).length : 0;

  for (let i = 0; i < maxLen; i++) {
    const leftLine = left[i] || ' '.repeat(leftWidth);
    const rightLine = right[i] || '';
    const leftPadded = leftLine + ' '.repeat(Math.max(0, leftWidth - stripAnsi(leftLine).length));
    lines.push(leftPadded + ' '.repeat(gap) + rightLine);
  }

  return lines;
}
