/**
 * @noflow
 */

import Player from 'silk-audioplayer';
import fs from 'fs';
import createLog from 'silk-log/device';
const log = createLog('test');

let player = new Player('stream');

let stream = fs.createReadStream(__dirname + '/../media/stream.mp3');
stream.on('error', (err) => log.error(err.message));
stream.on('data', data => player.write(data));
player.on('error', (err) => log.error(err.message));
player.on('started', () => {
  log.info(`Stopping audio in 5 seconds`);
  setTimeout(() => {
    log.info(`Stopping now`);
    player.stop();
  }, 5000);
});
