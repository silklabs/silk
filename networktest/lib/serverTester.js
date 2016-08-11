/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import DeviceSimulator from './deviceSimulator';
import createLog from 'silk-log';
import * as util from 'silk-sysutils';
import {LatencyStats, Repeater} from './testutils';

const log = createLog('deviceTester');

export default class ServerTester {
  constructor(accessToken) {
    this._device = new DeviceSimulator(accessToken);
  }

  _startTest(repeater) {
    let stats;
    return this._device.connect()
    .then(() => repeater.start())
    .then((results) => {
      stats = results;
    })
    .then(() => this._device.disconnect())
    .then(() => stats)
    .catch(util.processthrow);
  }

  _doConnectTest(cnt, hz, cfg) {
    let repeater = new Repeater('connect', cnt, hz, cfg,
        () => this._device.connect(cfg),
        () => this._device.disconnect(cfg));

    return repeater.start()
    .catch(util.processthrow);
  }

  doTest(test, cnt, hz, cfg = {}) {
    let tests = {
      'uploadVideo': () => this._device.uploadVideo(cfg),
      'uploadBlob': () => this._device.uploadBlob(cfg),
      'uploadMetadata': () => this._device.uploadMetadata(cfg),
    };

    if (test in tests) {
      let repeater = new Repeater(test, cnt, hz, cfg, tests[test]);
      return this._startTest(repeater);
    } else if (test === 'connect') {
      return this._doConnectTest(cnt, hz, cfg);
    } else {
      log.warn(`${test} is invalid`);
      return new LatencyStats();
    }
  }
}
