/**
 * silk-properties
 * @private
 * @flow
 */

declare module "silk-properties" {
  declare function get(name: string): string;
}

/**
 * Silk system properties helper
 *
 * @module silk-properties
 * @example
 * import props from 'silk-properties';
 *
 * let value = props.get('persist.silk.main');
 * log.info('Value: ' + value);
 */

/**
 * Get system property
 *
 * @name get
 * @instance
 * @memberof silk-properties
 * @param {string} key The name of the system property to fetch
 * @return {string} Returns the value of a system property or null if no such property exists
 */
