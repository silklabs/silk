/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

// Expected use:
//
//   var log = require('./log')('coolfeature');
//
//   log.info('foo');  // outputs to stdout
//   log.warn('bar');  // outputs to stdout
//   log.error('baz'); // outputs to stderr
//
// To enable output you set the DEBUG environment variable to something like:
//
//   DEBUG=silk-coolfeature:error
//   DEBUG=silk-coolfeature:*,-silk-coolfeature:info
//   DEBUG=silk-coolfeature:*
//   DEBUG=silk-*
//
export default function createLog(libraryName) {
  const debug = require('debug');

  libraryName = 'silk-' + libraryName;

  let infoFunction = debug(libraryName + ':info');

  // Redirect infoFunction to stdout only if we're not supposed to be piping
  // everything to a custom FD.
  if (!('DEBUG_FD' in process.env.DEBUG_FD)) {
    infoFunction.log = console.log.bind(console);
  }

  let warnFunction = debug(libraryName + ':warn');
  let errorFunction = debug(libraryName + ':error');

  return {
    info: infoFunction,
    warn: warnFunction,
    error: errorFunction
  };
}
