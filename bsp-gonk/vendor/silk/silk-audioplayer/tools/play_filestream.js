/**
 * @noflow
 */

import Player from 'silk-audioplayer';
import fs from 'fs';
import createLog from 'silk-log';
const log = createLog('test');

let player = new Player();

let stream = fs.createReadStream(__dirname + '/../media/stream.mp3');
stream.on('error', (err) => log.error(err.message));
stream.on('data', (data) => player.write(data));
stream.on('end', () => player.endOfStream());

player.on('prepared', () => log.info(`Player prepared`));
player.on('paused', () => log.info(`Player paused`));
player.on('error', (err) => log.error(err.message));
player.on('started', () => {
  log.info(`Player started`);
  setTimeout(() => {
    log.info(`Pausing now`);
    player.pause();
  }, 5000);

  setTimeout(() => {
    log.info(`Resuming now`);
    player.resume();
  }, 7000);

  setTimeout(() => {
    log.info(`Stopping now`);
    player.stop();
  }, 10000);
});
