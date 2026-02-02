import chalk from 'chalk';
import { LETTA_PURPLE, BANNER } from './constants';
import { output } from '../shared/logger';

export function printBanner(): void {
  output(chalk.hex(LETTA_PURPLE)(BANNER));
  output();
}
