/**
 * Copyright (c) 2016 Silk Labs, Inc. All Rights Reserved. Confidential and
 * Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import caffe from 'silk-caffe';
import nnjs from 'nn.js';
import fs from 'mz/fs';
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
    if (config.MODEL_TYPE === 'coco_nnjs') {
      this._num = 3;
    } else {
      this._num = 2;
    }
    this._smoother = new ObjectSmoother();
    this._init();
  }

  /**
   * @private
   */
  async _init() {
    try {
      // Check if all the required files exist on device
      let exists = await fs.exists(config.MODEL_PROTO);
      if (!exists) {
        log.error(`${config.MODEL_PROTO} not available on the device`);
        return;
      }

      exists = await fs.exists(config.MODEL_WEIGHTS);
      if (!exists) {
        log.error(`${config.MODEL_WEIGHTS} not available on the device`);
        return;
      }
      exists = await fs.exists(config.LABELS);
      if (!exists) {
        log.error(`${config.LABELS} not available on the device`);
        return;
      }
      const labels = await fs.readFile(config.LABELS);
      this._labels = JSON.parse(labels).labels;

      // Load network
      this._loadNet();
    } catch (err) {
      log.error(`Model err: ${err}`);
      return;
    }

    // Register for previews
    timeline.on('preview', this._onPreview);
  }

  /**
   * Load network based on model type
   * @private
   */
  _loadNet() {
    log.info(`framework: ${config.MODEL_TYPE}`);
    if ((config.MODEL_TYPE === 'yolo_nnjs') || (config.MODEL_TYPE === 'coco_nnjs')) {
      let backend = nnjs.Net.backends.reference;
      if (config.BACKEND === 'qconv') {
        backend = nnjs.Net.backends.qconv;
      } else if (config.BACKEND === 'opencl') {
        backend = nnjs.Net.backends.opencl;
        backend.clruntime.precision = (config.USE_FP16) ? 16 : 32;
      }
      this._net = nnjs.darknet.load(config.MODEL_CFG, config.MODEL_WEIGHTS, backend);
      this._netWeight = this._net.in_shape.width;
      this._netHeight = this._net.in_shape.height;

      log.info(`backend: ${this._net.backend.name}`);
      log.info(`network shape ${this._net.in_shape.toString()}`);
    } else {
      this._net = new caffe.Net(config.MODEL_PROTO, 'test');
      this._net.copyTrainedLayersFrom(config.MODEL_WEIGHTS);

      let shape = this._net.blobs[0].shape;
      this._netWeight = shape[3];
      this._netHeight = shape[2];

      log.info(`network shape ${shape.join(' ')}`);
    }
    log.debug(`weights file:  ${config.MODEL_WEIGHTS}`);
    log.debug(`labels file:  ${config.LABELS}`);
    log.debug(`cfg file:  ${config.MODEL_CFG}`);
  }

  /**
   * Make caffe prediction asynchronously
   * @private
   */
  _forwardCaffeAsync(mat: any) {
    return new Promise((resolve, reject) => {
      let blob = new caffe.Blob(this._net.blobs[0].shape);
      let data = blob.data;

      let image = mat.getData();
      for (let ch = 0; ch < 3; ++ch) {
        let pixels = this._netWeight * this._netHeight;
        for (let i = 0; i < pixels; ++i) {
          data[pixels * ch + i] = image[i * 3 + ch] / 255;
        }
      }

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
   * Make nn.js prediction synchronously
   * @private
   */
  _forwardNnjs(mat: any) {
    let image = mat.getData();
    let data = [];

    for (let ch = 0; ch < 3; ++ch) {
      let pixels = this._netWeight * this._netHeight;
      for (let i = 0; i < pixels; ++i) {
        data.push(image[i * 3 + ch] / 255);
      }
    }
    let start = Date.now();
    let output = this._net.forward(data);
    log.debug('forward time: ' + (Date.now() - start) + ' ms');
    return output;
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

        // Resize image to the yolo
        mat = im.clone();
        mat.resize(this._netWeight, this._netHeight);

        let output;
        if (config.MODEL_TYPE === 'yolo_caffe') {
          await this._forwardCaffeAsync(mat);
          output = this._net.blobs[this._net.blobs.length - 1].data;
        } else {
          output = this._forwardNnjs(mat);
        }
        boxes = predictionsToBoxes(output, this._labels, this._num,
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
