/**
 * Transcribed from matlab code with the following license:
 * Copyright (c) 2012, Piotr Dollar
 * All rights reserved.
 *
 */

'use strict';
const fs = require('fs');
const path = require('path');
const utils = require('./utilities');

/**
 * Resize the bbs (without moving their centers).
 *
 * If wr>0 or hr>0, the w/h of each bb is adjusted in the following order:
 *  if(hr~=0), h=h*hr; end
 *  if(wr~=0), w=w*wr; end
 *  if(hr==0), h=w/ar; end
 *  if(wr==0), w=h*ar; end
 * Only one of hr/wr may be set to 0, and then only if ar>0. If, however,
 * hr=wr=0 and ar>0 then resizes bbs such that areas and centers are
 * preserved but aspect ratio becomes ar.
 *
 * INPUTS
 *  bb     - [nx4] original bbs
 *  hr     - ratio by which to multiply height (or 0)
 *  wr     - ratio by which to multiply width (or 0)
 *  ar     - [0] target aspect ratio (used only if hr=0 or wr=0)
 *
 * OUTPUT
 *  bb    - [nx4] the output resized bbs
 */
function resize(bb, hr, wr, ar) {
  if (!(hr > 0 && wr > 0) && (ar <= 0)) {
    throw new Error('Either hr or wr should be > 0 or ar should be > 0');
  }
  // Preserve area and center, set aspect ratio
  if ((hr === 0) && (wr === 0)) {
    for (let i = 0; i < bb.length; i++) {
      let a = Math.sqrt(bb[i].width * bb[i].height);
      let ar = Math.sqrt(ar);
      let d = a * ar - bb[i].width;

      bb[i].x = bb[i].x - d / 2;
      bb[i].width = bb[i].width + d;
      d = a / ar - bb[i].height;
      bb[i].y = bb[i].y - d / 2;
      bb[i].height = bb[i].height + d;
    }
    return;
  }

  // Possibly adjust h/w based on hr/wr
  if (hr !== 0) {
    for (let i = 0; i < bb.length; i++) {
      let d = (hr - 1) * bb[i].height;
      bb[i].y = bb[i].y - d / 2;
      bb[i].height = bb[i].height + d;
    }
  }
  if (wr !== 0) {
    for (let i = 0; i < bb.length; i++) {
      let d = (wr - 1) * bb[i].width;
      bb[i].x = bb[i].x - d / 2;
      bb[i].width = bb[i].width + d;
    }
  }

  // Possibly adjust h/w based on ar and NEW h/w
  if (!hr) {
    for (let i = 0; i < bb.length; i++) {
      let d = bb[i].width / ar - bb[i].height;
      bb[i].y = bb[i].y - d / 2;
      bb[i].height = bb[i].height + d;
    }
  }

  if (!wr) {
    for (let i = 0; i < bb.length; i++) {
      let d = bb[i].height * ar - bb[i].width;
      bb[i].x = bb[i].x - d / 2;
      bb[i].width = bb[i].width + d;
    }
  }
}

/**
 * Load a detection file and return a two dimensional array of bounding boxes
 * per frame. If a entry for a frame is missing then add an emtpy array.
 *
 * File format: id x y width height score
 *
 * @return An array of array of objects per frame of the form:
 *         {id, x, y, width, height}
 */
