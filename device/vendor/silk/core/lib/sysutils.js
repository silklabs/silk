/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import { execFile as childProcessExecFile } from 'child_process';
import createLog from './log';
import events from 'events';

const log = createLog('sysutils');

// Hack for flow...
let _require = require;

// TODO: Ideally silk-properties would work on the host via shim.
let props;
if (process.env.SILK_TEST === 'unit') {
  props = { get: () => '' };
} else {
  props = _require('silk-properties'); //eslint-disable-line
}

const SOUND_DIR = '/system/silk/media/sound/';

// Throws an exception to the top level process exception handler, escaping any
// Promises that might otherwise consume the exception.
export function processthrow(e: string) {
  process.emit('uncaughtException', e);
}

type ExecOutput = {
  code: number;
  stdout: string;
  stderr: string;
};

export function exec(cmd: string, args: [string]): Promise<ExecOutput> {
  return new Promise((resolve, reject) => {
    childProcessExecFile(cmd, args, (err, stdout, stderr) => {
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

export function execRetry(
  cmd: string,
  args: [string],
  retries: number,
  delayMs: number
): Promise<ExecOutput> {
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

type ScalarPropTypes = string | bool | number;
type PropTypes = Array<PropTypes> | ScalarPropTypes;

export function getprop(prop: string, defaultValue?: PropTypes): PropTypes {
  let value = props.get(prop);
  if (value === '') {
    return (defaultValue === null || defaultValue === undefined) ?
      '' :
      defaultValue;
  }
  return value;
}

export function getstrprop(prop: string, defaultValue?: string): string {
  return String(getprop(prop, defaultValue));
}

export function getboolprop(prop: string, defaultValue: bool = false): bool {
  let value = getprop(prop, defaultValue);
  if ((value === 'true') || (value === true) ||
      (value === '1') || (value === 1)) {
    return true;
  } else {
    return false;
  }
}

export function getintprop(prop: string, defaultValue: number = 0): number {
  let value = parseInt(String(getprop(prop, defaultValue)), 10);
  if (isNaN(value)) {
    throw new Error(`Expected ${prop} to be an integer`);
  }
  return value;
}

export function getlistprop(prop: string, defaultValue: Array<string> = []): Array<string> {
  let value = getprop(prop, '');
  return (value === '') ? defaultValue : String(value).split(',');
}

export function setprop(prop: string, value: PropTypes): ?string {
  let spawnSync = require('child_process').spawnSync;
  let result = spawnSync('setprop', [prop, value]);
  return result.error;
}

class PropWatcher extends events.EventEmitter {
  constructor() {
    super();
    let spawn = require('child_process').spawn;
    let spawnWatchprops = () => {
      let cmd = spawn('watchprops', []);
      cmd.stderr.on('data', data => {
        let match = data.toString().match(/^\d+ ([^ ]+) /);
        if (match && match[1]) {
          this.emit(match[1]);
        }
      });

      // respawn if dies for some reason
      cmd.on('close', () => spawnWatchprops());
    };

    // Spawn process only if there is someone watching
    this.once('newListener', () => spawnWatchprops());
  }
}

export let propWatcher = new PropWatcher();

export function timeout(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function playSound(fileName: string): Promise<void> {
  const BINARY = 'player';

  return exec(BINARY, [SOUND_DIR + fileName])
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

export function randBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
