/**
 * @private
 * @flow
 */

import EventEmitter from 'events';

/**
 * Silk factory reset module
 *
 * @module silk-factory-reset
 * @example
 * const factoryReset = require('silk-factory-reset').default;
 * factoryReset.start();
 */
class FactoryReset extends EventEmitter {
  /**
   * Initiate a factory reset
   *
   * @memberof silk-factory-reset
   * @instance
   */
  start() {
    this.emit('factory-reset');
  }
}

let factoryReset = new FactoryReset();
export default factoryReset;
