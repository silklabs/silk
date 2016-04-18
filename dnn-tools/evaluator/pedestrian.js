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
class Pedestrian {
  formatPath(base, s1, v1) {
    return `${base}/set${utils.leftPad(s1, 2)}/V${utils.leftPad(v1, 3)}`;
  }

  get resize() {
    return true;
  }

  get labels() {
    return ['person', 'person?', 'people', 'ignore'];
  }

  /**
   * Filter ground truth bounding boxes.
   *
   * @return true if the bb satisfies the filter criteria, false otherwise
   */
  filterGtFun(exps, bnds, aspectRatio, lbl, bb, bbv) {
    let hr = exps.hr, vr = exps.vr, ar = exps.ar;
    let p = (lbl === 'person');
    p = p && (bb.height >= hr[0] && bb.height < hr[1]);

    let vf = Infinity;
    if ((bbv.width !== 0) || (bbv.height !== 0)) {
      vf = bbv.width * bbv.height / (bb.width * bb.height);
    }
    p = p && (vf >= vr[0] && vf <= vr[1]);

    if (ar !== 0) {
      p = p && (Math.sign(ar) * Math.abs(bb.width / bb.height - aspectRatio) < ar);
    }

    p = p && (bb.x >= bnds[0]) && (bb.x + bb.width <= bnds[2]);
    p = p && (bb.y >= bnds[1]) && (bb.y + bb.height <= bnds[3]);

    return p;
  }
}

module.exports = Pedestrian;
