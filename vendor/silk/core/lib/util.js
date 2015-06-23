/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let childProcessExec = require('child_process').exec;

export function exec(cmd) {
  return new Promise((resolve, reject) => {
    childProcessExec(cmd, (err, stdout, stderr) => {
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

export function execRetry(cmd, retries, delayMs) {
  return exec(cmd).then(result => {
    if (0 === result.code) {
      return result;
    }
    if (retries > 0) {
      return timeout(delayMs).then(() => execRetry(cmd, retries - 1, delayMs));
    }
    return Promise.reject(result);
  });
}

export function getprop(prop) {
  let spawnSync = require('child_process').spawnSync;
  let result = spawnSync('getprop', [prop]);
  return result.stdout.toString().replace(/\n$/, '');
}

export function timeout(ms) {
  return new Promise(resolve => setTimeout(() => resolve(), ms));
}

// TODO: find a nodeunit home for me
if (require.main === module) {
  console.log('Starting in 1 second ...');
  timeout(1000).then(() => {
    console.log('Running `ls` ...');
    return exec('ls');
  }).then(result => {
    console.log('  output:\n' + result.stdout);
    console.log('Failing `grep foo bar 5 times ...');
    return execRetry('grep foo bar', 5, 100);
  }).then(
    () => console.log('(should not have succeeded'),
    result => console.log('... done failing with code ' + result.code));
}
