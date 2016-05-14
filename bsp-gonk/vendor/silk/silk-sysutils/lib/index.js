/**
 * @private
 * @flow
 */

/**
 * This module provides system utility functions
 * @module silk-sysutils
 *
 * @example
 * import * as util from 'silk-sysutils';
 *
 * util.getprop('ro.product.name', 'unknown');
 * util.playSound('/data/hello.mp3');
 */

import { execFile, spawnSync } from 'child_process';
import fs from 'fs';

import createLog from 'silk-log/device';

const log = createLog('silk-utils');
const SILK_PROPS = 'system/silk/silk-props.json';

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
    }
  };
}

// Read silk.prop file
let silkProps = {};
try {
  let silkPropsJson = fs.readFileSync(SILK_PROPS, {encoding: 'utf8'});
  silkProps = JSON.parse(silkPropsJson);
  log.debug(`silkProps: ${JSON.stringify(silkProps)}`);
} catch (err) {
  log.error('Invalid ${SILK_PROPS} file');
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
 * @private
 */
type ExecOutput = {
  code: number;
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
      let code = err ? err.code : 0;
      // 127 is failed exec, which is always wrong.  Otherwise we
      // leave it up to the user.
      if (code === 127) {
        return reject(err);
      }
      return resolve({ code: code, stdout: stdout, stderr: stderr });
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
type ScalarPropTypes = string | bool | number;

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
    // Check silk.prop to see if the property is available
    if (prop in silkProps) {
      return silkProps[prop];
    }
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
export function getboolprop(prop: string, defaultValue: bool = false): bool {
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
 * @return {Error} [] Result
 * @memberof silk-sysutils
 */
export function setprop(prop: string, value: PropTypes): ?Error {
  const result = spawnSync('setprop', [prop, value.toString()]);
  return result.error;
}

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
 * Play a sound file
 *
 * @param {string} fileName Name of the audio file to play
 * @return {Promise} Return a promise that is fulfilled when the sound
 *                         is done playing. Reject the promise if there is an
 *                         error.
 * @memberof silk-sysutils
 */
export function playSound(fileName: string): Promise<void> {
  const BINARY = 'player';

  return exec(BINARY, [fileName])
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
