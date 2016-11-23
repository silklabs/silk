/**
 * @noflow
 */

import Player from 'silk-audioplayer';
import createLog from 'silk-log/device';
const log = createLog('test');

let player = new Player();

player.play(__dirname + '/../media/mpthreetest.mp3')
.then(() => log.info(`Done playing`))
.catch((err) => log.error(err));

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
