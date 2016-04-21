#!/usr/bin/env node

/**
 * Transcribed from matlab code with the following license:
 * Copyright (c) 2012, Piotr Dollar
 * All rights reserved.
 *
 */

'use strict';
const fs = require('fs');

const dbInfo = require('./dbInfo');
const bbgt = require('./bbGt');
const Pedestrian = require('./pedestrian');
const Faces = require('./faces');

/**
 * List of experiment settings: { name, hr, vr, ar, overlap, filter }
 *  name     - experiment name
 *  hr       - height range to test
 *  wr       - width range to test
 *  vr       - visibility range to test
 *  ar       - aspect ratio range to test
 *  overlap  - overlap threshold for evaluation
 *  filter   - expanded filtering (see 3.3 in PAMI11)
 */
const experiments = [
  { name: 'Reasonable', hr: [50, Infinity], wr: [-Infinity, Infinity], vr: [0.65, Infinity], ar: 0, overlap: 0.5, filter: 1.25},
  { name: 'All', hr: [20, Infinity], wr: [20, Infinity], vr: [0.2, Infinity], ar: 0, overlap: 0.5, filter: 1.25 },
  { name: 'Scale=large', hr: [100, Infinity], wr: [-Infinity, Infinity], vr: [Infinity, Infinity], ar: 0, overlap: 0.5, filter: 1.25},
  { name: 'Scale=near', hr: [80, Infinity], wr: [-Infinity, Infinity], vr: [Infinity, Infinity], ar: 0, overlap: 0.5, filter: 1.25},
  { name: 'Scale=medium', hr: [30, 80], wr: [-Infinity, Infinity], vr: [Infinity, Infinity], ar: 0, overlap: 0.5, filter: 1.25},
  { name: 'Scale=far', hr: [20, 30], wr: [-Infinity, Infinity], vr: [Infinity, Infinity], ar: 0, overlap: 0.5, filter: 1.25},
  { name: 'Occ=none', hr: [50, Infinity], wr: [-Infinity, Infinity], vr: [Infinity, Infinity], ar: 0, overlap: 0.5, filter: 1.25},
  { name: 'Occ=partial', hr: [50, Infinity], wr: [-Infinity, Infinity], vr: [0.65, 1], ar: 0, overlap: 0.5, filter: 1.25},
  { name: 'Occ=heavy', hr: [50, Infinity], wr: [-Infinity, Infinity], vr: [0.2, 0.65], ar: 0, overlap: 0.5, filter: 1.25},
  { name: 'Ar=all', hr: [50, Infinity], wr: [-Infinity, Infinity], vr: [Infinity, Infinity], ar: 0, overlap: 0.5, filter: 1.25},
  { name: 'Ar=typical', hr: [50, Infinity], wr: [-Infinity, Infinity], vr: [Infinity, Infinity], ar: 0.1, overlap: 0.5, filter: 1.25},
  { name: 'Ar=atypical', hr: [50, Infinity], wr: [-Infinity, Infinity], vr: [Infinity, Infinity], ar: -0.1, overlap: 0.5, filter: 1.25},
  { name: 'Overlap=25', hr: [50, Infinity], wr: [-Infinity, Infinity], vr: [.65, Infinity], ar: 0, overlap: 0.25, filter: 1.25},
  { name: 'Overlap=50', hr: [50, Infinity], wr: [-Infinity, Infinity], vr: [.65, Infinity], ar: 0, overlap: 0.50, filter: 1.25},
  { name: 'Overlap=75', hr: [50, Infinity], wr: [-Infinity, Infinity], vr: [.65, Infinity], ar: 0, overlap: 0.75, filter: 1.25},
  { name: 'Expand=100', hr: [50, Infinity], wr: [-Infinity, Infinity], vr: [.65, Infinity], ar: 0, overlap: 0.5, filter: 1.00},
  { name: 'Expand=125', hr: [50, Infinity], wr: [-Infinity, Infinity], vr: [.65, Infinity], ar: 0, overlap: 0.5, filter: 1.25},
];

// Remaining parameters and constants
const aspectRatio = 0.41;         // Default aspect ratio for all bbs
const bnds = [5, 5, 635, 475];    // Discard bbs outside this pixel range

// Samples for computing area under the curve
const samples = [Math.pow(10, -2), Math.pow(10, -1.75), Math.pow(10, -1.5),
                 Math.pow(10, -1.25), Math.pow(10, -1), Math.pow(10, -0.75),
                 Math.pow(10, -0.5), Math.pow(10, -0.25), Math.pow(10, 0)];

/**
 *
 */
class Evaluator {
  constructor(gtPath, dtPath, dataName) {
    this.gtPath = gtPath;
    this.dtPath = dtPath;
    this.dataName = dataName;
    this.model = null;
  }

