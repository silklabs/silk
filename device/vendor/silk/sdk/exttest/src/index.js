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
  _previewFrame = null;
  opencv = null;

  constructor(opencv) {
    this.opencv = opencv;
  }

  previewSize() {
    return { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT };
  }

  setPreviewFrame(filename) {
    this._loadPreviewFrame(filename);
  }

  async _loadPreviewFrame(filename) {
    await new Promise(resolve => {
      this.opencv.readImage(filename, (err, im) => {
        invariant(err === null, err);
        invariant(im.width() > 0 && im.height() > 0);
        this._previewFrame = im;
        resolve();
      });
    });
  }

  getFrame(when, formats) {
    // TODO: `when` is ignored...

    let frames = formats.map(format => {
      invariant(this._previewFrame !== null);
      let im = this._previewFrame.copy();
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
      case 'fullgray':
        im.convertGrayscale();
        break;
      case 'fullrgb':
        break;
      default:
        invariant(false);
      }
      return im;
    });
    return Promise.resolve(frames);
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
