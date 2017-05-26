/**
 * @flow
 */

import Player from 'silk-audioplayer';
import icy from 'icy';
import createLog from 'silk-log';
const log = createLog('test');

let url = 'http://kidspublicradio2.got.net:8000/lullaby?lang=en-US%2cen%3bq%3d0.8';

let player = new Player();

// Connect to the remote stream
icy.get(url, function (res) {

  // Log the HTTP response headers
  log.info(`headers: `, res.headers);

  // Log any "metadata" events that happen
  res.on('metadata', (metadata) => {
    let parsed = icy.parse(metadata);
    log.info(`parsed: `, parsed);
  });

  const onEnd = (error) => {
    if (error) {
      log.error(error.message);
    }
    log.info(`Shoutcast stream ended`);
  };

  res.once('error', onEnd);
  res.once('end', onEnd);

  player.on('error', (err) => {
    log.error(err);
    process.exit(1); // eslint-disable-line
  });
  player.on('prepared', () => log.info(`Player prepared`));
  player.on('paused', () => log.info(`Player paused`));
  player.on('resumed', () => log.info(`Player resumed`));
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
  });

  res.on('data', data => player.write(data));
});
