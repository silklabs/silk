/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import createLog from 'silk-log/device';
import createOutbox from 'silk-core/lib/outbox';
import NetworkStatus from 'silk-core/lib/network_status';
import Timeline from 'silk-core/lib/timeline';
import Server from 'silk-core/lib/server';
import * as util from 'silk-core/lib/sysutils';
import wifi from 'silk-core/lib/wifi';
import invariant from 'assert';

const WIDTH = 1280;
const HEIGHT = 720;

const log = createLog('TestFramework');

const FRAME_SCALE_LOW = 5;
const FRAME_SCALE_DEFAULT = 4;
const FRAME_SCALE_HIGH = 2;

const FRAME_SIZE = {
  low: {
    width: Math.round(WIDTH / FRAME_SCALE_LOW),
    height: Math.round(HEIGHT / FRAME_SCALE_LOW),
  },
  normal: {
    width: Math.round(WIDTH / FRAME_SCALE_DEFAULT),
    height: Math.round(HEIGHT / FRAME_SCALE_DEFAULT),
  },
  high: {
    width: Math.round(WIDTH / FRAME_SCALE_HIGH),
    height: Math.round(HEIGHT / FRAME_SCALE_HIGH),
  },
  full: {
    width: WIDTH,
    height: HEIGHT,
  },
};

/**
 *
 */
class FakeCamera {
  _previewFrame = null;
  opencv = null;

  constructor(opencv) {
    this.opencv = opencv;
  }

  /**
   * The available camera frame sizes:
   * full - full resolution frame
   * high - higher resolution frame for image analysis
   * normal - normal frame size for image analysis
   * low - lower resolution frame for image analysis
   */
  getFrameSize(frameSize) {
    frameSize = frameSize || 'normal';
    if (typeof FRAME_SIZE[frameSize] !== 'object') {
      throw new Error(`Invalid frameSize: ${frameSize}`);
    }
    return FRAME_SIZE[frameSize];
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

  /**
   * The available camera frame formats:
   * fullgray - full resolution grayscale   (CameraFrameSize === 'full')
   * fullrgb  - full resolution rgb         (CameraFrameSize === 'full')
   * highgray - higher res grayscale        (CameraFrameSize === 'high')
   * gray     - normal grayscale            (CameraFrameSize === 'normal')
   * grayeq   - normal grayscale equalized  (CameraFrameSize === 'normal')
   * rgb      - normal rgb                  (CameraFrameSize === 'normal')
   * lowgray  - lower res grayscale         (CameraFrameSize === 'low')
   */
  getFrame(when, formats) {
    // TODO: `when` is ignored...

    let frames = formats.map(format => {
      invariant(this._previewFrame !== null);
      let im = this._previewFrame.copy();
      switch (format) {
      case 'fullgray':
        im.resize(FRAME_SIZE.full.width, FRAME_SIZE.full.height);
        im.convertGrayscale();
        break;
      case 'fullrgb':
        im.resize(FRAME_SIZE.full.width, FRAME_SIZE.full.height);
        break;
      case 'highgray':
        im.resize(FRAME_SIZE.high.width, FRAME_SIZE.high.height);
        im.convertGrayscale();
        break;
      case 'gray':
        im.resize(FRAME_SIZE.normal.width, FRAME_SIZE.normal.height);
        im.convertGrayscale();
        break;
      case 'grayeq':
        im.resize(FRAME_SIZE.normal.width, FRAME_SIZE.normal.height);
        im.convertGrayscale();
        im.equalizeHist();
        break;
      case 'rgb':
        im.resize(FRAME_SIZE.normal.width, FRAME_SIZE.normal.height);
        break;
      case 'lowgray':
        im.resize(FRAME_SIZE.low.width, FRAME_SIZE.low.height);
        im.convertGrayscale();
        break;
      default:
        invariant(false);
      }
      return im;
    });
    return Promise.resolve(frames);
  }

  /**
   * @private
   */
  static _scaleRect(rect, scale) {
    return {
      x: Math.round(rect.x * scale),
      y: Math.round(rect.y * scale),
      width: Math.round(rect.width * scale),
      height: Math.round(rect.height * scale),
    };
  }

  /**
   * Scales normalized rectangles to the specified CameraFrameSize
   *
   * @param rects Array of normalized rectangles to scale
   * @param frameSize Desired scale
   * @return Array of rectangles in the desired scale
   */
  normalRectsTo(rects, frameSize) {
    const scale = this.getFrameSize(frameSize).width / FRAME_SIZE.normal.width;
    return rects.map(rect => FakeCamera._scaleRect(rect, scale));
  }

  /**
   * Scales rectangles of the specified CameraFrameSize to the normal size
   *
   * @param rects Array of rectangles to normalize
   * @param frameSize Desired scale
   * @return Array of normalized rectangles
   */
  normalRectsFrom(rects, frameSize) {
    const scale = FRAME_SIZE.normal.width / this.getFrameSize(frameSize).width;
    return rects.map(rect => FakeCamera._scaleRect(rect, scale));
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
