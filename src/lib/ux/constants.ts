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
