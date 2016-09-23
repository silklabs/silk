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
const NUM_SIDES = 7;
const PROB_THRESH = 0.2;
const NMS_IOU_THRESH = 0.35;
const NMS_IOA_THRESH = 0.75;

// Time in milliseconds between successive attempts to classify objects in
// preview stream based on the time it generally takes on the device to classify
// a preview image
const OBJECT_DETECT_INTERVAL = 1000;

const OBJECT_TAG = 'object';
const RUN_SMOOTHER = true;

class YoloClassifier {
  _labels: Array<string>;
  _num: number;
  _netWeight: number;
  _netHeight: number;
  _onMotion: Function;
  _net: caffe.Net;
  _smoother: ObjectSmoother;

  constructor(env: Env) {
    camera = env.camera;
    timeline = env.timeline;
    const yoloLabels = ['aeroplane', 'bicycle', 'bird', 'boat', 'bottle', 'bus', 'car', 'cat', 'chair', 'cow', 'diningtable', 'dog', 'horse', 'motorbike', 'person', 'pottedplant', 'sheep', 'sofa', 'train', 'tvmonitor'];
    const cocoLabels = ['person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'];
    this._net = new caffe.Net(MODEL_PROTO, 'test');
    this._net.copyTrainedLayersFrom(MODEL_WEIGHTS);
    if (MODEL_PROTO.indexOf('yolo') !== -1) {
      this._labels = yoloLabels;
      this._num = 2;
    } else {
      this._labels = cocoLabels;
      this._num = 3;
    }
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

    // Register for motion
    timeline.on('motion', this._onMotion);
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
  _onMotion = async (when, motionRects) => {
    if (this.working) {
      log.debug(`Still busy, unable to process next preview image`);
      return;
    }
    this.working = true;
    let imCopy = null;

    try {
      // Fetch camera preview image
      let [im] = await camera.getFrame(when, ['rgb']);

      // Make a local copy of the image if diag is enabled so we can draw
      // object rectangles on it
      let imCopy = timeline.diagFrameEnabled('') ? im.copy() : null;

      let imageWidth = im.width();
      let imageHeight = im.height();

      let mat = im.clone();
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
      let boxes = predictionsToBoxes(output.data, this._labels, this._num,
          NUM_SIDES, PROB_THRESH, NMS_IOU_THRESH, NMS_IOA_THRESH, imageWidth,
          imageHeight);
      mat.release();
      log.debug(`yolo ${JSON.stringify(boxes)}`);

      if (RUN_SMOOTHER) {
        this._smoother.onFrame(when, boxes);
        boxes = this._smoother.getObjects();
      }

      // Add detected objects to timeline
      boxes.forEach(box => {
        timeline.addObjects([{
          source: 'yolo',
          tag: OBJECT_TAG,
          name: box.label,
          when,
          durationMs: OBJECT_DETECT_INTERVAL,
          rects: [box],
        }]);

        if (imCopy) {
          imCopy.rectangle([box.x, box.y], [box.width, box.height], [255, 255, 255], 1);
        }
      });

      if ((boxes.length > 0) && imCopy) {
        this._env.timeline.addDiagFrame('yolo', when, imCopy);
      }

    } catch (error) {
      log.error(`Prediction failed err: ${error.stack || error}`);
    }
    if (imCopy) {
      imCopy.release();
    }
    this.working = false;
  };

  willUnload(): void {
    log.info('unloading....');
    if (this._onMotion) {
      timeline.removeListener('motion', this._onMotion);
    }
  }
}

module.exports = (env: Env) => new YoloClassifier(env);
