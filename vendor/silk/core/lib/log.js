/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

// Expected use:
//
//   var log = require('./log')('coolfeature');
//
//   log.debug('useless');  // outputs to stdout
//   log.info('foo');       // outputs to stdout
//   log.warn('bar');       // outputs to stdout
//   log.error('baz');      // outputs to stderr
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
  const alog = require('alog');
  const debug = require('debug');
  const util = require('util');

  libraryName = 'silk-' + libraryName;

  // This matches |libraryName| to remove it from the output in logcat. It also
  // matches the ANSI color codes that the |debug| module may insert
  // (e.g. '\u001b[31m').
  let libraryNameRegExp =
    new RegExp('^(\\s*(\\u001b\\[3\\d;1m)?)' +
               libraryName +
               ':\\w+\\s+(\\u001b\\[0m)?');

  function makeLogFunction(consoleFuncName, alogFuncName = consoleFuncName) {
    let func = debug(`${libraryName}:${alogFuncName}`);
    func.log = function() {
      let args = arguments;
      let consoleFunc = console[consoleFuncName];
      let alogFunc = alog[alogFuncName];

      consoleFunc.apply(consoleFunc, args);

      // Mimic console.* functions by treating additional arguments as
      // printf-style arguments.
      let msg = util.format.apply(this, args);
      alogFunc(libraryName, msg.replace(libraryNameRegExp, '$1'));
    };
    return func;
  }

  return {
    debug: makeLogFunction('log', 'debug'),
    info: makeLogFunction('info'),
    warn: makeLogFunction('warn'),
    error: makeLogFunction('error')
  };
}
