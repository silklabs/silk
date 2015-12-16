/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import createLog from 'log';
import createOutbox from '../../../../../core/lib/outbox';
import NetworkStatus from '../../../../../core/lib/network_status';
import opencv from 'opencv';
import Timeline from '../../../../../core/lib/timeline';
import * as util from '../../../../../core/lib/sysutils';
import wifi from '../../../../../core/lib/wifi';

const PREVIEW_WIDTH = 320;
const PREVIEW_HEIGHT = 180;

const log = createLog('TestFramework');

/**
 *
 */
class FakeCamera {
  constructor() {
    this._imgSrc = null;
  }

  get previewSize() {
    return { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT };
  }

  setPreviewFrame(imgSrc) {
    this._imgSrc = imgSrc;
  }

  getPreviewFrame(userCb, when, channel = 0) {
    log.info(`getPreviewFrame ${this._imgSrc} ${channel}`);
    opencv.readImage(this._imgSrc, (err, im) => {
      if ((im.width() <= 0 ) || (im.height() <= 0 )) {
        userCb(true, null);
        return;
      }
      if (1 === channel) {
        im.convertGrayscale();
        im.equalizeHist();
      }
      im.resize(PREVIEW_WIDTH, PREVIEW_HEIGHT);
      userCb(err, im);
    });
  }
}

/**
 * Dummy environment class
 */
export default class Framework {
  constructor(name) {
    this._name = name;
    this.networkStatus = new NetworkStatus(wifi);
    this.outbox = createOutbox(this.networkStatus);
    this.timeline = new Timeline('test_id', this.outbox);
    this.camera = new FakeCamera();
    this.util = util;
  }

  get log() {
    if (!this._log) {
      this._log = createLog(this._name);
    }
    return this._log;
  }
}
