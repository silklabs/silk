/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

let log = require('log')('TestFramework');
let opencv = require('opencv');
let path = require('path');

let PREVIEW_WIDTH = 320;
let PREVIEW_HEIGHT = 180;

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
    this.battery = require('battery');
    this.timeline = require('timeline')('test_id');
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
