import createLog from 'silk-log';
const log = createLog(`mock-sonos`);

class Sonos {
  pause() {
    log.info(`Pause`);
  }

  play() {
    log.info(`Play`);
  }

  playQuery(query, value) {
    log.info(`PlayQuery ${query}, ${value}`);
  }

  playUri(uri) {
    log.info(`PlayUri ${uri}`);
  }
}

let sonos = new Sonos();
export default sonos;
