/**
 * @noflow
 */

import Player from 'silk-audioplayer';
import icy from 'icy';
import createLog from 'silk-log/device';
const log = createLog('test');

let url = 'http://firewall.pulsradio.com';

let player = new Player('stream');

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
    player = null;
  };

  res.once('error', onEnd);
  res.once('end', onEnd);

  player.on('error', (err) => log.error(err));
  res.on('data', data => player.write(data));
});
