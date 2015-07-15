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
  const debug = require('debug');

  libraryName = 'silk-' + libraryName;

  let debugFunction = debug(libraryName + ':debug');
  let infoFunction = debug(libraryName + ':info');

  // Redirect to stdout only if we're not supposed to be piping everything to a
  // custom FD.
  if (!('DEBUG_FD' in process.env)) {
    let stdoutFunction = console.log.bind(console);

    debugFunction.log = stdoutFunction;
    infoFunction.log = stdoutFunction;
  }

  let warnFunction = debug(libraryName + ':warn');
  let errorFunction = debug(libraryName + ':error');

  return {
    debug: debugFunction,
    info: infoFunction,
    warn: warnFunction,
    error: errorFunction
  };
}
