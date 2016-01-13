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
const util = require('util');

const isAndroid = os.platform() === 'android';

const alog = isAndroid ? require('silk-alog') : undefined;

debug.formatArgs = function() {
  const args = Array.prototype.slice.call(arguments);
  const diff = debug.humanize(this.diff);

  if (this.useColors) {
    args[0] = `\u001b[3${this.color}m(+${diff}) ${args[0]}`;

    const colorSuffix = `\u001b[0m`;
    const lastArgIndex = args.length - 1;
    if (typeof args[lastArgIndex] === `string`) {
      args[lastArgIndex] = `${args[lastArgIndex]}${colorSuffix}`;
    } else {
      args.push(colorSuffix);
    }
  } else {
    args[0] = `(+${diff}) ${args[0]}`;
  }

  return args;
};

// Expected use:
//
//   import createLog from './log';
//   const log = createLog('coolfeature');
module.exports = function createLog(libraryName) {
  libraryName = `silk-${libraryName}`;

  function makeLogFunction(consoleFuncName, alogFuncName) {
    alogFuncName = alogFuncName || consoleFuncName;

    const prefix = `${libraryName}:${alogFuncName}`;
    const consoleFunc = console[consoleFuncName]; // eslint-disable-line

    let func;
    if (isAndroid) {
      const alogFunc = alog[alogFuncName];

      func = debug(prefix);
      func.log = function() {
        const args = Array.prototype.slice.call(arguments);

        if (!process.env.LOGWRAPPER) {
          consoleFunc.apply(consoleFunc, [`${prefix}:`].concat(args));
        }

        // Mimic console.* functions by treating additional arguments as
        // printf-style arguments.
        alogFunc(libraryName, util.format.apply(this, args));
      };
    } else {
      func = function() {
        const args = Array.prototype.slice.call(arguments);
        consoleFunc.apply(consoleFunc, [`${prefix}:`].concat(args));
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
