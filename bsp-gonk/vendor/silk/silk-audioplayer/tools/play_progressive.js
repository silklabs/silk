/**
 * @noflow
 */

import Player from 'silk-audioplayer';
import createLog from 'silk-log/device';
import http from 'http';
const log = createLog('test');

const url = 'http://www.hrupin.com/wp-content/uploads/mp3/testsong_20_sec.mp3';

const player = new Player();

http.get(url, (res) => {
  res.once('error', (err) => log.info(err));
  res.on('data', data => player.write(data));
  res.once('end', () => {
    if (res.statusCode !== 200) {
      log.info(`status code ${res.statusCode}, error \'${res.statusMessage}\'`);
    } else {
      log.info(`Request complete`);
      player.endOfStream();
    }
  });
});
