/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

let events = require('events');
let fs = require('mz/fs');
let log = require('./log')('battery');
let util = require('./util');

// Hold off boot when the battery is below this level
const BATTERY_OK_TO_BOOT_LEVEL = 10;

// Suggest a shutdown when the battery is below this level
const BATTERY_OUT_OF_POWER_LEVEL = 5;

class Battery extends events.EventEmitter
{
  constructor() {
    super();
  }

  _readCapacity() {
    return fs.readFile('/sys/class/power_supply/battery/capacity')
    .then(data => data.toString());
  }

  _peroidicBatteryCapacityCheck(resolveInitPromise) {
    this._readCapacity()
    .then(capacity => {
      log.info(`Battery capacity: ${capacity}%`);
      if (resolveInitPromise) {
        if (capacity >= BATTERY_OK_TO_BOOT_LEVEL) {
          resolveInitPromise();
          resolveInitPromise = null;
        } else {
          log.warn('Battery capacity too low to boot');
          this.emit('needs-to-charge');
        }
      } else {
        if (capacity < BATTERY_OUT_OF_POWER_LEVEL) {
          log.warn('Battery capacity too low to continue normal operations');
          this.emit('out-of-power');
        }
      }
      util.timeout(60 * 1000)
      .then(() => this._peroidicBatteryCapacityCheck(resolveInitPromise));
    })
    .catch(util.processthrow);
  }

  init() {
    return new Promise(resolve => {
      fs.readFile('/sys/class/power_supply/battery/present')
      .then(data => {
        let present = data.toString();
        if (!present) {
          return resolve();
        }
        this._peroidicBatteryCapacityCheck(resolve);
      })
      .catch(err => {
        if (err.code === 'ENOENT') {
          return resolve();
        }
        util.processthrow(err);
      });
    });
  }
}

module.exports = new Battery();
