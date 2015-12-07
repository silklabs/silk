/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';


// Expected use:
//
//   let log = require('./log')('coolfeature');
//
//   log.verbose('useless');
//   log.debug('assert(1+1=3)');
//   log.info('hi');
//   log.warn('tsktsk');
//   log.error('ono');
//   log.fatal('sos');
//
// To enable output set the 'persist.silk.debug' property:
//
//   $ export DEBUG=silk-coolfeature:error
//   $ export DEBUG=silk-coolfeature:*,-silk-coolfeature:info
//   $ export DEBUG=silk-coolfeature:*
//   $ export DEBUG=silk-*
//
// By default all info(), warn(), and error() output is enabled. All debug()
// output is disabled.
module.exports = function createLog(libraryName) {
  function makeLogFunction(level) {
    var name = 'silk-' + libraryName + ':' + level;
    return require('debug')(name);
  }

  return {
    verbose: makeLogFunction('verbose'),
    debug: makeLogFunction('debug'),
    info: makeLogFunction('info'),
    warn: makeLogFunction('warn'),
    error: makeLogFunction('error'),
    fatal: makeLogFunction('fatal')
  };
}
