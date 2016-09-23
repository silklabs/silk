/**
 * Copyright (c) 2016 Silk Labs, Inc. All Rights Reserved. Confidential and
 * Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import caffe from 'silk-caffe';
import fs from 'mz/fs';
import path from 'path';
import createLog from 'silk-log/device';
import predictionsToBoxes from './utils';
import ObjectSmoother from './smoother';
import * as config from './config';

import type { Env, Camera, Timeline } from 'silk-exttest';

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const log = createLog('silkext-yolo');
let camera: Camera;
let timeline: Timeline;

const MODEL_PROTO = path.join(__dirname, '../model', 'tiny-yolo.prototxt');
const MODEL_WEIGHTS = path.join(__dirname, '../model', 'tiny-yolo.caffemodel');

const OBJECT_TAG = 'object';

class YoloClassifier {
  _labels: Array<string>;
  _num: number;
  _netWeight: number;
  _netHeight: number;
  _onPreview: Function;
  _net: caffe.Net;
  _smoother: ObjectSmoother;

  constructor(env: Env) {
    camera = env.camera;
    timeline = env.timeline;
    const yoloLabels = config.YOLO_LABELS;
    this._net = new caffe.Net(MODEL_PROTO, 'test');
    this._net.copyTrainedLayersFrom(MODEL_WEIGHTS);
    this._labels = yoloLabels;
    this._num = 2;
    let shape = this._net.blobs[0].shape;
    log.info(`network shape ${shape.join(' ')}`);
    this._netWeight = shape[3];
    this._netHeight = shape[2];

    this._smoother = new ObjectSmoother();
    this._init();
  }

  /**
   * @private
   */
  async _init() {
    try {
      // Check if all the required files exist on device
      let exists = await fs.exists(MODEL_PROTO);
      if (!exists) {
        log.error(`${MODEL_PROTO} not available on the device`);
        return;
      }

      exists = await fs.exists(MODEL_WEIGHTS);
      if (!exists) {
        log.error(`${MODEL_WEIGHTS} not available on the device`);
        return;
      }
    } catch (err) {
      log.error(`Model err: ${err}`);
      return;
    }

    // Register for previews
    timeline.on('preview', this._onPreview);
  }

  /**
   * Make prediction asynchronously
   * @private
   */
  _forwardAsync(blob: any) {
    return new Promise((resolve, reject) => {
      this._net.layers[0].enqueue([blob]);
      let start = Date.now();
      this._net.forward(loss => {
        log.debug(`loss: ${loss}`);
        log.debug('forward time: ' + (Date.now() - start) + ' ms');
        resolve();
      });
    });
  }

  /**
   * @private
   */
  _onPreview = async (when) => {
    let imCopy = null;
    let boxes = [];

    if (!this.working) {
      this.working = true;
      let mat = null;
      try {
        // Fetch camera preview image
        let [im] = await camera.getFrame(when, ['rgb']);

        // Make a local copy of the image if diag is enabled so we can draw
        // object rectangles on it
        imCopy = timeline.diagFrameEnabled('') ? im.copy() : null;

        let imageWidth = im.width();
        let imageHeight = im.height();

        mat = im.clone();
        mat.resize(this._netWeight, this._netHeight);
        let image = mat.getData();
        let blob = new caffe.Blob(this._net.blobs[0].shape);
        let data = blob.data;
        for (let ch = 0; ch < 3; ++ch) {
          let pixels = this._netWeight * this._netHeight;
          for (let i = 0; i < pixels; ++i) {
            data[pixels * ch + i] = image[i * 3 + ch] / 255;
          }
        }
        await this._forwardAsync(blob);
        let output = this._net.blobs[this._net.blobs.length - 1];
        boxes = predictionsToBoxes(output.data, this._labels, this._num,
            config.NUM_SIDES, config.PROB_THRESH, config.NMS_IOU_THRESH,
            config.NMS_IOA_THRESH, imageWidth, imageHeight);
        log.debug(`yolo ${JSON.stringify(boxes)}`);
      } catch (error) {
        log.error(`Prediction failed err: ${error.stack || error}`);
      }

      if (mat) {
        mat.release();
      }
      this.working = false;

      if (config.RUN_SMOOTHER) {
        this._smoother.onFrame(when, boxes);
        boxes = this._smoother.getObjects();
      }
    } else {
      if (config.RUN_SMOOTHER) {
        log.debug(`Still busy, extrapolating objects locations`);
        this._smoother.onFrame(when, null);
        boxes = this._smoother.getObjects();
      } else {
        log.debug(`Still busy, unable to process next preview image`);
        return;
      }
    }

    log.info(`boxes: ${JSON.stringify(boxes)}`);

    // Add detected objects to timeline
    boxes.forEach(box => {
      timeline.addObjects([{
        source: 'yolo',
        tag: OBJECT_TAG,
        name: box.label,
        when,
        durationMs: config.OBJECT_DURATION,
        rects: [box],
      }]);

      if (imCopy) {
        imCopy.rectangle([box.x, box.y], [box.width, box.height], [255, 255, 255], 1);
      }
    });

    if ((boxes.length > 0) && imCopy) {
      this._env.timeline.addDiagFrame('yolo', when, imCopy);
    }

    if (imCopy) {
      imCopy.release();
    }
  };

  willUnload(): void {
    log.info('unloading....');
    if (this._onPreview) {
      timeline.removeListener('preview', this._onPreview);
    }
  }
}

module.exports = (env: Env) => new YoloClassifier(env);
