/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import * as silkcv from 'silk-cv';
import cv from 'opencv';

import type { Env, Timeline } from 'silk-exttest';
import type { SubtractorCallbackType, Mog2Subtractor } from 'silk-cv';
import type { Matrix } from 'opencv';

export default class MogSubtractor {
  mat: Matrix;
  timeline: Timeline;
  subtractor: Mog2Subtractor;

  constructor(env: Env) {
    this.mat = new cv.Matrix(); // a Matrix passed into silkcv.Mog2Subtractor
                                // for fetching data since it can't create its
                                // own Matrix objects
    this.timeline = env.timeline;
    this.subtractor = new silkcv.Mog2Subtractor(
      /*history = */ 100,
      /*varThreshold = */ 16
    );
  }

  /**
   * Apply the subtractor over the provided image, and return the motion
   * diff via the callback function
   */
  apply(when: number, image: Matrix, cb: SubtractorCallbackType) {
    if (this.timeline.diagFrameEnabled('mog2_bg')) {
      this.subtractor.getBackground(this.mat);
      this.timeline.addDiagFrame('mog2_bg', when, this.mat);
    }
    this.subtractor.apply(image, this.mat, cb);
  }
}
