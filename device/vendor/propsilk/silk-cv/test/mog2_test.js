'use strict';

const path = require('path');
const assert = require('assert');
const cv = require('opencv');
const silkcv = require('..');

let mog2 = new silkcv.Mog2Subtractor(100, 16);

suite('Mog2', () => {
  test('apply', () => new Promise(resolve => {
    let image = new cv.Matrix(50, 50, cv.Constants.CV_8UC1);
    let outputMat = new cv.Matrix();
    mog2.apply(image, outputMat, (fgMask) => {
      assert.deepEqual(fgMask.size(), [50, 50]);
      resolve();
    });
  }));

  test('background', () => {
    let mat = new cv.Matrix();
    assert.deepEqual(mat.size(), [0, 0]);

    mog2.getBackground(mat);

    // getBackground() should remain [50, 50] from the 'apply' test
    assert.deepEqual(mat.size(), [50, 50]);
  });
});
