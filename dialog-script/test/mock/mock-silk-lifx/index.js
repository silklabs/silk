/**
 * @flow
 */

import createLog from 'silk-log';
const log = createLog(`mock-lifx`);

class Lifx {
  setScene(sceneName: string) {
    log.info(`Changing Lifx to ${sceneName}`);
  }
}

let lifx = new Lifx();
export default lifx;
