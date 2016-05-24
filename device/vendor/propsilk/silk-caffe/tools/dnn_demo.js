/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

/**
 * Pre-requisites:
 * - Push cat.jpg from
 *   https://github.com/BVLC/caffe/blob/master/examples/images/cat.jpg to data/media
 *   on the device before the test is run.
 * - Push this file to /system/silk on the device
 */

'use strict';
/* eslint-disable no-console */

const Dnn = require('./dnn');

const MODEL_PROTO = 'system/silk/media/dnn/model/googlenet/deploy.prototxt';
const MODEL_BIN = 'system/silk/media/dnn/model/googlenet/bvlc_googlenet.caffemodel';
const MODEL_DICTIONARY = 'system/silk/media/dnn/model/imagenet_dictionary.txt';
const MODEL_MEAN = 'system/silk/media/dnn/model/imagenet_mean.binaryproto';
const TOPK = 5; // Return top K predictions for the given image

const TEST_IMAGE = 'data/media/cat.jpg';

let modelProto = MODEL_PROTO;
let modelBin = MODEL_BIN;
let modelMean = MODEL_MEAN;
let modelDictionary = MODEL_DICTIONARY;
let testImage = TEST_IMAGE;
let useRcnn = false;

if ((process.argv.length > 2) && (process.argv.length < 8)) {
  console.log(`Usage: deploy.prototxt network.caffemodel mean.binaryproto labels.txt img.jpg useRcnn(true|false)`);
  process.exit(1); //eslint-disable-line no-process-exit
}

if (process.argv.length >= 8) {
  modelProto = process.argv[2];
  modelBin = process.argv[3];
  modelMean = process.argv[4]
  modelDictionary = process.argv[5];
  testImage = process.argv[6];
  useRcnn = process.argv[7];
}

// Run test
let dnn = new Dnn();
dnn.init(modelProto, modelBin, modelDictionary, modelMean)
.then(() => {
  return dnn.readImageAsync(testImage);
})
.then((im) => {
  return dnn.predict(im, TOPK, useRcnn);
})
.catch(err => {
  console.error(`Error running test: ${err.stack || err}`);
});

/* eslint-enable no-console */
