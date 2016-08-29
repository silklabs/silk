#!/usr/bin/env node

/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

'use strict';

const cv = require('opencv');
const fs = require('fs');
const mkdirp = require('mkdirp');
const utils = require('./evaluator/utilities');

let showAnnotations = false;

/**
 * This class converts the annotations (ground truth) format from FDDB faces
 * dataset to the format required by the model evaluator (dbEval).
 *
 * Note: FDDB faces are represented as ellipse however the dbEval tool expects
 * the bounding boxes to be rectangles.
 */
class GtConverter {
  constructor(gtPath, destPath, dbPath) {
    this.gtPath = gtPath;
    this.destPath = destPath;
    this.dbPath = dbPath;
    this.totalFaces = 0;
    this.totalImages = 0;
  }

 /**
  * Read face annotation for a given image and store in a annotations file
  * at the specified destination after converting it bbgt format.
  * Reference: http://vision.ucsd.edu/~pdollar/toolbox/doc/detector/bbGt.html
  *
  * There is one gt file created per image for a given fold.
  *
  * Format of each FDDB face annotation is:
  *  <major_axis_radius minor_axis_radius angle center_x center_y 1>
  */
  readAnnotations(lines, index, faceCount, fileName, destination) {
    this.totalImages++;
    this.totalFaces = this.totalFaces + faceCount;

   // Read face ellipse
    console.log(`Annotations for ${fileName}, faceCount: ${faceCount}`);
    let bbArrays = [];
    let bbRects = [];
    if (faceCount <= 0) {
      throw new Error(`Face count is ${faceCount} for ${fileName}`);
    }

    let data = '% bbGt version=3\n';
    for (let count = 0; count < faceCount; count++) {
      let bbArray = this.readBB(lines[index + count]);
      let bb = this.ellipseBB(bbArray[3], bbArray[4], bbArray[1], bbArray[0], bbArray[2]);
      console.log(`BB: ${JSON.stringify(bb)}`);

     //  Each bbgt annotation has the following fields:
     //   lbl  - a string label describing object type
     //   bb   - [l t w h]: bb indicating predicted object extent
     //   occ  - 0/1 value indicating if bb is occluded
     //   bbv  - [l t w h]: bb indicating visible region (may be [0 0 0 0])
     //   ign  - 0/1 value indicating bb was marked as ignore
     //   ang  - [0-360] orientation of bb in degrees
      data = data + `face ${bb.x} ${bb.y} ${bb.width} ${bb.height} 0 0 0 0 0 0 0\n`;
      if (showAnnotations) {
        bbArrays.push(bbArray);
        bbRects.push(bb);
      }
    }

   // Write annotations to the file (one gt file per image)
    fs.writeFileSync(`${destination}/I${utils.leftPad(this.totalImages, 5)}.txt`, data,
       'utf8');

    if (showAnnotations) {
      this.annotateImage(fileName, bbArrays, bbRects, this.totalImages);
    }
  }

 /**
  * Read all annotations from a annotations file for a given FDDB fold
  *
  * File format:
  *   <image name i>
  *   <number of faces in this image = im>
  *   <face i1>
  *   <face i2>
  *   ...
  *   <face im>
  */
  readAnnotationsFile(gt, destination) {
    destination = `${this.destPath}/${destination}`;
    if (!fs.existsSync(destination)) {
      mkdirp.sync(destination);
    }

   // Read gtFile
    let lines = fs.readFileSync(gt).toString().split('\n');

    for (let i = 0; i < lines.length;) {
      if (!lines[i]) {
        return;
      }
      let fileName = `${lines[i++]}.jpg`;
      let faceCount = parseInt(lines[i++]);

      this.readAnnotations(lines, i, faceCount, fileName, destination);
      i = i + faceCount;
    }
  }

 /**
  * Annotate the image with original FDDB ellipse as well as the corresponding
  * BB rectangle
  */
  annotateImage(fileName, bbEllipse, bbRect, imageCount) {
    let filePath = `${this.dbPath}/${fileName}`;
    cv.readImage(filePath, function(err, im) {
      if (err) {
        throw err;
      }
      if (im.width() < 1 || im.height() < 1) {
        throw new Error('Image has no size');
      }

      for (let i = 0; i < bbEllipse.length; i++) {
        im.ellipse({center: {x: bbEllipse[i][3], y: bbEllipse[i][4]},
           axes: {width: bbEllipse[i][1], height: bbEllipse[i][0]},
           angle: bbEllipse[i][2]});
        im.rectangle([bbRect[i].x, bbRect[i].y], [bbRect[i].width,
           bbRect[i].height]);
      }

     // let tmp = fileName.replace(/\//g, '_');
      im.save(`./tmp/${fileName.replace(/\//g, '_')}`);
    });
  }

 /**
  * This function returns an axis aligned bounding box for a given ellipse
  * Reference http://www.iquilezles.org/www/articles/ellipses/ellipses.htm
  */
  ellipseBB(ellipseCenterX, ellipseCenterY,
     ellipseRadiusX, ellipseRadiusY, ellipseAngle) {
    let angle = ellipseAngle * Math.PI / 180;
    let a = ellipseRadiusX * Math.cos(angle);
    let b = ellipseRadiusY * Math.sin(angle);
    let c = ellipseRadiusX * Math.sin(angle);
    let d = ellipseRadiusY * Math.cos(angle);
    let width = (Math.sqrt(Math.pow(a, 2) + Math.pow(b, 2)) * 2).toFixed(4);
    let height = (Math.sqrt(Math.pow(c, 2) + Math.pow(d, 2)) * 2).toFixed(4);
    let x = (ellipseCenterX - width * 0.5).toFixed(4);
    let y = (ellipseCenterY - height * 0.5).toFixed(4);

    return {x, y, width, height};
  }

 /**
  *
  */
  readBB(line) {
    let bbArray = line.split(' ').map(function (item) {
      return parseFloat(item);
    });
    return bbArray;
  }

 /**
  * Run the convertor
  */
  run() {
    if (showAnnotations) {
      mkdirp.sync('./tmp');
    }

   // For all annotation files (one per fold)
    let files = fs.readdirSync(this.gtPath);
    let self = this;
    files.forEach(function (file) {
      let index = file.indexOf('-ellipseList.txt');
      if (index !== -1) {
        self.readAnnotationsFile(`${self.gtPath}/${file}`,
           file.substring(0, index));
      }
    });
    console.log(``);
    console.log(`********************`);
    console.log(`Total images: ${this.totalImages}`);
    console.log(`Total faces found: ${this.totalFaces}`);
  }
}

/*****************************************************************************/
if (process.argv.length < 4) {
  console.log(`Usage:
    gtPath   : Path to FDDB annotations files
    dest     : Path to the destination annotation files
    [show]   : Show annotations on the test images
    [dbPath] : Database path containing test images if show option is specified`);
  process.exit(1); //eslint-disable-line no-process-exit
}

let gtPath = process.argv[2];
let destPath = process.argv[3];
let dbPath = '';

if (process.argv.length >= 5) {
  if (process.argv[4] === 'true') {
    showAnnotations = true;

    if (process.argv.length === 5) {
      console.log(`Path to test images is required if show annotations option is true`);
      process.exit(1); //eslint-disable-line no-process-exit
    }
  }
  dbPath = process.argv[5];
}

try {
  let convertor = new GtConverter(gtPath, destPath, dbPath);
  convertor.run();
} catch (err) {
  console.error(`Error running convertor: ${err.stack || err}`);
}
