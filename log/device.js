/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * This is the device version of ./index.js
 */

'use strict';

const debug = require('debug');
const os = require('os');

module.exports = function createLog(libraryName) {

  function formatArgs() {
    let args = arguments;
    const diff = debug.humanize(this.diff);

    if (this.useColors) {
      args[0] = `\u001b[3${this.color}m(+${diff}) ${args[0]}`;
      args[args.length-1] += '\u001b[0m';
    } else {
      args[0] = `(+${diff}) ` + args[0];
    }

    return args;
  }

  debug.formatArgs = formatArgs;

  libraryName = 'silk-' + libraryName;

  function makeLogFunction(consoleFuncName, alogFuncName) {
    if (!alogFuncName) {
      alogFuncName = consoleFuncName;
    }
    let func;
    const prefix = `${libraryName}:${alogFuncName}`;
    const consoleFunc = console[consoleFuncName]; // eslint-disable-line
    if (os.platform() === 'android') {
      const alog = require('silk-alog');
      const util = require('util');
      const alogFunc = alog[alogFuncName];

      func = debug(prefix);
      func.log = function() {
        let args = Array.prototype.slice.call(arguments);

        if (!process.env.LOGWRAPPER) {
          consoleFunc.apply(consoleFunc, [prefix, ':'].concat(args));
        }

        // Mimic console.* functions by treating additional arguments as
        // printf-style arguments.
        const msg = util.format.apply(this, args);
        alogFunc(libraryName, msg);
      };
    } else {
      func = function() {
        let args = Array.prototype.slice.call(arguments);
        consoleFunc.apply(consoleFunc, [prefix, ':'].concat(args));
      };
    }
    return func;
  }

  return {
    verbose: makeLogFunction('log', 'verbose'),
    debug: makeLogFunction('log', 'debug'),
    info: makeLogFunction('info'),
    warn: makeLogFunction('warn'),
    error: makeLogFunction('error'),
    fatal: makeLogFunction('error', 'fatal'),
  };
}
