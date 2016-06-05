/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

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
  propWatcher,
} from 'silk-sysutils';

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

