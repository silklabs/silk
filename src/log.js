/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

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
import debug from 'debug';

debug.enable('silk-*,-silk-*:debug'); // TODO: Make more configurable

export default function createLog(libraryName) {

  function makeLogFunction(level) {
    return debug(`silk-${libraryName}:${level}`);
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
