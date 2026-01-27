import chalk from 'chalk';

// Letta brand color
export const LETTA_PURPLE = '#7C7CFF';
export const purple = chalk.hex(LETTA_PURPLE);

// ASCII art banner
export const BANNER = `
▄▄    ▄▄▄▄▄ ▄▄▄▄▄▄ ▄▄▄▄▄▄  ▄▄▄  ▄▄▄▄▄ ▄▄▄▄▄▄ ▄▄
██    ██▄▄    ██     ██   ██▀██ ██      ██   ██
██▄▄▄ ██▄▄▄   ██     ██   ██▀██ ██▄▄▄   ██   ██▄▄▄`;

// Status indicators for health checks and status displays
export const STATUS = {
  ok: chalk.green('●'),
  fail: chalk.red('●'),
  warn: chalk.yellow('●'),
  info: chalk.dim('○'),
};

// Block type classification based on agent count
export type BlockType = 'shared' | 'unique' | 'orphaned';

export function getBlockType(agentCount: number): BlockType {
  if (agentCount === 0) return 'orphaned';
  if (agentCount === 1) return 'unique';
  return 'shared';
}

export function blockTypeTag(agentCount?: number, fancy: boolean = true): string {
  if (agentCount === undefined) return '';
  const type = getBlockType(agentCount);
  if (!fancy) return type;
  if (type === 'shared') return purple(type);
  if (type === 'orphaned') return chalk.yellow(type);
  return chalk.dim(type);
}
