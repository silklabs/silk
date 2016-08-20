import createLog from 'silk-log';
const log = createLog(`mock-silk-audioplayer`);

class Player {
  setVolume(gain) {
  }

  play(fileName) {
    log.info(`Playing ${fileName}`);
    return Promise.resolve();
  }

  load(fileName) {
    return Promise.resolve();
  }
}

let player = new Player();
export default player;
