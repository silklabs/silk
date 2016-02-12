/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

/**
 * This test can only run on device as it has dependency on silk-caffe which
 * currently can not be compiled on the host. Push cat.jpg from
 * https://github.com/BVLC/caffe/blob/master/examples/images/cat.jpg to data/media
 * on the device before the test is run.
 */

'use strict';
/* eslint-disable no-console */

const caffe = require('silk-caffe');
const fs = require('fs');
const opencv = require('opencv');

const MODEL_PROTO = 'system/silk/media/dnn/model/deploy.prototxt';
const MODEL_BIN = 'system/silk/media/dnn/model/bvlc_googlenet.caffemodel';
const MODEL_DICTIONARY = 'system/silk/media/dnn/model/imagenet_dictionary.txt';
const MODEL_MEAN = 'system/silk/media/dnn/model/imagenet_mean.binaryproto';
const TOPK = 5; // Return top K predictions for the given image

const CAT = 'data/media/cat.jpg';

/**
 * This class listens for motion events and uses Caffe DNN to classify the image
 */
class Dnn {
  /**
   * Load model asynchronously
   * @private
   */
  _loadAsync(modelProto, modelBin) {
    return new Promise((resolve, reject) => {
      let exists = fs.existsSync(MODEL_PROTO);
      if (!exists) {
        reject(`${MODEL_PROTO} not available on the device`);
        return;
      }

      exists = fs.existsSync(MODEL_BIN);
      if (!exists) {
        reject(`${MODEL_BIN} not available on the device`);
        return;
      }

      let start = Date.now();
      this._netCaffe.load(modelProto, modelBin, err => {
        if (err) {
          reject(err);
        } else {
          let diff = Date.now() - start;
          console.log(`Caffe model loaded in ${diff}ms`);
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
   * Read image asynchronously
   * @private
   */
  _readImageAsync() {
    return new Promise((resolve, reject) => {
      let exists = fs.existsSync(CAT);
      if (!exists) {
        reject(`${CAT} file doesn't exist`);
        return;
      }
      opencv.readImage(CAT, (err, im) => {
        if (err) {
          reject(err);
        } else {
          resolve(im);
        }
      });
    });
  }

  /**
   * @private
   */
  init() {
    this._netCaffe = new caffe.Model();

    // Load a DNN model
    return this._loadAsync(MODEL_PROTO, MODEL_BIN)
    .then(() => {
      let exists = fs.existsSync(MODEL_MEAN);
      if (!exists) {
        throw `${MODEL_MEAN} not available on the device`;
      }

      exists = fs.existsSync(MODEL_DICTIONARY);
      if (!exists) {
        throw `${MODEL_DICTIONARY} not available on the device`;
      }

      this._netCaffe.setMean(MODEL_MEAN);
      this._netCaffe.setLabels(MODEL_DICTIONARY);
    });
  }

  /**
   * @private
   */
  predict() {
    // Fetch camera preview image
    this._readImageAsync()
    .then(im => {
      // Run DNN prediction
      console.log(`Running predition...`);
      let start = Date.now();
      this._predictAsync(im)
      .then(predictions => {
        let diff = Date.now() - start;
        console.log(`Top ${TOPK} predictions in ${diff}ms: `);

        for (let i = 0; i < predictions.length; i++) {
          const indexLabel = predictions[i].label.indexOf(' ');
          const id = predictions[i].label.substring(0, indexLabel);
          const label = predictions[i].label.substring(indexLabel + 1);
          const probability = (predictions[i].confidence * 100).toFixed(2);
          console.log(`label: \"${label}\" Probability: ${probability}% id: ${id}`);
        }
      });
    })
    .catch(error => {
      console.error(`Prediction failed: ${error}`);
    });
  }
}

// Run test
let dnn = new Dnn();
dnn.init()
.then(() => {
  return dnn.predict();
})
.catch(error => {
  console.error(`Error running test: ${error}`);
});

/* eslint-enable no-console */
