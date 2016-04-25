/**
 * Helper to output more user friendly error messages then exit with 1.
 *
 * @flow
 */

import colors from 'cli-color';

const NAME = `silk-cli`;

export function warn (message: string) {
  console.error(`[${colors.bold(NAME)}] ${colors.redBright('WARN')} : ${message}`);
}

export function fatal (message: string) {
  console.error(`[${colors.bold(NAME)}] ${colors.redBright('FATAL')} : ${colors.red(message)}`);
  process.exit(1);
}
