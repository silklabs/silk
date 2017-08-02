/**
 * @flow
 */

import Player from 'silk-audioplayer';
import createLog from 'silk-log';
import http from 'http';
const log = createLog('test');

const player = new Player();

function playUrl(url) {
  log.info(`Playing ${url}`);
  player.removeAllListeners('done');

  return new Promise((resolve, reject) => {
    player.on('done', () => {
      log.info(`Playback done`);
      resolve();
    });
    let request = http.get(url, (res) => {
      res.once('error', (err) => reject(err));
      res.on('data', (data) => player.write(data));
      res.once('end', () => {
        if (res.statusCode !== 200) {
          log.info(`status code ${res.statusCode}, error \'${res.statusMessage}\'`);
        } else {
          log.info(`Request complete`);
          player.endOfStream();
        }
      });
      setTimeout(() => {
        log.info(`Canceling http request`);
        res.removeAllListeners('data');
        player.stop();
        request.abort();
      }, 10000);
    });
  });
}

playUrl(process.argv[2])
.catch((err) => {
  log.error(err);
  process.exit(1); // eslint-disable-line no-process-exit
});
