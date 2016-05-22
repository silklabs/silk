/**
 * Silk logging helper
 *
 * Expected use:
 *
 *   import createLog from 'silk-log';
 *   const log = createLog('coolfeature');
 *
 *   log.debug('assert(1+1=3)');
 *   log.verbose('useless');
 *   log.info('hi');
 *   log.warn('tsktsk');
 *   log.error('ono');
 *   log.fatal('sos');
 *
 * To enable output,
 * - call the `configureLog` function, importable from the 'log' module,
 * - set the `DEBUG` environment variable,
 * - or set the `persist.silk.debug` prop on device.
 *
 * Some possible uses:
 *
 *   silk-coolfeature:error
 *   silk-coolfeature:*,-silk-coolfeature:info
 *   silk-coolfeature:*
 *   silk-*
 *
 */

'use strict';

var debug = require('debug');

function createLogger(libraryName, level) {
  return debug('silk-' + libraryName + ':' + level);
}

module.exports = function createLog(libraryName) {
  return {
    debug: createLogger(libraryName, 'debug'),
    verbose: createLogger(libraryName, 'verbose'),
    info: createLogger(libraryName, 'info'),
    warn: createLogger(libraryName, 'warn'),
    error: createLogger(libraryName, 'error'),
    fatal: createLogger(libraryName, 'fatal'),
  };
}

module.exports.createLogger = createLogger;
module.exports.configureLog = debug.enable;
