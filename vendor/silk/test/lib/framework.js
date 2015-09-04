/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

let log = require('log')('TestFramework');
let opencv = require('opencv');
let path = require('path');

let PREVIEW_WIDTH = 320;
let PREVIEW_HEIGHT = 180;

class FakeCamera {
  constructor() {
    log.verbose(`starting fake camera`);
    this._imgPath = path.resolve(__dirname, 'files');
    this._imgSrc = 'car1.jpg';
  }

  get previewSize() {
    return { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT };
  }

  setPreviewFrame(imgSrc) {
    this._imgSrc = imgSrc;
  }

  getPreviewFrame(userCb, channel = 0) {
    let imgFullPath = path.join(this._imgPath, this._imgSrc);
    log.info(`getPreviewFrame ${imgFullPath} ${channel}`);
    opencv.readImage(imgFullPath, (err, im) => {
      if ((im.width() <= 0 ) || (im.height() <= 0 )) {
        userCb(true, null);
        return;
      }
      im.resize(PREVIEW_WIDTH, PREVIEW_HEIGHT);
      userCb(err, im);
    });
  }
}

class TestFramework {
  constructor() {
    log.verbose('TestFramework constructor');
    this.log = log;
    this.battery = require('battery');
    this.timeline = require('timeline')('test_id');
    this.camera = new FakeCamera();
    this.opencv = opencv;
    require('detectobject')({log: require('log')('detectobject'), timeline: this.timeline, camera: this.camera});
  }
}

var testFramework = new TestFramework();
module.exports = testFramework;
