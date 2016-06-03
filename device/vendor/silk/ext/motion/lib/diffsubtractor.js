/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import cv from 'opencv';
import type { Env } from 'silk-exttest';
import type { SubtractorCallbackType } from 'silk-cv';
import type { Matrix } from 'opencv';

/**
 * The DiffSubtractor works by comparing three consecutive frames by diffing
 * them and find out how many pixels have changed.
 *
 * Reference: https://kerberos.io/
 */
export default class DiffSubtractor {
  prevFrame: Matrix = null;
  currentFrame: Matrix = null;
  nextFrame: Matrix = null;
  env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Apply the subtractor over the provided image, and return the motion
   * diff via the callback function
   */
  apply(when: number, image: Matrix, cb: SubtractorCallbackType) {
    const imageWidth = image.width();
    const imageHeight = image.height();

    // Take a new image
    if (this.prevFrame) {
      this.prevFrame.release();
    }
    this.prevFrame = this.currentFrame;
    this.currentFrame = this.nextFrame;
    this.nextFrame = image.copy();

    // d1 and d2 for calculating the differences
    // motion, the result of "and" operation, calculated on d1 and d2
    // numChanges, the amount of changes in the result matrix.
    let d1, d2, motion;

    d1 = new cv.Matrix(imageHeight, imageWidth, cv.Constants.CV_8UC1);
    d2 = new cv.Matrix(imageHeight, imageWidth, cv.Constants.CV_8UC1);
    motion = new cv.Matrix(imageHeight, imageWidth, cv.Constants.CV_8UC1);

    // Check if at least three frames are available
    if (this.prevFrame && this.currentFrame) {
      // Calc differences between the images and do AND-operation
      d1.absDiff(this.prevFrame, this.nextFrame);
      d2.absDiff(this.nextFrame, this.currentFrame);
      motion.bitwiseAnd(d1, d2);
    }

    d1.release();
    d2.release();
    cb(motion);
    motion.release();
  }
}