  /**
   * Run the evaluator
   */
  run() {
    // Get database info
    let res = dbInfo(this.dataName);
    this.dataName = res.name;
    let setIds = res.setIds;
    let vidIds = res.vidIds;
    let nFrame = res.nFrame;
    let skip = res.skip;
    console.log(`setIds: ${JSON.stringify(setIds)}`);
    console.log(`vidIds: ${JSON.stringify(vidIds)}`);
    console.log(`nFrame: ${JSON.stringify(nFrame)}`);
    console.log(`skip: ${skip}`);

    // Select one or more experiment for evaluation
    let exps = experiments[0];

    // Load detections and ground truth and evaluate
    switch (this.dataName) {
    case 'UsaTest':
      this.model = new Pedestrian();
      break;
    case 'FDDB':
      this.model = new Faces();
      exps = experiments[1];
      break;
    default:
      throw new Error(`Unknown dataset ${this.dataName}`);
    }

    let dt = this.loadDt(setIds, vidIds, nFrame, skip);
    let gt = this.loadGt(setIds, vidIds, skip, exps);
    res = this.evalAlgs(exps, gt, dt);

    // Compute score (true positive rate at each reference point)
    let scores = bbgt.compRoc(res.gtr, res.dtr, samples);
    // console.log(`scores: ${scores}`);

    // Calculate log-average miss rate
    let logs = scores.map(function (score) {
      return Math.log(1 - score);
    });
    let mean = logs.reduce(function(a, b) {
      return a + b;
    });
    mean = mean / logs.length;
    let score = (Math.exp(mean)).toFixed(4);
    console.log(`*************`);
    console.log(`score: ${score}  (Range [0-1], lower the better)`);
    console.log(`*************`);
  }

  /**
   * Load detections for all frames
   */
  loadDt(setIds, vidIds, nFrame, skip) {
    console.log(`Loading detections from ${this.dtPath}`);
    let dt = [];
    for (let s = 0; s < setIds.length; s++) {
      let s1 = setIds[s];
      for (let v = 0; v < vidIds[s].length; v++) {
        let v1 = vidIds[s][v];
        let vName = this.model.formatPath(this.dtPath, s1, v1) + '.txt';
        if (!fs.existsSync(vName)) {
          throw new Error(`File ${vName} doesn't exit`);
        }
        let bb = bbgt.loadDetections(vName, nFrame[s][v], skip);

        // Adjust aspect ratio
        if (this.model.resize) {
          for (let i = 0; i < bb.length; i++) {
            bbgt.resize(bb[i], 1, 0, aspectRatio);
          }
        }

        dt = dt.concat(bb);
      }
    }
    console.log(`loaded detections: ${dt.length}`);
    return dt;
  }

  /**
   * Load ground truth for all frames
   */
  loadGt(setIds, vidIds, skip, exps) {
    let lbls = this.model.labels;

    let gt = [];
    let filterGtFun = this.model.filterGtFun.bind(
        this, exps, bnds, aspectRatio);

    for (let s = 0; s < setIds.length; s++) {
      let s1 = setIds[s];
      for (let v = 0; v < vidIds[s].length; v++) {
        let v1 = vidIds[s][v];
        let vName = this.model.formatPath(this.gtPath, s1, v1);
        if (!fs.existsSync(vName)) {
          throw new Error(`Directory ${vName} doesn't exit`);
        }
        let files = fs.readdirSync(vName);

        let self = this;
        files.forEach(function (file) { // eslint-disable-line no-loop-func
          let iName = `${vName}/${file}`;
          let bb = bbgt.loadAnnotations(iName, lbls, filterGtFun);

          // Adjust aspect ratio
          if (self.model.resize) {
            for (let i = 0; i < bb.length; i++) {
              bbgt.resize([bb[i]], 1, 0, aspectRatio);
            }
          }

          gt.push(bb);
        });
      }
    }
    console.log(`loaded annotations: ${gt.length}`);
    return gt;
  }

  /**
   * Evaluate the specified algorithm on the specified experiment
   *
   * @return An object with fields:
   *         .gtr    - [n x 1] gt result bbs for each frame [x y w h match]
   *         .dtr    - [n x 1] dt result bbs for each frame [x y w h score match]
   *                   where n is the number of total frames
   */
  evalAlgs(exps, gt, dt) {
    console.log(`Evaluating detections against ground truth data`);
    let n = gt.length;
    let gtr = [], dtr = [];
    if (dt.length !== n) {
      throw new Error(`Length of gt and dt should be the same, ` +
          `dt: ${dt.length} gt: ${gt.length}`);
    }
    let hr = [(exps.hr[0] / exps.filter), (exps.hr[1] * exps.filter)];
    let wr = [(exps.wr[0] / exps.filter), (exps.wr[1] * exps.filter)];

    for (let f = 0; f < n; f++) {
      let bb = dt[f];
      let newbb = [];

      // Expanded filtering (see 3.3 in PAMI11)
      for (let i = 0; i < bb.length; i++) {
        if ((bb[i].height >= hr[0] && bb[i].height < hr[1]) &&
            (bb[i].width >= wr[0] && bb[i].width < wr[1])) {
          newbb.push(bb[i]);
        }
      }
      if (bb.length !== newbb.length) {
        console.log(`oldbb: ${JSON.stringify(bb)} newbb: ${JSON.stringify(newbb)}`);
      }
      dt[f] = newbb;

      let res = bbgt.evalRes(gt[f], dt[f], exps.overlap);
      gtr.push(res.gt);
      dtr.push(res.dt);
    }
    return {gtr, dtr};
  }
}

/*****************************************************************************/
// Run evaluator
if (process.argv.length < 5) {
  console.log(`Usage:
    gtPath: Directory containing annotation files
    dtPath: Directory containing detection files
    databaseName: Name of the dataset to use. Supported datasets are 'UsaTest' and
                  'FDDB'. One can specify a subset of a dataset by appending digits
                  to the end of the name (eg. 'UsaTest01' indicates first set of
                  'UsaTest' and 'UsaTest01005' indicate first set, fifth video and
                  'FDDB01001' for first set first fold of FDDB data set.`);
  process.exit(1);
}

let gtPath = process.argv[2];
let dtPath = process.argv[3];
let dataName = process.argv[4];

try {
  let evaluator = new Evaluator(gtPath, dtPath, dataName);
  evaluator.run();
} catch(err) {
  console.error(`Error running evaluator: ${err.stack || err}`);
}
