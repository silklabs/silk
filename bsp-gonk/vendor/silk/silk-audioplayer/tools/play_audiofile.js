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
  player.pause();
  log.info(`getState ${player.getState()}`);
  player.setVolume(0.5);
  player.resume();
  log.info(`getState ${player.getState()}`);
  log.info(`getCurrentPosition ${player.getCurrentPosition()}`);
  log.info(`getDuration ${player.getDuration()}`);
  log.info(`getInfo ${JSON.stringify(player.getInfo())}`);
});
