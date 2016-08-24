/**
 * @private
 */

import createLog from 'silk-log/device';
import * as util from 'silk-sysutils';
const log = createLog('audioplayer');

let player = null;

/**
 * This method is called to play audio files on host
 * @private
 */
function playOnHost(fileName: string): Promise<void> {
  let BINARY;
  if (process.platform === 'darwin') {
    BINARY = 'afplay'; // Default player on OSX
  } else if (process.platform === 'linux') {
    BINARY = 'mplayer'; // Run apt-get install mplayer first
  } else {
    return Promise.reject('Unsupported OS');
  }

  return util.exec(BINARY, [fileName])
  .catch(err => {
    let msg = `Failed to exec '${BINARY}': ${err}`;
    log.error(msg);
    throw new Error(msg);
  })
  .then(result => {
    if (result.code !== 0) {
      let msg = `'${BINARY}' returned error code ${result.code}: ` +
      result.stderr;
      log.error(msg);
      throw new Error(msg);
    }
  });
}

if (process.platform === 'android') {
  let bindings = require('../build/Release/silk-audioplayer.node'); //eslint-disable-line
  player = new bindings.Player();
} else {
  player = {
    play(fileName, callback) {
      playOnHost(fileName)
      .then(() => callback())
      .catch(err => callback(err));
    },
    setVolume(gain) {
      log.warn(`setVolume is not supported on this platform`);
    },
    stop() {
      log.warn(`stop is not supported on this platform`);
    },
  };
}

module.exports = player;
