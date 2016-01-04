/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import assert from 'assert';
import MotionZone from '../lib/motionzone';
import createLog from 'log';
const log = createLog('motionzone');

suite('Motion zone', () => {
  test('group rectangles', () => {
    let motionzone = new MotionZone({log});
    assert.notEqual(motionzone, null);

    let rectangles = [
      {'x': 1, 'y': 129, 'width': 29, 'height': 50},
      {'x': 24, 'y': 65, 'width': 23, 'height': 19},
      {'x': 178, 'y': 61, 'width': 27, 'height': 28},
      {'x': 269, 'y': 56, 'width': 31, 'height': 23},
      {'x': 1, 'y': 52, 'width': 267, 'height': 127},
      {'x': 284, 'y': 31, 'width': 25, 'height': 20},
      {'x': 206, 'y': 1, 'width': 113, 'height': 178},
    ];
    motionzone.groupRectangles(rectangles);
    assert.deepEqual(rectangles, [{'x': 1, 'y': 1, 'width': 318, 'height': 178}]);
  });
});
