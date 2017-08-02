/**
 * @flow
 */

import Player from 'silk-audioplayer';
import createLog from 'silk-log';
const log = createLog('test');

let player = new Player();
player.setVolume(1.0);

player.play(process.argv[2])
.then(() => {
  log.info(`Done playing`);
})
.catch((err) => {
  log.error(err);
  process.exit(1); // eslint-disable-line no-process-exit
});

player.on('started', () => {
  log.info(`getState ${player.getState()}`);
  log.info(`getInfo ${JSON.stringify(player.getInfo())}`);

  player.pause();

  log.info(`getCurrentPosition ${player.getCurrentPosition()}`);
  log.info(`getDuration ${player.getDuration()}`);
});

player.on('paused', () => {
  log.info(`getState ${player.getState()}`);
  player.resume();
});

player.on('resumed', () => {
  log.info(`getState ${player.getState()}`);
});
