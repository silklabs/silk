/**
 * @noflow
 * @private
 */

import createLog from 'silk-log/device';
import * as util from 'silk-sysutils';
const log = createLog('audioplayer');

export type PlayerType = {
  setVolume(gain: number): void;
  play(fileName: string, callback: (err: string) => void): void;
  stop(): boolean;
  pause(): boolean;
  resume(): boolean;
};

let bindings = null;

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
  bindings = require('../build/Release/silk-audioplayer.node'); //eslint-disable-line
} else {
  bindings = {
    Player: function () {
      this.play = function(fileName, callback) {
        playOnHost(fileName)
        .then(() => callback())
        .catch(err => callback(err));
      };
      this.setVolume = function(gain) {
        log.warn(`setVolume is not supported on this platform`);
      };
      this.stop = function() {
        log.warn(`stop is not supported on this platform`);
      };
      this.pause = function() {
        log.warn(`pause is not supported on this platform`);
      };
      this.resume = function() {
        log.warn(`resume is not supported on this platform`);
      };
    },
  };
}

module.exports = bindings;
