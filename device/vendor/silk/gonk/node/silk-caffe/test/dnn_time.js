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

let caffe = null;
if (process.platform == 'android') {
  caffe = require('silk-caffe');
} else {
  caffe = require('..');
}

const fs = require('fs');

const MODEL = 'system/silk/media/dnn/model/deploy.prototxt';
const ITERATIONS = 10;

let modelProto = MODEL;
let iterations = ITERATIONS;
if (process.argv.length >= 3) {
  modelProto = process.argv[2];
}
if (process.argv.length >= 4) {
  iterations = parseInt(process.argv[3]);
}

let netCaffe = new caffe.Model();
let exists = fs.existsSync(modelProto);
if (!exists) {
  console.log(`${modelProto} not available`);
  return;
}

try {
  let result = netCaffe.time(modelProto, iterations);
  console.log(`Average Forward pass: ${(result.forward).toFixed(2)} ms`);
  console.log(`Average Backward pass: ${(result.backward).toFixed(2)} ms`);
  console.log(`Average Forward-Backward: ${(result.forwardbackward).toFixed(2)} ms`);
  console.log(`Total Time: ${(result.total).toFixed(2)} ms`);
} catch (err) {
  console.error(`Error: ${err.stack || err}`);
}
