/**
 * silk-alog module interface
 *
 * @private
 * @flow
 */

type SilkALogFunc = (tagOrMessage: string, maybeMessage: ?string) => void;

declare module "silk-alog" {
  declare var debug: SilkALogFunc;
  declare var verbose: SilkALogFunc;
  declare var info: SilkALogFunc;
  declare var warn: SilkALogFunc;
  declare var error: SilkALogFunc;
  declare var fatal: SilkALogFunc;
}

/**
 * Silk logging helper
 *
 * @module silk-alog
 * @example
 * import log from 'silk-alog';
 *
 * log.fatal('sos');
 * log.error('ono');
 * log.warn('tsktsk');
 * log.info('hi');
 * log.verbose('useless');
 * log.debug('assert(1 + 1 == 3)');
 *
 * log.info('tag', 'The default tag is "node"');
 */

/**
 * Print debug log message
 *
 * @name debug
 * @memberof silk-alog
 * @param {string} [tag='node'] Source of the log message
 * @param {string} message The message to log
 */

/**
 * Print verbose log message
 *
 * @name verbose
 * @memberof silk-alog
 * @param {string} [tag='node'] Source of the log message
 * @param {string} message The message to log
 */

/**
 * Print info log message
 *
 * @name info
 * @memberof silk-alog
 * @param {string} [tag='node'] Source of the log message
 * @param {string} message The message to log
 */

/**
 * Print warn log message
 *
 * @name warn
 * @memberof silk-alog
 * @param {string} [tag='node'] Source of the log message
 * @param {string} message The message to log
 */

/**
 * Print error log message
 *
 * @name error
 * @memberof silk-alog
 * @param {string} [tag='node'] Source of the log message
 * @param {string} message The message to log
 */

/**
 * Print fatal log message
 *
 * @name fatal
 * @memberof silk-alog
 * @param {string} [tag='node'] Source of the log message
 * @param {string} message The message to log
 */
