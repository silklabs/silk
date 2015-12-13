/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import * as sysutils from './sysutils';
import createLog from './log';

type Mode = 'day' | 'night' | 'manual';

const log = createLog('infrared');

const MODE = {
  DAY: 'day',
  NIGHT: 'night',
  MANUAL: 'manual',
};

class Infrared {
  static MODE = MODE;
  MODE: {[key: string]: Mode} = MODE;
  _mode: Mode = MODE.MANUAL;
  _filter: '0' | '1' = '0';
  _led: '0' | '1' = '0';

  init() {
    this.setMode(Infrared.MODE.DAY);
    log.info(`Infrared initialized`);
  }

  _execIr(args: Array<string>) {
    return sysutils.exec('ir', args)
    .catch(err => {
      let msg = `Failed to exec ir ${args}: ${err}`;
      log.error(msg);
      throw new Error(msg);
    });
  }

  _setFilterValue(enable: boolean) {
    this._filter = enable ? '1' : '0';
  }

  _setLedValue(enable: boolean) {
    this._led = enable ? '1' : '0';
  }

  _setFilter(enable: boolean) {
    this._setFilterValue(enable);
    return this._execIr(['filter', this._filter]);
  }

  _setLed(enable: boolean) {
    this._setLedValue(enable);
    return this._execIr(['led', this._led]);
  }

  _setFilterAndLed(filterEnable: boolean, ledEnable: boolean) {
    this._setFilterValue(filterEnable);
    this._setLedValue(ledEnable);
    return this._execIr(['filter', this._filter, 'led', this._led]);
  }

  setMode(mode: Mode) {
    log.info(`setting mode ${mode}`);
    let filter = false;
    let led = false;
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

  setFilter(enable: boolean) {
    this._mode = Infrared.MODE.MANUAL;
    return this._setFilter(enable);
  }

  setLed(enable: boolean) {
    this._mode = Infrared.MODE.MANUAL;
    return this._setLed(enable);
  }
}

module.exports = new Infrared();
