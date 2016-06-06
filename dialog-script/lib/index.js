/**
 * @flow
 */
import createLog from 'silk-log/device';
const log = createLog('silk-dialog-script');

log.info('Greetings');
export function silkWillUnload() {
  log.info('Farewell');
}
