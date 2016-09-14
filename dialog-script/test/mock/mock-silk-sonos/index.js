/**
 * @flow
 */

import createLog from 'silk-log';
const log = createLog(`mock-sonos`);

class Sonos {
  pause() {
    log.info(`Pause`);
  }

  play() {
    log.info(`Play`);
  }

  playQuery(query: string, value: string) {
    log.info(`PlayQuery ${query}, ${value}`);
  }

  playUri(uri: string) {
    log.info(`PlayUri ${uri}`);
  }

  getTrackInfo(): Promise<Object> {
    return Promise.resolve({artist: 'the artist', title: 'the title'});
  }
}

let sonos = new Sonos();
export default sonos;
