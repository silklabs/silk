/**
 * Transcribed from matlab code with the following license:
 * Copyright (c) 2012, Piotr Dollar
 * All rights reserved.
 *
 */

'use strict';
const utils = require('./utilities');

/**
 *
 */
class Faces {
  formatPath(base, s1, v1) {
    return `${base}/FDDB-fold-${utils.leftPad(v1, 2)}`;
  }

  get resize() {
    return false;
  }

  get labels() {
    return ['face'];
  }

  /**
   * Filter ground truth bounding boxes.
   *
   * @return true if the bb satisfies the filter criteria, false otherwise
   */
  filterGtFun(exps, bnds, aspectRatio, lbl, bb, bbv) {
    let hr = exps.hr;
    let vr = exps.vr;
    let p = (bb.height >= hr[0] && bb.height < hr[1]);

    let vf = Infinity;
    if ((bbv.width !== 0) || (bbv.height !== 0)) {
      vf = bbv.width * bbv.height / (bb.width * bb.height);
    }
    p = p && (vf >= vr[0] && vf <= vr[1]);

    return p;
  }
}

module.exports = Faces;
