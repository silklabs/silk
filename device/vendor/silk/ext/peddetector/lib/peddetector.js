/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

// Load the regnerator polyfill manually so we don't need to also load all the
import caffe from 'silk-caffe';
import fs from 'mz/fs';
import path from 'path';

import type { Env, Log } from 'silk-exttest';

let log: Log;

const MODEL_PROTO = path.join(__dirname, '../model', 'deploy.prototxt');
const MODEL_BIN = path.join(__dirname, '../model', 'caltech10x_warp_finetune_train_iter_100000');
const MODEL_DICTIONARY = path.join(__dirname, '../model', 'labels.txt');
const MODEL_MEAN = path.join(__dirname, '../model', 'imagenet_mean.binaryproto');

/**
 * This class listens for motion events and uses Silk-Caffe RCNN to predict
 * pedestrians in the preview image
 */
class Peddetector {
  _env: Env;
  _netCaffe: caffe.Model;
  _onMotion: Function;
  working: boolean = false;

  constructor(env: Env) {
    this._env = env;
    this._init();
  }

  /**
   *
   */
  willUnload() {
    if (this._onMotion) {
      this._env.timeline.removeListener('motion', this._onMotion);
    }
  }

  /**
   * Load model asynchronously
   * @private
   */
  _loadAsync(modelProto: string, modelBin: string) {
    log.verbose(`Loading pedestrian model`);
    return new Promise((resolve, reject) => {
      let start = Date.now();
      this._netCaffe.load(modelProto, modelBin, err => {
        if (err) {
          reject(err);
        } else {
          let diff = Date.now() - start;
          log.verbose(`Pedestrian model loaded in ${diff}ms`);
          resolve();
        }
      });
    });
  }

  /**
   * Make prediction asynchronously
   * @private
   */
  _rcnnAsync(mat, motionRects) {
    return new Promise((resolve, reject) => {
      this._netCaffe.rcnn(mat, 'pedestrian', motionRects, (err, predictions) => {
        if (err) {
          reject(err);
        } else {
          resolve(predictions);
        }
      });
    });
  }

  /**
   * @private
   */
  async _init() {
    log = this._env.log;
    this._netCaffe = new caffe.Model();

    // Load the pedestrian model
    try {
      // Check if all the required files exist on device
      let exists = await fs.exists(MODEL_PROTO);
      if (!exists) {
        log.error(`${MODEL_PROTO} not available on the device`);
        return;
      }

      exists = await fs.exists(MODEL_BIN);
      if (!exists) {
        log.error(`${MODEL_BIN} not available on the device`);
        return;
      }

      exists = await fs.exists(MODEL_MEAN);
      if (!exists) {
        log.error(`${MODEL_MEAN} not available on the device`);
        return;
      }

      exists = await fs.exists(MODEL_DICTIONARY);
      if (!exists) {
        log.error(`${MODEL_DICTIONARY} not available on the device`);
        return;
      }

      await this._loadAsync(MODEL_PROTO, MODEL_BIN);
      this._netCaffe.setMean(MODEL_MEAN);
      this._netCaffe.setLabels(MODEL_DICTIONARY);
    } catch (err) {
      log.error(`Failed to load caffe model err: ${err}`);
      return;
    }

    // Register for motion
    this._env.timeline.on('motion', this._onMotion);
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
      let [im] = await this._env.camera.getFrame(when, ['rgb']);

      // By the time prediction finishes camera might have evicted the image
      // from its cache, so make a local copy of the image
      imCopy = im.copy();

      // Run pedestrian prediction
      log.verbose(`Running predition...`);
      let start = Date.now();
      let predictions = await this._rcnnAsync(imCopy, motionRects);
      let diff = Date.now() - start;

      let rects = [];
      for (let i = 0; i < predictions.length; i++) {
        const label = predictions[i].label;
        const probability = (predictions[i].confidence * 100).toFixed(2);
        const rect = predictions[i].rect;
        rects.push(rect);
        imCopy.rectangle([rect.x, rect.y], [rect.width, rect.height],
            [255, 255, 255], 1);
        log.info(`label: ${label} Probability: ${probability}% rect: ${JSON.stringify(rect)}`);
      }

      log.verbose(`Finished pedestrian predictions in ${diff}ms rects: ${rects.length}`);

      // Add detected pedestrians to timeline
      if (rects.length > 0) {
        this._env.timeline.addObjects([{tag: 'pedestrian', when, rects}]);
        this._env.timeline.addDiagFrame('pedestrian', when, imCopy);
      }
    } catch (error) {
      log.error(`Prediction failed err: ${error.stack || error}`);
    }
    imCopy.release();
    this.working = false;
  };
}

module.exports = (env: Env): any => new Peddetector(env);
