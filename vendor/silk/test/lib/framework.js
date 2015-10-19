/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import createLog from 'log';
import opencv from 'opencv';
import path from 'path';
import NetworkStatus from 'network_status';
import Timeline from 'timeline';
import createOutbox from 'outbox';

const PREVIEW_WIDTH = 320;
const PREVIEW_HEIGHT = 180;

const log = createLog('TestFramework');

/**
 *
 */
class FakeCamera {
  constructor() {
    this._imgPath = path.resolve(__dirname, 'files');
    this._imgSrc = 'car1.jpg';
  }

  get previewSize() {
    return { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT };
  }

  setPreviewFrame(imgSrc) {
    this._imgSrc = imgSrc;
  }

  getPreviewFrame(userCb, when, channel = 0) {
    let imgFullPath = path.join(this._imgPath, this._imgSrc);
    log.info(`getPreviewFrame ${imgFullPath} ${channel}`);
    opencv.readImage(imgFullPath, (err, im) => {
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
 *
 */
class Env {
  constructor(name, framework) {
    this._name = name;
    this.timeline = framework.timeline;
    this.camera = framework.camera;
    this.util = framework.util;
    this.log = require('log')(name);
  }
}

/**
 *
 */
class TestFramework {
  constructor(name) {
    this.rootDir = __dirname;
    this._name = name;
    this.wifi = require('wifi');
    this.networkStatus = new NetworkStatus(this.wifi);
    this.outbox = createOutbox(this.networkStatus);
    this.battery = require('battery');
    this.timeline = new Timeline('test_id', this.outbox);
    this.camera = new FakeCamera();
    this.opencv = opencv;
    this.util = require('sysutils');

    require('detectobject')(new Env('detectobject', this));
    require('trackobject')(new Env('trackobject', this));
  }

  get log() {
    if (!this._log) {
      this._log = require('log')(this._name);
    }
    return this._log;
  }
}

module.exports = (name) => new TestFramework(name);
