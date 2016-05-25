/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

'use strict';
/* eslint-disable no-console */

let caffe = null;
if (process.platform === 'android') {
  caffe = require('silk-caffe');
} else {
  caffe = require('..');
}
const fs = require('fs');
const opencv = require('opencv');

/**
 *
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
  _predictAsync(mat, topk) {
    return new Promise((resolve, reject) => {
      this._netCaffe.predictTopK(mat, topk, (err, predictions) => {
        if (err) {
          reject(err);
        } else {
          resolve(predictions);
        }
      });
    });
  }

  /**
   * Make regional CNN prediction asynchronously
   * @private
   */
  _rcnnAsync(mat) {
    let rects = [];
    return new Promise((resolve, reject) => {
      this._netCaffe.rcnn(mat, 'pedestrian', rects, (err, predictions) => {
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
  readImageAsync(testImage) {
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
  init(modelProto, modelBin, modelDictionary, modelMean) {
    this._netCaffe = new caffe.Model();

    // Load a DNN model
    return this._loadAsync(modelProto, modelBin)
    .then(() => {
      if (modelMean) {
        let exists = fs.existsSync(modelMean);
        if (!exists) {
          throw `${modelMean} not available on the device`;
        }

        this._netCaffe.setMean(modelMean);
      }

      let exists = fs.existsSync(modelDictionary);
      if (!exists) {
        throw `${modelDictionary} not available on the device`;
      }

      this._netCaffe.setLabels(modelDictionary);
    }).catch((err) => {
      throw err;
    });
  }

  /**
   * @private
   */
  predict(im, topk, useRcnn) {
    // Run DNN prediction
    console.log(`Running predition...`);
    let start = Date.now();

    let predictPromise;
    if (useRcnn === 'true') {
      console.log(`using RCNN: ${useRcnn}`);
      predictPromise = this._rcnnAsync(im);
    } else {
      predictPromise = this._predictAsync(im, topk);
    }
    predictPromise.then(predictions => {
      let diff = Date.now() - start;
      console.log(`Top ${topk} predictions in ${diff}ms:`);

      try {
        for (let i = 0; i < predictions.length; i++) {
          const indexLabel = predictions[i].label.indexOf(' ');
          let id = -1;
          if (indexLabel != -1) {
            id = predictions[i].label.substring(0, indexLabel);
          }
          const label = predictions[i].label.substring(indexLabel + 1);
          const probability = (predictions[i].confidence * 100).toFixed(2);
          const rect = (predictions[i].rect ? predictions[i].rect : []);
          console.log(`label: \"${label}\" Probability: ${probability}% ` +
              `id: ${id} rect: ${JSON.stringify(rect)}`);
          if (predictions[i].rect) {
            im.rectangle([rect.x, rect.y], [rect.width, rect.height]);
          }
        }
        const resultFileName = 'result.jpg';
        if (useRcnn === 'true') {
          console.log(`Saving RCCN result in ${resultFileName}`);
          im.save(resultFileName);
        }
      } catch (err) {
        console.error(`JS error ${err}`);
      }
    }).catch((err) => {
      throw err;
    });
  }
}

module.exports = Dnn;
/* eslint-enable no-console */
