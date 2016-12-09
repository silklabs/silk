/**
 * @private
 * @flow
 */

import events from 'events';
import fs from 'mz/fs';
import createLog from 'silk-log/device';
import * as util from 'silk-sysutils';

const log = createLog('battery');

// Some boards have no battery but /sys/class/power_supply/battery/present is
// still 1.  Set persist.silk.battery.present to false to override
const BATTERY_PRESENT = util.getboolprop('persist.silk.battery.present', true);

// Hold off boot when the battery is below this level
const BATTERY_OK_TO_BOOT_LEVEL = 10;

// Suggest a shutdown when the battery is below this level
const BATTERY_OUT_OF_POWER_LEVEL = 5;

/**
 * Silk battery module.
 * @module silk-battery
 * @example
 * 'use strict';
 *
 * const Battery = require('silk-battery').default;
 * const log = require('silk-alog');
 *
 * let battery = new Battery();
 * battery.init()
 * .then(() => {
 *   battery.on('out-of-power', () => {
 *     log.info('Device running out of battery; shutting down...');
 *   });
 * })
 * .catch(err => {
 *   log.error('Failed to initialize battery', err);
 * });
 */
export default class Battery extends events.EventEmitter {

  _readCapacity(): Promise<number> {
    return fs.readFile('/sys/class/power_supply/battery/capacity')
      .then((data) => Number(data.toString()));
  }

  _peroidicBatteryCapacityCheck(resolveInitPromise: ?Function) {
    this._readCapacity().then((capacity) => {
      log.info(`Battery capacity: ${capacity}%`);
      if (resolveInitPromise) {
        if (capacity >= BATTERY_OK_TO_BOOT_LEVEL) {
          resolveInitPromise();
          resolveInitPromise = null;
        } else {
          log.warn('Battery capacity too low to boot');

          /**
           * This event is emitted when battery capacity is too low to continue
           * normal operation.
           *
           * @event needs-to-charge
           * @memberof silk-battery
           * @instance
           */
          this.emit('needs-to-charge');
        }
      } else {
        if (capacity < BATTERY_OUT_OF_POWER_LEVEL) {
          log.warn('Battery capacity too low to continue normal operations');

          /**
           * This event is emitted when battery capacity is too low to boot
           *
           * @event out-of-power
           * @memberof silk-battery
           * @instance
           */
          this.emit('out-of-power');
        }
      }
      util.timeout(60 * 1000)
        .then(() => this._peroidicBatteryCapacityCheck(resolveInitPromise));
    }).catch(util.processthrow);
  }

  /**
   * Initialize battery module
   * @memberof silk-battery
   * @instance
   */
  init(): Promise<void> {
    if (!BATTERY_PRESENT) {
      log.info('Skipping battery presence test and assuming no battery');
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      fs.readFile('/sys/class/power_supply/battery/present').then((data) => {
        let present = data.toString();
        if (!present) {
          resolve();
          return;
        }
        this._peroidicBatteryCapacityCheck(resolve);
      }).catch((err) => {
        if (err.code === 'ENOENT') {
          log.info('Battery not present');
          resolve();
          return;
        }
        util.processthrow(err);
      });
    });
  }
}
