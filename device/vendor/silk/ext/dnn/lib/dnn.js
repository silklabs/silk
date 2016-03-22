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

const MODEL_PROTO = 'system/silk/media/dnn/model/googlenet/deploy.prototxt';
const MODEL_BIN = 'system/silk/media/dnn/model/googlenet/bvlc_googlenet.caffemodel';
const MODEL_DICTIONARY = 'system/silk/media/dnn/model/imagenet_dictionary.txt';
const MODEL_MEAN = 'system/silk/media/dnn/model/imagenet_mean.binaryproto';
const TOPK = 5; // Return top K predictions for the given image

const THRESHOLD = 12; // Ignore predictions with probability lower than threshold

/**
 * This class listens for motion events and uses Caffe DNN to classify the image
 */
class Dnn {
  _env: Env;
  _netCaffe: caffe.Model;
  _onMotion: Function;
  _lastObjectLabel: string;
  _lastObjectId: number;

  constructor(env: Env) {
    this._env = env;
    this._init();
    this._lastObjectLabel = '';
    this._lastObjectId = 0;
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
      let timeline = this._env.timeline;
      if (working) {
        log.error(`Still busy, unable to process next preview image`);
        return;
      }
      working = true;

      try {
        // Fetch camera preview image
        let [im] = await this._env.camera.getFrame(when, ['gray']);

        // By the time prediction finishes camera might have evicted the image
        // from its cache, so make a local copy of the image if diag is enabled
        let imCopy = timeline.diagFrameEnabled('') ? im.copy() : null;

        // Run DNN prediction
        log.verbose(`Running predition...`);
        let start = Date.now();
        let predictions = await this._predictAsync(im);
        let diff = Date.now() - start;
        log.verbose(`Top ${TOPK} predictions in ${diff}ms: `);

        let topLabel = '';
        let topProbability = 0;
        for (let i = 0; i < predictions.length; i++) {
          const indexLabel = predictions[i].label.indexOf(' ');
          const id = predictions[i].label.substring(0, indexLabel);

          // Get category and sub-category
          let label = predictions[i].label.substring(indexLabel + 1);
          let subcategory = '';
          const categoryStart = label.indexOf('[');
          if (categoryStart !== -1) {
            const categoryEnd = label.indexOf(']');
            subcategory = label.substring(categoryEnd + 2);
            label = label.substring(categoryStart + 1, categoryEnd);
          }

          const probability = parseInt((predictions[i].confidence * 100).toFixed(2));
          log.info(`label: \"${label}\" sub-category: \"${subcategory}\" ` +
              `Probability: ${probability}% id: ${id}`);

          if (i === 0) {
            topLabel = label;

            // HACK to not add the objects to timeline if the object category
            // is not available
            if (categoryStart !== -1) {
              topProbability = probability;
            } else {
              topProbability = 0;
            }
          }
        }

        // Add the top most prediction to diag stream
        if (imCopy) {
          timeline.addDiagFrame(`${topLabel}:${topProbability}% in ${diff}ms`, when, imCopy);
        }

        // Remove the object if it is no longer detected
        if ((this._lastObjectLabel !== '') && (this._lastObjectLabel !== topLabel)) {
          timeline.addObjects([{
            tag: this._lastObjectLabel + ' no longer detected',
            when,
            durationMs: 1000,
            id: this._lastObjectId,
          }]);
          log.verbose(`Removing object ${this._lastObjectLabel}`);
          this._lastObjectLabel = '';
        }

        // Add the object to timeline if probability higher than threshold
        // and it is a different object than previously reported
        if ((topProbability >= THRESHOLD) && (this._lastObjectLabel !== topLabel)) {
          let id = timeline.getNextObjectId();
          timeline.addObjects([{
            tag: topLabel,
            when,
            id,
          }]);
          this._lastObjectLabel = topLabel;
          this._lastObjectId = id;
          log.verbose(`Adding object ${topLabel}`);
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
