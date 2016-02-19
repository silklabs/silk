/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

/**
 * This test can only run on device as it has dependency on silk-caffe which
 * currently can not be compiled on the host.
 *
 * Pre-requisites:
 * - Push cat.jpg from
 *   https://github.com/BVLC/caffe/blob/master/examples/images/cat.jpg to data/media
 *   on the device before the test is run.
 * - Push this file to /system/silk on the device
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

const TEST_IMAGE = 'data/media/cat.jpg';

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
      let exists = fs.existsSync(modelProto);
      if (!exists) {
        reject(`${modelProto} not available on the device`);
        return;
      }

      exists = fs.existsSync(modelBin);
      if (!exists) {
        reject(`${modelBin} not available on the device`);
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
   * Make region prediction asynchronously
   * @private
   */
  _predictRegionsAsync(mat) {
    return new Promise((resolve, reject) => {
      this._netCaffe.predictRegions(mat, (err, predictions) => {
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
  _readImageAsync(testImage) {
    return new Promise((resolve, reject) => {
      let exists = fs.existsSync(testImage);
      if (!exists) {
        reject(`${testImage} file doesn't exist`);
        return;
      }
      opencv.readImage(testImage, (err, im) => {
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
  init(modelProto, modelBin, modelMean, modelDictionary) {
    this._netCaffe = new caffe.Model();

    // Load a DNN model
    return this._loadAsync(modelProto, modelBin)
    .then(() => {
      let exists = fs.existsSync(modelMean);
      if (!exists) {
        throw `${modelMean} not available on the device`;
      }

      exists = fs.existsSync(modelDictionary);
      if (!exists) {
        throw `${modelDictionary} not available on the device`;
      }

      this._netCaffe.setMean(modelMean);
      this._netCaffe.setLabels(modelDictionary);
    });
  }

  /**
   * @private
   */
  predict(testImage) {
    // Fetch camera preview image
    this._readImageAsync(testImage)
    .then(im => {
      // Run DNN prediction
      console.log(`Running predition for ${testImage} ...`);
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

let modelProto = MODEL_PROTO;
let modelBin = MODEL_BIN;
let modelMean = MODEL_MEAN;
let modelDictionary = MODEL_DICTIONARY;
let testImage = TEST_IMAGE;

if ((process.argv.length > 2) && (process.argv.length < 7)) {
  console.log(`Usage: deploy.prototxt network.caffemodel mean.binaryproto labels.txt img.jpg`);
  process.exit(1); //eslint-disable-line no-process-exit
}

if (process.argv.length >= 7) {
  modelProto = process.argv[2];
  modelBin = process.argv[3];
  modelMean = process.argv[4]
  modelDictionary = process.argv[5];
  testImage = process.argv[6];
}

// Run test
let dnn = new Dnn();
dnn.init(modelProto, modelBin, modelMean, modelDictionary)
.then(() => {
  return dnn.predict(testImage);
})
.catch(error => {
  console.error(`Error running test: ${error}`);
});

/* eslint-enable no-console */