function loadDetections(name, nFrame, skip) {
  let bbs = [];
  let frame = [];
  let lastFrameNum = -1;
  let lines = fs.readFileSync(name).toString().split('\n');
  let nextId = skip;

  let addMissingFrames = function (missingFrames) {
    missingFrames = parseInt(missingFrames);
    for (let i = 0; i < missingFrames; i++) {
      bbs.push([]);
    }
    nextId = nextId + skip * missingFrames;
  };

  lines.forEach(function (line) {
    if (!line) {
      return;
    }
    let bbArray = line.toString().split(' ').map(function (item) {
      return parseFloat(item);
    });
    let bb = {
      id: bbArray[0],
      x: bbArray[1],
      y: bbArray[2],
      width: bbArray[3],
      height: bbArray[4],
      score: bbArray[5],
    };

    // If all the entry for a given id is read add the entry to the list
    if ((lastFrameNum !== -1) && (lastFrameNum !== bb.id)) {
      // If no entry available for a given frame then add an empty
      // entry to the list
      if (lastFrameNum !== nextId) {
        let missingFrames = (lastFrameNum - nextId) / skip;
        addMissingFrames(missingFrames);
      }
      bbs.push(frame);
      frame = [];
      nextId = nextId + skip;
    }
    frame.push(bb);
    lastFrameNum = bb.id;
  });

  // Add the last entry to the list
  if (frame.length) {
    if (lastFrameNum !== nextId) {
      let missingFrames = (lastFrameNum - nextId) / skip;
      addMissingFrames(missingFrames);
    }
    bbs.push(frame);
    nextId = nextId + skip;
  }

  // If there are frames missing at the end of the file then add an empty
  // entry to the list
  if (nextId <= nFrame) {
    let missingFrames = ((nFrame - nextId) / skip) + 1;
    addMissingFrames(missingFrames);
  }
  return bbs;
}

/**
 * Load ground truth annotations from the specified file and return bounding
 * boxes for all objects. Ignore the objects whose bbs don't match the test
 * specified by filterGt.
 *
 * @return An array of objects of the form {id, x, y, width, height, ignore}.
 *         [x y width height] is the bb and ignore is a 0/1 flag that indicates
 *         regions to be ignored. For each returned object, the ignore flag is
 *         set to 0 if `test() == true` for the given object.
 */
function loadAnnotations(name, lbls, filterGt) {
  let bbs = [];
  let lines = fs.readFileSync(name).toString().split('\n');

  // Extract frame Id from the file name
  let filename = path.basename(name, '.txt');
  let frameId = parseInt(filename.slice(-5));

  lines.forEach(function (line) {
    // Skip empty line as well as the version info line
    if (!line || (line.indexOf('bbGt version') !== -1)) {
      return;
    }
    let bbArray = line.toString().split(' ');
    let lbl = bbArray[0];
    let pos = {
      id: frameId,
      x: parseInt(bbArray[1]),
      y: parseInt(bbArray[2]),
      width: parseInt(bbArray[3]),
      height: parseInt(bbArray[4]),
      ignore: 0,
    };
    let posv = {
      x: parseInt(bbArray[6]),
      y: parseInt(bbArray[7]),
      width: parseInt(bbArray[8]),
      height: parseInt(bbArray[9]),
    };

    // Check if object label is not in the lbls list
    if (lbls.indexOf(lbl) < 0 ) {
      return;
    }

    // Check if object bb meets the filter criteria
    if (filterGt && !filterGt(lbl, pos, posv)) {
      pos.ignore = 1;
    }

    bbs.push(pos);
  });
  return bbs;
}

/**
 * Filter ground truth bounding boxes.
 *
 * @return true if the bb satisfies the filter criteria, false otherwise
 */
