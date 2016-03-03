/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

// Load the regnerator polyfill manually so we don't need to also load all the
// core-js polyfills which we don't actually need...
import regeneratorRuntime from 'babel-runtime/regenerator';
global.regeneratorRuntime = global.regeneratorRuntime || regeneratorRuntime;

import caffe from 'silk-caffe';
import fs from 'mz/fs';

import type { Env, Log } from 'silk-sdk-glue/interface/env';

let log: Log;

const MODEL_PROTO = 'system/silk/media/dnn/model/deploy.prototxt';
const MODEL_BIN = 'system/silk/media/dnn/model/bvlc_googlenet.caffemodel';
const MODEL_DICTIONARY = 'system/silk/media/dnn/model/imagenet_dictionary.txt';
const MODEL_MEAN = 'system/silk/media/dnn/model/imagenet_mean.binaryproto';
const TOPK = 5; // Return top K predictions for the given image

/**
 * This class listens for motion events and uses Caffe DNN to classify the image
 */
class Dnn {
  _env: Env;
  _netCaffe: caffe.Model;
  _onMotion: Function;

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
    log.verbose(`Loading caffe DNN model`);
    return new Promise((resolve, reject) => {
      let start = Date.now();
      this._netCaffe.load(modelProto, modelBin, err => {
        if (err) {
          reject(err);
        } else {
          let diff = Date.now() - start;
          log.verbose(`Caffe model loaded in ${diff}ms`);
          resolve();
        }
      });
    });
  }

  /**
   * Make prediction asynchronously
   * @private
   */
  _predictAsync(mat) {
    return new Promise((resolve, reject) => {
      this._netCaffe.predictTopK(mat, TOPK, (err, predictions) => {
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
    let working = false;

    this._netCaffe = new caffe.Model();

    // Load a DNN model
    try {
      // Check if all the required files exist on device
      let exists = fs.exists(MODEL_PROTO);
      if (!exists) {
        log.error(`${MODEL_PROTO} not available on the device`);
        return;
      }

      exists = fs.exists(MODEL_BIN);
      if (!exists) {
        log.error(`${MODEL_BIN} not available on the device`);
        return;
      }

      exists = fs.exists(MODEL_MEAN);
      if (!exists) {
        log.error(`${MODEL_MEAN} not available on the device`);
        return;
      }

      exists = fs.exists(MODEL_DICTIONARY);
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
    this._onMotion = async (when) => {
      if (working) {
        log.error(`Still busy, unable to process next preview image`);
        return;
      }
      working = true;

      try {
        // Fetch camera preview image
        let [im] = await this._env.camera.getPreviewFrames(when, ['gray']);

        // By the time prediction finishes camera might have evicted the image
        // from its cache, so make a local copy of the image
        let imCopy = im.copy();

        // Run DNN prediction
        log.verbose(`Running predition...`);
        let start = Date.now();
        let predictions = await this._predictAsync(imCopy);
        let diff = Date.now() - start;
        log.verbose(`Top ${TOPK} predictions in ${diff}ms: `);

        for (let i = 0; i < predictions.length; i++) {
          const indexLabel = predictions[i].label.indexOf(' ');
          const id = predictions[i].label.substring(0, indexLabel);
          const label = predictions[i].label.substring(indexLabel + 1);
          const probability = (predictions[i].confidence * 100).toFixed(2);
          log.info(`label: ${label} Probability: ${probability}% id: ${id}`);

          // Add the top most prediction to diag stream
          if (i === 0) {
            this._env.timeline.addDiagFrame(`${label}:${probability}%`, when, imCopy);
          }
        }
      } catch (error) {
        log.error(`Prediction failed err: ${error}`);
      }
      working = false;
    };

    this._env.timeline.on('motion', this._onMotion);
  }
}

module.exports = (env: Env): any => new Dnn(env);
