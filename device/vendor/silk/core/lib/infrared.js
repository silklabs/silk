/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import * as sysutils from './sysutils';
import createLog from './log';

const log = createLog('infrared');

class Infrared {
  static MODE = {
    DAY: 'day',
    NIGHT: 'night',
    MANUAL: 'manual',
  };

  constructor() {
    this.MODE = Infrared.MODE;
    this._mode = Infrared.MODE.MANUAL;
    this._filter = false;
    this._led = false;
  }

  init() {
    this.setMode(Infrared.MODE.DAY);
    log.info(`Infrared initialized`);
  }

  _execIr(args) {
    return sysutils.exec('ir', args)
    .catch(err => {
      let msg = `Failed to exec ir ${args}: ${err}`;
      log.error(msg);
      throw new Error(msg);
    });
  }

  _setFilterValue(enable) {
    this._filter = enable ? 1 : 0;
  }

  _setLedValue(enable) {
    this._led = enable ? 1 : 0;
  }

  _setFilter(enable) {
    this._setFilterValue(enable);
    return this._execIr(['filter', this._filter]);
  }

  _setLed(enable) {
    this._setLedValue(enable);
    return this._execIr(['led', this._led]);
  }

  _setFilterAndLed(filterEnable, ledEnable) {
    this._setFilterValue(filterEnable);
    this._setLedValue(ledEnable);
    return this._execIr(['filter', this._filter, 'led', this._led]);
  }

  setMode(mode) {
    log.info(`setting mode ${mode}`);
    let filter, led;
    switch (mode) {
    case Infrared.MODE.DAY:
      filter = true;
      led = false;
      break;
    case Infrared.MODE.NIGHT:
      filter = false;
      led = true;
      break;
    default:
      log.warn(`bad mode ${mode}`);
      return;
    }

    this._setFilterAndLed(filter, led).then(() => this._mode = mode);
  }

  setFilter(enable) {
    this._mode = Infrared.MODE.MANUAL;
    return this._setFilter(enable);
  }

  setLed(enable) {
    this._mode = Infrared.MODE.MANUAL;
    return this._setLed(enable);
  }
}

module.exports = new Infrared();

