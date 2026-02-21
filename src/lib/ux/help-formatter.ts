import chalk from 'chalk';
import { printBanner } from './banner';
import { LETTA_PURPLE } from './constants';
import { BOX, createBox, mergeColumns, BoxRow } from './box';
import { output } from '../shared/logger';

const purple = chalk.hex(LETTA_PURPLE);

interface CommandGroup {
  title: string;
  commands: BoxRow[];
}

const COMMAND_GROUPS: CommandGroup[] = [
  {
    title: 'Operations',
    commands: [
      { key: 'apply', value: 'Deploy agents from config' },
      { key: 'validate', value: 'Validate configuration' },
      { key: 'export', value: 'Export agent to file' },
      { key: 'import', value: 'Import agent from file' },
      { key: 'config', value: 'Manage configuration' },
      { key: 'completion', value: 'Shell completion script' },
    ],
  },
  {
    title: 'Resources',
    commands: [
      { key: 'get', value: 'Display resources / list' },
      { key: 'describe', value: 'Show detailed info' },
      { key: 'create', value: 'Create a new agent' },
      { key: 'update', value: 'Update an agent' },
      { key: 'delete', value: 'Delete a resource' },
      { key: 'delete-all', value: 'Delete multiple agents' },
      { key: 'cleanup', value: 'Remove orphaned resources' },
    ],
  },
  {
    title: 'Messaging',
    commands: [
      { key: 'send', value: 'Send message to agent' },
      { key: 'reset-messages', value: 'Reset history' },
      { key: 'compact-messages', value: 'Compact history' },
      { key: 'cancel-messages', value: 'Cancel running' },
      { key: '', value: '' }, // padding for alignment
      { key: '', value: '' }, // padding for alignment
    ],
  },
  {
    title: 'Monitoring',
    commands: [
      { key: 'health', value: 'Check server status' },
      { key: 'files', value: 'Show attached files' },
      { key: 'run-delete', value: 'Delete/cancel run' },
      { key: '', value: '' }, // padding for alignment
      { key: '', value: '' }, // padding for alignment
      { key: '', value: '' }, // padding for alignment
    ],
  },
];

const OPTIONS: BoxRow[] = [
  { key: '-V, --version', value: 'Show version' },
  { key: '-v, --verbose', value: 'Verbose output' },
  { key: '-q, --quiet', value: 'Suppress output' },
  { key: '--no-spinner', value: 'Disable spinners' },
  { key: '--no-ux', value: 'Plain output (CI)' },
  { key: '-h, --help', value: 'Show this help' },
];

function createOptionsBox(width: number): string[] {
  const lines: string[] = [];
  const innerWidth = width - 2;
  const title = 'Options';

  // Top border with title
  lines.push(purple(BOX.topLeft + BOX.horizontal.repeat(2)) +
    ' ' + purple(title) + ' ' +
    purple(BOX.horizontal.repeat(Math.max(0, innerWidth - title.length - 4)) + BOX.topRight));

  // Option rows
  const maxFlagLen = Math.max(...OPTIONS.map(o => o.key.length));
  const flagColWidth = Math.min(maxFlagLen + 1, 18);
  const descColWidth = innerWidth - flagColWidth - 1;

  for (const opt of OPTIONS) {
    const flag = opt.key.padEnd(flagColWidth);
    const desc = opt.value.padEnd(descColWidth);
    const row = purple(BOX.vertical) + ' ' +
      chalk.cyan(flag) +
      chalk.dim(desc) +
      purple(BOX.vertical);
    lines.push(row);
  }

  lines.push(purple(BOX.bottomLeft + BOX.horizontal.repeat(innerWidth) + BOX.bottomRight));

  return lines;
}

export function printFancyHelp(): void {
  const boxWidth = 38;

  // Print banner
  printBanner();

  // Tagline
  output(chalk.dim('        kubectl-style CLI for Letta AI agent fleets'));
  output(chalk.dim('        run lettactl --help --no-ux for full text help'));
  output();

  // Usage
  output(purple('Usage:') + ' lettactl [options] [command]');
  output();

  // Build boxes for each group
  const boxes: string[][] = COMMAND_GROUPS.map(group =>
    createBox(group.title, group.commands, boxWidth)
  );

  // Create options box
  const optionsBox = createOptionsBox(boxWidth);

  // Arrange in two columns
  // Column 1: Operations, Messaging, Options
  // Column 2: Resources, Monitoring

  const col1Groups = [boxes[0], boxes[2], optionsBox]; // Operations, Messaging, Options
  const col2Groups = [boxes[1], boxes[3]]; // Resources, Monitoring

  // Flatten each column with spacing
  const flattenWithSpacing = (groups: string[][]): string[] => {
    const result: string[] = [];
    for (let i = 0; i < groups.length; i++) {
      result.push(...groups[i]);
      if (i < groups.length - 1) result.push(''); // Add spacing between boxes
    }
    return result;
  };

  const col1 = flattenWithSpacing(col1Groups);
  const col2 = flattenWithSpacing(col2Groups);

  // Merge and print
  const merged = mergeColumns(col1, col2, 2);
  merged.forEach(line => output(line));

  output();
  output(chalk.dim('Run') + ' lettactl <command> --help ' + chalk.dim('for detailed command info'));
  output();
}

export function shouldUseFancyHelp(): boolean {
  // Check if stdout is a TTY and --no-ux is not set
  return process.stdout.isTTY === true;
}
