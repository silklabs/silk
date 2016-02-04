/**
 * Helper to output more user friendly error messages then exit with 1.
 *
 * @flow
 */

import colors from 'cli-color';

const NAME = `silk-cli`;

// XXX: We must do this here rather then at the top of the file because flow
// will not register unless it's in the first docblock.
/*eslint-disable no-console,no-process-exit*/

export function warn (message: string) {
  console.error(`[${colors.bold(NAME)}] ${colors.redBright('WARN')} : ${message}`);
}

export function fatal (message: string) {
  console.error(`[${colors.bold(NAME)}] ${colors.redBright('FATAL')} : ${colors.red(message)}`);
  process.exit(1);
}

/*eslint-enable no-console,no-process-exit*/
