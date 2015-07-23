/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

// Expected use:
//
//   let log = require('./log')('coolfeature');
//
//   log.verbose('useless');
//   log.debug('assert(1+1==3)');
//   log.info('hi');
//   log.warn('tsktsk');
//   log.error('ono');
//   log.fatal('sos');
//
// To enable output set the 'persist.silk.debug' property:
//
//   $ setprop persist.silk.debug silk-coolfeature:error
//   $ setprop persist.silk.debug silk-coolfeature:*,-silk-coolfeature:info
//   $ setprop persist.silk.debug silk-coolfeature:*
//   $ setprop persist.silk.debug silk-*
//
// By default all info(), warn(), and error() output is enabled. All debug()
// output is disabled.
export default function createLog(libraryName) {
  const alog = require('silk-alog');
  const util = require('util');

  let debug = require('debug');

  function formatArgs() {
    let args = arguments;
    let name = this.namespace;
    let diff = debug.humanize(this.diff);

    if (this.useColors) {
      let color = this.color;
      args[0] = `\u001b[3${color}m${name} (+${diff}) ${args[0]}\u001b[0m `;
    } else {
      args[0] = `${name} (+${diff}) ` + args[0];
    }

    return args;
  }

  debug.formatArgs = formatArgs;

  libraryName = 'silk-' + libraryName;

  // This matches |libraryName| to remove it from the output in logcat. It also
  // matches the ANSI color codes that the |debug| module may insert
  // (e.g. '\u001b[31;1m').
  let libraryNameRegExp =
    new RegExp('^(\\u001b\\[3\\dm)?' +
               libraryName +
               ':\\w+(\\u001b\\[0m)?\\s+(.*)');

  function makeLogFunction(consoleFuncName, alogFuncName = consoleFuncName) {
    let func = debug(`${libraryName}:${alogFuncName}`);
    func.log = function() {
      let args = arguments;

      if (!process.env.LOGWRAPPER) {
        let consoleFunc = console[consoleFuncName];
        consoleFunc.apply(consoleFunc, args);
      }

      // Mimic console.* functions by treating additional arguments as
      // printf-style arguments.
      let msg = util.format.apply(this, args);
      let alogFunc = alog[alogFuncName];
      alogFunc(libraryName, msg.replace(libraryNameRegExp, '$1$3$2'));
    };
    return func;
  }

  return {
    verbose: makeLogFunction('log', 'verbose'),
    debug: makeLogFunction('log', 'debug'),
    info: makeLogFunction('info'),
    warn: makeLogFunction('warn'),
    error: makeLogFunction('error'),
    fatal: makeLogFunction('error', 'fatal')
  };
}
