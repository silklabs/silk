/**
 * @flow
 */

import createLog from 'silk-log';
const log = createLog(`mock-silk-audioplayer`);

export default class Player {
  setVolume(gain: number) {
  }

  play(fileName: string): Promise<void> {
    log.info(`Playing ${fileName}`);
    return Promise.resolve();
  }

  load(fileName: string) {
    return Promise.resolve();
  }

  stop() {
  }

  pause() {
  }

  resume() {
  }
}