function filterGtFun(hr, vr, ar, bnds, aspectRatio, lbl, bb, bbv) {
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

/**
 * Compute (modified) overlap area between pairs of bbs.
 *
 * Uses modified Pascal criteria with "ignore" regions. The overlap area
 * (oa) of a ground truth (gt) and detected (dt) bb is defined as:
 *  oa(gt,dt) = area(intersect(dt,dt)) / area(union(gt,dt))
 * In the modified criteria, a gt bb may be marked as "ignore", in which
 * case the dt bb can can match any subregion of the gt bb. Choosing gt' in
 * gt that most closely matches dt can be done using gt'=intersect(dt,gt).
 * Computing oa(gt',dt) is equivalent to:
 *  oa'(gt,dt) = area(intersect(gt,dt)) / area(dt)
 *
 * INPUTS
 *  dt       - [m] detected bbs
 *  gt       - [n] gt bbs
 *
 * OUTPUTS
 *  oas      - [m x n] overlap area between each gt and each dt bb
 */
function compOas(dt, gt) {
  let m = dt.length;
  let n = gt.length;
  let oa = utils.createArray(m, n);

  for (let i = 0; i < m; i++) {
    let de = [dt[i].x + dt[i].width, dt[i].y + dt[i].height];
    let da = dt[i].width * dt[i].height;

    for (let j = 0; j < n; j++) {
      oa[i][j] = 0;
      let ge = [gt[j].x + gt[j].width, gt[j].y + gt[j].height];
      let ga = gt[j].width * gt[j].height;

      let w = Math.min(de[0], ge[0]) - Math.max(dt[i].x, gt[j].x);
      if (w <= 0) {
        continue;
      }
      let h = Math.min(de[1], ge[1]) - Math.max(dt[i].y, gt[j].y);
      if (h <= 0) {
        continue;
      }

      let t = w * h;
      let u = 0;
      if (gt[j].ignore) {
        u = da;
      } else {
        u = da + ga - t;
      }
      oa[i][j] = t / u;
    }
  }
  return oa;
}

/**
 * Evaluate detections against ground truth data
 *
 * Uses modified Pascal criteria that allows for "ignore" regions. The
 * Pascal criteria states that a ground truth bounding box (gtBb) and a
 * detected bounding box (dtBb) match if their overlap area (oa):
 *  oa(gtBb,dtBb) = area(intersect(gtBb,dtBb)) / area(union(gtBb,dtBb))
 * is over a sufficient threshold (typically .5). In the modified criteria,
 * the dtBb can match any subregion of a gtBb set to "ignore". Choosing
 * gtBb' in gtBb that most closely matches dtBb can be done by using
 * gtBb'=intersect(dtBb,gtBb). Computing oa(gtBb',dtBb) is equivalent to
 *  oa'(gtBb,dtBb) = area(intersect(gtBb,dtBb)) / area(dtBb)
 * For gtBb set to ignore the above formula for oa is used.
 *
 * Highest scoring detections are matched first. Matches to standard,
 * (non-ignore) gtBb are preferred. Each dtBb and gtBb may be matched at
 * most once, except for ignore-gtBb which can be matched multiple times.
 * Unmatched dtBb are false-positives, unmatched gtBb are false-negatives.
 * Each match between a dtBb and gtBb is a true-positive, except matches
 * between dtBb and ignore-gtBb which do not affect the evaluation criteria.
 *
 * Each gt/dt output row has a flag match that is either -1/0/1:
 *  for gt: -1=ignore,  0=fn [unmatched],  1=tp [matched]
 *  for dt: -1=ignore,  0=fp [unmatched],  1=tp [matched]
 *
 * INPUTS
 *  gt0  - [mx5] ground truth array with rows [x y w h ignore]
 *  dt0  - [nx5] detection results array with rows [x y w h score]
 *  thr  - [.5] the threshold on oa for comparing two bbs
 *
 * OUTPUTS
 *  gt   - [mx5] ground truth results [x y w h match]
 *  dt   - [nx6] detection results [x y w h score match]
 */
function evalRes(gt0, dt0, thr) {
  // Check inputs
  let nd = dt0.length;
  let ng = gt0.length;

  // Sort dt highest score first, sort gt ignore last
  dt0.sort((a, b) => {
    return (a.score > b.score) ? -1 : ((a.score === b.score) ? 0 : 1);
  });
  gt0.sort((a, b) => {
    return (a.ignore < b.ignore) ? -1 : ((a.score === b.score) ? 0 : 1);
  });
  let gt = gt0.map(function (oldgt) {
    let newgt = Object.assign({}, oldgt);
    newgt.match = -(oldgt.ignore);
    return newgt;
  });

  let dt = dt0.map(function (olddt) {
    let newdt = Object.assign({}, olddt);
    newdt.match = 0;
    return newdt;
  });

  // Computer area of intersections
  let oa = compOas(dt0, gt0);

  // Attempt to match each (sorted) dt to each (sorted) gt
  for (let d = 0; d < nd; d++) {
    let bstOa = thr, bstg = 0, bstm = 0; // Info about best match so far
    for (let g = 0; g < ng; g++) {
      // If this gt already matched, continue to next gt
      let m = gt[g].match;
      if (m === 1) {
        continue;
      }
      // If dt already matched, and on ignore gt, nothing more to do
      if (bstm !== 0 && m === -1 ) {
        break;
      }
      // Compute overlap area, continue to next gt unless better match made
      if (oa[d][g] < bstOa) {
        continue;
      }
      // Match successful and best so far, store appropriately
      bstOa = oa[d][g];
      bstg = g;
      if (m === 0) {
        bstm = 1;
      } else {
        bstm = -1;
      }
    }
    // Store type of match for both dt and gt
    if (bstm === -1) {
      dt[d].match = bstm;
    } else if (bstm === 1) {
      gt[bstg].match = bstm;
      dt[d].match = bstm;
    }
  }

  return {gt, dt};
}

/**
 * Compute ROC on outputs of evalRes on multiple images.
 *
 * ROC = "Receiver operating characteristic"
 * Also computes result at reference points (ref):
 *  which for ROC curves is the *detection* rate at reference *FPPI*
 * Note, FPPI = "false positive per image"
 *
 * INPUTS
 *  gt         - {1xn} first output of evalRes() for each image
 *  dt         - {1xn} second output of evalRes() for each image
 *  ref        - [] reference points for ROC or PR curve
 *
 * OUTPUTS
 *  scores     - recall or precision at each reference point
 */
function compRoc(gt, dt, ref) {
  let nImg = gt.length;
  if (dt.length !== nImg) {
    throw new Error('gt and dt lengths should match');
  }

  // Convert to single matrix, discard ignore bbs
  let newgt = [];
  for (let i = 0; i < gt.length; i++) {
    let gti = gt[i];
    for (let j = 0; j < gti.length; j++) {
      if (gti[j].match !== -1) {
        newgt.push(gti[j]);
      }
    }
  }
  gt = newgt;

  let newdt = [];
  for (let i = 0; i < dt.length; i++) {
    let dti = dt[i];
    for (let j = 0; j < dti.length; j++) {
      if (dti[j].match !== -1) {
        newdt.push(dti[j]);
      }
    }
  }
  dt = newdt;

  /** Compute results */
  let scores = [];
  if (dt.length === 0) {
    return scores;
  }
  let m = ref.length;
  let np = gt.length;

  // Sort dt highest score first
  dt.sort((a, b) => {
    return (a.score > b.score) ? -1 : ((a.score === b.score) ? 0 : 1);
  });

  // Get the cumulative count of false positives and true positives
  let fp = [], tp = [];
  let fpSum = 0, tpSum = 0;
  for (let i = 0; i < dt.length; i++) {
    if (dt[i].match === 1) {
      tpSum++;
    } else {
      fpSum++;
    }
    tp.push(tpSum);
    fp.push(fpSum);
  }

  // Compute false positives per image for x-asis and miss rate for y-axis
  let xs = [], ys = [];
  xs.push(-Infinity);
  ys.push(0);
  for (let i = 0; i < dt.length; i++) {
    xs.push(parseFloat((fp[i] / nImg).toFixed(4)));
    ys.push(parseFloat((tp[i] / np).toFixed(4)));
  }

  for (let i = 0; i < m; i++) {
    let j = 0;

    while (xs[j] <= ref[i]) {
      j++;
    }
    scores.push(ys[j]);
  }
  return scores;
}

module.exports = {
  resize,
  loadDetections,
  loadAnnotations,
  filterGtFun,
  evalRes,
  compRoc,
};
