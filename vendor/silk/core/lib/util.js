/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let childProcessExecFile = require('child_process').execFile;
let log = require('./log')('util');

// Throws an exception to the top level process exception handler, escaping any
// Promises that might otherwise consume the exception
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
  let spawnSync = require('child_process').spawnSync;
  let result = spawnSync('getprop', [prop]);
  if (result.error) {
    log.warn(`Error: getprop("${prop}"): ${result.error}`);
    return undefined;
  }
  let value = result.stdout.toString().replace(/\n$/, '');
  if (defaultValue) {
    return (value === '') ? defaultValue : value;
  } else {
    return value;
  }
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

export function setprop(prop, value) {
  let spawnSync = require('child_process').spawnSync;
  let result = spawnSync('setprop', [prop, value]);
  return result.error;
}

export function timeout(ms) {
  return new Promise(resolve => setTimeout(() => resolve(), ms));
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
