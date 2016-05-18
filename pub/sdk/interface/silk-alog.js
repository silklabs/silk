/**
 * silk-alog module interface
 *
 * @private
 * @flow
 */

type SilkALogFunc = (tagOrMessage: string, maybeMessage: ?string) => void;

declare module "silk-alog" {
  declare var verbose: SilkALogFunc;
  declare var debug: SilkALogFunc;
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
 * log.verbose('tag', 'hello there');
 * log.debug('default log tag is node');
 * log.info('hi');
 * log.warn('tsktsk');
 * log.error('ono');
 * log.fatal('sos');
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
 * Print debug log message
 *
 * @name debug
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
