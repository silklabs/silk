/**
 * This module provides system utility functions
 * @module silk-sysutils
 *
 * @example
 * const util = require('silk-sysutils');
 *
 * util.getprop('ro.product.name', 'unknown');
 *
 * @flow
 * @private
 */

import {execFile, spawn, spawnSync} from 'child_process';
import EventEmitter from 'events';

import createLog from 'silk-log/device';

const log = createLog('sysutils');

let props;
if (process.platform === 'android') {
  props = require('silk-properties'); //eslint-disable-line
} else {
  // TODO: Ideally silk-properties as is would work on the host
  props = {
    get(prop: string): string {
      let result = spawnSync('getprop', [prop], {encoding: 'utf8'});
      if (result.stdout) {
        return result.stdout.toString();
      }
      return '';
    },
    set(prop: string, value: string): void {
      exec('setprop', [prop, value]);
    },
  };
}

/**
 * Throws an exception to the top level process exception handler, escaping any
 * Promises that might otherwise consume the exception.
 * @param {string} e Error string
 * @memberof silk-sysutils
 */
export function processthrow(e: string) {
  process.emit('uncaughtException', e);
}

/**
 * Type representing output of exec command
 *
 * @property {number} code result code
 * @property {string} stdout standard out stream
 * @property {string} stderr standard error stream
 * @memberof silk-sysutils
 */
type ExecOutput = {
  code: number | string;
  stdout: string;
  stderr: string;
};

/**
 * Execute a command
 *
 * @param {string} cmd Command to execute
 * @param {Array<string>} args Arguments for the command
 * @returns {Promise<Object>} result - Object representing output of exec command
 * @returns {number} result.code result code
 * @returns {string} result.stdout standard out stream
 * @returns {string} result.stderr standard error stream
 * @memberof silk-sysutils
 */
export function exec(cmd: string, args: Array<string>): Promise<ExecOutput> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (err, stdout, stderr) => {
      let code = 0;
      if (err) {
        // Reject on exec failures or timeouts only
        if (err.killed || typeof err.code === 'string') {
          return reject(err);
        }
        code = err.code;
      }
      return resolve(
        {code, stdout: stdout.toString(), stderr: stderr.toString()}
      );
    });
  });
}

/**
 * Execute a command. Retry if it fails
 *
 * @param {string} cmd Command to execute
 * @param {Array<string>} args Arguments for the command
 * @param {number} retries Number of retries
 * @param {number} delayMs Delay in ms between each retry
 * @return {Promise<ExecOutput>} Result of the command
 * @memberof silk-sysutils
 */
export function execRetry(
    cmd: string,
    args: Array<string>,
    retries: number,
    delayMs: number): Promise<ExecOutput> {
  return exec(cmd, args).then(result => {
    if (0 === result.code) {
      return result;
    }
    if (retries > 0) {
      return timeout(delayMs).then(() => execRetry(cmd, args, retries - 1, delayMs));
    }
    return Promise.reject(result);
  });
}


/**
 * Type of system scalar property
 * @property {(number|string|boolean)} ScalarPropTypes
 * @private
 */
type ScalarPropTypes = string | boolean | number;

/**
 * Type of system property
 * @property {(Array<PropTypes> | ScalarPropTypes)} PropTypes
 * @private
 */
type PropTypes = Array<PropTypes> | ScalarPropTypes;

/**
 * Get value of a system property. Check to see if system property
 * is available. If property is not available check silk.prop file instead.
 *
 * @param {string} prop Name of the property to fetch
 * @param {string | boolean | number} [defaultValue=null] Default value to use if property is not available
 * @return {string | boolean | number} Value of the property
 * @memberof silk-sysutils
 */
export function getprop(prop: string, defaultValue?: PropTypes): PropTypes {
  let value = props.get(prop);
  if (value === '') {
    return (defaultValue === null || defaultValue === undefined) ? '' :
        defaultValue;
  }
  return value;
}

/**
 * Get value of a system property as string
 *
 * @param {string} prop Name of the property to fetch
 * @param {string} [defaultValue=null] Default value to use if property is not available
 * @return {string} Value of the property
 * @memberof silk-sysutils
 */
export function getstrprop(prop: string, defaultValue?: string): string {
  return String(getprop(prop, defaultValue));
}

/**
 * Get value of a system property as boolean
 *
 * @param {string} prop Name of the property to fetch
 * @param {boolean} [defaultValue=false] Default value to use if property is not available
 * @return {boolean} Value of the property
 * @memberof silk-sysutils
 */
export function getboolprop(prop: string, defaultValue: boolean = false): boolean {
  let value = getprop(prop, defaultValue);
  if ((value === 'true') || (value === true) ||
      (value === '1') || (value === 1)) {
    return true;
  } else {
    return false;
  }
}

/**
 * Get value of a system property as integer
 *
 * @param {string} prop Name of the property to fetch
 * @param {number} [defaultValue=0] Default value to use if property is not available
 * @return {number} Value of the property
 * @memberof silk-sysutils
 */
export function getintprop(prop: string, defaultValue: number = 0): number {
  let value = parseInt(String(getprop(prop, defaultValue)), 10);
  if (isNaN(value)) {
    throw new Error(`Expected ${prop} to be an integer`);
  }
  return value;
}

/**
 * Get value of a system property as string array
 *
 * @param {string} prop Name of the property to fetch
 * @param {Array<string>} [defaultValue=[]] Default value to use if property is not available
 * @return {Array<string>} Value of the property
 * @memberof silk-sysutils
 */
export function getlistprop(
  prop: string,
  defaultValue: Array<string> = []): Array<string> {
  let value = getprop(prop, '');
  return (value === '') ? defaultValue : String(value).split(',');
}

/**
 * Set value of a system property as boolean
 *
 * @param {string} prop Name of the property to set
 * @param {string | boolean | number} value Property value
 * @memberof silk-sysutils
 */
export function setprop(prop: string, value: PropTypes): void {
  props.set(prop, value.toString());
}
/**
 * This class provides helper utility to watch an android property and notify
 * via an event if the specified property has changed
 * @module PropWatcher
 * @memberof silk-sysutils
 *
 * @example
 * const util = require('silk-sysutils');
 * const log = require('silk-alog');
 *
 * util.propWatcher.on('my.system.property', () => log.info('Property changed'));
 */
class PropWatcher extends EventEmitter {
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

        /**
         * An event that is the same name as the system property would be
         * emitted when the property being watched has changed.
         *
         * @event property_name
         * @memberof silk-sysutils.PropWatcher
         * @instance
         * @type {Object}
         * @property {string} Property value
         */
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
 * Returns a promise that expires after the specified interval
 *
 * @param {number} ms Expiry interval
 * @return {Promise}
 * @memberof silk-sysutils
 */
export function timeout(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wrapper around process.uptime that returns the time in total milliseconds
 * instead of seconds.
 *
 * @param {?number} start start time in milliseconds
 * @return {number} current uptime in milliseconds if the start time wasn't
 *                  specified or a diff of start time and the current uptime
 *                  if the start time was specified
 * @memberof silk-sysutils
 * @example
 * const util = require('silk-sysutils');
 *
 * const start = util.uptime();
 * const diff = util.uptime(start);
 */
export function uptime(start?: number): number {
  let end = process.hrtime();
  let endMs = (end[0] * 1000) + (end[1] / 1000000);

  let diffMs = endMs - (start ? start : 0);
  return diffMs;
}

/**
 * Return a random number between the provided range
 *
 * @param {number} min Minimum number
 * @param {number} max Maximum number
 * @return {number} random number
 * @memberof silk-sysutils
 */
export function randBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
