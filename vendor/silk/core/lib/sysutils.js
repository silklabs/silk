/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import { execFile as childProcessExecFile } from 'child_process';
import createLog from './log';

const log = createLog('sysutils');

// TODO: Ideally silk-properties would work on the host via shim.
let props;
if (process.env.SILK_TEST === 'unit') {
  props = { get: () => '' };
} else {
  props = require('silk-properties'); //eslint-disable-line
}

const SOUND_DIR = '/system/silk/media/sound/';

// Throws an exception to the top level process exception handler, escaping any
// Promises that might otherwise consume the exception.
export function processthrow(e) {
  process.emit('uncaughtException', e);
}

export function exec(cmd, args) {
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

export function execRetry(cmd, args, retries, delayMs) {
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

export function getprop(prop, defaultValue) {
  let value = props.get(prop);
  if (value === '') {
    return defaultValue;
  }
  return value;
}

export function getboolprop(prop, defaultValue = false) {
  let value = getprop(prop, defaultValue);
  if ((value === 'true') || (value === true) ||
      (value === '1') || (value === 1)) {
    return true;
  } else {
    return false;
  }
}

export function getintprop(prop, defaultValue = 0) {
  let value = parseInt(getprop(prop, defaultValue), 10);
  if (isNaN(value)) {
    throw new Error(`Expected ${prop} to be an integer`);
  }
  return value;
}

export function getlistprop(prop, defaultValue = []) {
  let value = getprop(prop, '');
  return (value === '') ? defaultValue : value.split(',');
}

export function watchprop(prop, onPropChanged) {
  let spawn = require('child_process').spawn;
  let spawnWatchprops = () => {
    let cmd = spawn('watchprops', []);
    cmd.stderr.on('data', data => {
      let match = data.toString().match(/^\d+ ([^ ]+) /);
      if (match && match[1] && match[1] === prop) {
        onPropChanged();
      }
    });
    cmd.on('close', (code, signal) => {
      if (signal !== 'SIGTERM') { // Not explicitly killed
        spawnWatchprops();
      }
    }); // respawn if dies for some reason
    return cmd;
  };
  return spawnWatchprops();
}

export function setprop(prop, value) {
  let spawnSync = require('child_process').spawnSync;
  let result = spawnSync('setprop', [prop, value]);
  return result.error;
}

export function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// TODO: find a nodeunit home for me
if (require.main === module) {
  log.info('Starting in 1 second ...');
  timeout(1000).then(() => {
    log.info('Running `ls` ...');
    return exec('ls');
  }).then(result => {
    log.info('  output:\n' + result.stdout);
    log.info('Failing `grep foo bar 5 times ...');
    return execRetry('grep', ['foo', 'bar'], 5, 100);
  }).then(
    () => log.warn('(should not have succeeded'),
    result => log.info('... done failing with code ' + result.code));
}

export function escape(str) {
  return JSON.stringify(str);
}

export function playSound(fileName) {
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
