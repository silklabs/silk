/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

'use strict';

const caffe = require('..');
const assert = require('assert');

const netCaffe = new caffe.Model();

suite('NMS', () => {
  test('NMS box within a box', () => {
    let boxes = [
      {score: 0.933079, x: 85, y: 8, width: 166, height: 168},
      {score: 0.925029, x: 85, y: 8, width: 166, height: 169},
      {score: 0.967365, x: 85, y: 8, width: 191, height: 169},
      {score: 0.919575, x: 108, y: 0, width: 152, height: 160},
      {score: 0.980430, x: 108, y: 0, width: 152, height: 177},
      {score: 0.997522, x: 108, y: 0, width: 212, height: 180},
      {score: 0.979568, x: 145, y: 8, width: 106, height: 154},
      {score: 0.982480, x: 145, y: 8, width: 106, height: 158},
      {score: 0.976103, x: 146, y: 8, width: 105, height: 154},
      {score: 0.999651, x: 178, y: 0, width: 137, height: 176},
      {score: 0.908969, x: 201, y: 0, width: 114, height: 176},
      {score: 0.938634, x: 201, y: 8, width: 48, height: 81},
      {score: 0.965971, x: 203, y: 0, width: 62, height: 150},
      {score: 0.961713, x: 206, y: 0, width: 59, height: 167},
      {score: 0.925462, x: 206, y: 0, width: 101, height: 177},
      {score: 0.908637, x: 206, y: 0, width: 106, height: 177},
    ];

    let result = [
      {score: 0.999651, x: 178, y: 0, width: 137, height: 176}
    ]
    
    let nmsBoxes = netCaffe.nms(boxes);
    nmsBoxes.forEach((box) => {
      box.score = box.score.toFixed(6);
    });

    assert.deepEqual(nmsBoxes, result);
  });
  test('NMS cop detector', () => {
    let boxes = [
      {score: 0.986536, x: 66, y: 9, width: 61, height: 100},
      {score: 0.990682, x: 79, y: 1, width: 56, height: 108},
      {score: 0.981094, x: 115, y: 2, width: 90, height: 114},
      {score: 0.982856, x: 115, y: 2, width: 141, height: 114},
      {score: 0.959380, x: 135, y: 2, width: 70, height: 102},
      {score: 0.990332, x: 135, y: 2, width: 70, height: 114},
      {score: 0.920315, x: 135, y: 2, width: 97, height: 114},
    ];

    let result = [
      {score: 0.990682, x: 79, y: 1, width: 56, height: 108},
      {score: 0.990332, x: 135, y: 2, width: 70, height: 114},
    ]
    
    let nmsBoxes = netCaffe.nms(boxes);
    nmsBoxes.forEach((box) => {
      box.score = box.score.toFixed(6);
    });

    assert.deepEqual(nmsBoxes, result);
  });
});
