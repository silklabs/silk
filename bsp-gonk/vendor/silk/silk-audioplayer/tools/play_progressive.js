/**
 * @flow
 */

import Player from 'silk-audioplayer';
import createLog from 'silk-log';
import http from 'http';
const log = createLog('test');

let URL1 = 'http://www.hrupin.com/wp-content/uploads/mp3/testsong_20_sec.mp3';
let URL2 = 'http://iheart.stream.publicradio.org/rockthecradle-iheart.aac';

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
      res.on('data', data => player.write(data));
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
      }, 5000);
    });
  });
}

playUrl(URL1)
.then(() => playUrl(URL2))
.catch(err => log.error(err));
