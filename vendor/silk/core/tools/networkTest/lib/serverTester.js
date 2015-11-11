/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import DeviceSimulator from './deviceSimulator';
import createLog from './log';
import * as util from './sysutils';
import {LatencyStats, Repeater} from './testutils';

const log = createLog('deviceTester');

export default class ServerTester {
  constructor() {
    this._device = new DeviceSimulator();
    this._inited = false;
  }

  _init() {
    if (this._inited) {
      return Promise.resolve();
    } else {
      return this._device.init()
      .then(() => this._inited = true)
      .catch(util.processthrow);
    }
  }

  _startTest(repeater) {
    let stats;
    return this._init()
    .then(() => this._device.connect())
    .then(() => this._device.emitInfo(1, 0)) // server expects info first
    .then(() => repeater.start())
    .then(results => stats = results)
    .then(() => this._device.disconnect())
    .then(() => stats)
    .catch(util.processthrow);
  }

  _doConnectTest(cnt, hz, cfg) {
    let repeater = new Repeater('connect', cnt, hz, cfg,
        () => this._device.connect(cfg),
        () => this._device.disconnect(cfg));

    return this._init()
    .then(() => repeater.start())
    .catch(util.processthrow);
  }

  doTest(test, cnt, hz, cfg = {}) {
    let tests = {
      'info': () => this._device.emitInfo(cfg),
      'preview': () => this._device.emitJpeg(cfg),
      'video': () => this._device.emitMp4(cfg),
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

