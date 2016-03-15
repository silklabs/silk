/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

/**
 * To run this test on the device please push this file to /system/silk on the
 * device and then run it as follows:
 * adb shell LD_LIBRARY_PATH=/system/silk/lib node /system/silk/dnn_time.js
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

const MODEL = 'system/silk/media/dnn/model/deploy.prototxt';
const ITERATIONS = 10;

/* Parse command line arguments */
let modelProto = MODEL;
if (process.argv.length >= 3) {
  modelProto = process.argv[2];
}

let iterations = ITERATIONS;
if (process.argv.length >= 4) {
  iterations = parseInt(process.argv[3]);
}

let numThreads = -1; // Default thread count
if (process.argv.length >= 5) {
  numThreads = parseInt(process.argv[4]);
}

let netCaffe = new caffe.Model();
let exists = fs.existsSync(modelProto);
if (!exists) {
  console.log(`${modelProto} not available`);
  return;
}

try {
  console.log(``);
  console.log(`*** Begin benchmark with thread count ${numThreads} ***`);
  let result = netCaffe.time(modelProto, iterations, numThreads);
  console.log(`Average Forward pass: ${(result.forward).toFixed(2)} ms`);
  console.log(`Average Backward pass: ${(result.backward).toFixed(2)} ms`);
  console.log(`Average Forward-Backward: ${(result.forwardbackward).toFixed(2)} ms`);
  console.log(`Total Time: ${(result.total).toFixed(2)} ms`);
  console.log(`*** End benchmark ***`);
} catch (err) {
  console.error(`Error: ${err.stack || err}`);
}
