import chalk from 'chalk';
import { LETTA_PURPLE, BANNER } from './constants';

export function printBanner(): void {
  console.log(chalk.hex(LETTA_PURPLE)(BANNER));
  console.log();
}
