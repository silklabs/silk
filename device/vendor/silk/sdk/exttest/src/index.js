/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import createLog from 'silk-log';
import createOutbox from 'silk-core/lib/outbox';
import NetworkStatus from 'silk-core/lib/network_status';
import Timeline from 'silk-core/lib/timeline';
import Server from 'silk-core/lib/server';
import * as util from 'silk-core/lib/sysutils';
import wifi from 'silk-core/lib/wifi';
import invariant from 'assert';

const PREVIEW_WIDTH = 320;
const PREVIEW_HEIGHT = 180;

const log = createLog('TestFramework');

/**
 *
 */
class FakeCamera {
  _imgSrc = null;
  opencv = null;

  constructor(opencv) {
    this.opencv = opencv;
  }

  get previewSize() {
    return { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT };
  }

  setPreviewFrame(imgSrc) {
    this._imgSrc = imgSrc;
  }

  getPreviewFrame(when, format, userCb) {
    // TODO: `when` is ignored...
    log.info(`getPreviewFrame ${this._imgSrc} ${format}`);
    this.opencv.readImage(this._imgSrc, (err, im) => {
      if ((im.width() <= 0 ) || (im.height() <= 0 )) {
        userCb(true, null);
        return;
      }
      switch (format) {
      case 'rgb':
        im.resize(PREVIEW_WIDTH, PREVIEW_HEIGHT);
        break;
      case 'gray':
        im.resize(PREVIEW_WIDTH, PREVIEW_HEIGHT);
        im.convertGrayscale();
        break;
      case 'grayeq':
        im.resize(PREVIEW_WIDTH, PREVIEW_HEIGHT);
        im.convertGrayscale();
        im.equalizeHist();
        break;
      case 'full':
        break;
      default:
        invariant(false);
      }

      userCb(err, im);
    });
  }
}

/**
 * Dummy environment class
 */
export default class Framework {
  constructor(name, opencv) {
    this._name = name;
    this.networkStatus = new NetworkStatus(wifi);
    this.server = new Server(wifi);
    this.outbox = createOutbox(this.networkStatus);
    this.timeline = new Timeline(this.server, this.outbox);
    this.camera = new FakeCamera(opencv);
    this.util = util;
  }

  get log() {
    if (!this._log) {
      this._log = createLog(this._name);
    }
    return this._log;
  }
}
