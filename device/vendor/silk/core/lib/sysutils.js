/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import createLog from './log';

// Workaround https://phabricator.babeljs.io/T2877.
// Replace this with `export *` once we're on a sufficiently high
// version of babel-plugin-transform-runtime.
export {
  processthrow,
  exec,
  execRetry,
  getprop,
  getstrprop,
  getboolprop,
  getintprop,
  getlistprop,
  setprop,
  timeout,
  playSound,
} from 'silk-sysutils';

const log = createLog('sysutils');

/**
 * This class provides helper utility to watch an android property and notify
 * via an event if the specified property has changed
 * @memberof sysutils
 */
class PropWatcher extends EventEmitter {
  /**
   * Property changed event. This event is emiited when the property being
   * watched has changed.
   *
   * @event <property_name>
   * @memberof sysutils.PropWatcher
   * @type {Object}
   * @property {string} Property value
   */
  constructor() {
    super();
    // Spawn process only if there is someone watching
    this.once('newListener', this._spawnWatchprops);
  }

  _spawnWatchprops: (() => void) = () => {
    let cmd = spawn('watchprops', []);
    cmd.stderr.on('data', data => {
      let match = data.toString().match(/^\d+ ([^ ]+) /);
      if (match && match[1]) {
        this.emit(match[1]);
      }
    });

    cmd.on('error', (err) => {
      log.error(`Failed to start watchprops ${err}`);
      // If watchprops isn't available ENOENT error is
      // received as well as close error below causing
      // us to go in an endless loop of restarting watchprops
      if (err.code === 'ENOENT') {
        cmd.removeListener('close', this._spawnWatchprops);
      }
    });

    // respawn if dies for some reason
    cmd.on('close', this._spawnWatchprops);
  };
}

export let propWatcher = new PropWatcher();

/**
 * Returns a random number between the provided range
 *
 * @param min Minimum number
 * @param max Maximum number
 * @memberof sysutils
 */
export function randBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Wrapper around process.uptime that returns time
 * in total milliseconds instead of seconds.
 */
export function uptime(start?: number) {
  let end = process.hrtime();
  let endMs = (end[0] * 1000) + (end[1] / 1000000);

  let diffMs = endMs - (start ? start : 0);
  return diffMs;
}

