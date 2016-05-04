/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

'use strict';

import FaceDetector from '../lib/face_detector';
import Framework from 'silk-exttest';
import cv from 'opencv';
import path from 'path';
import fs from 'fs';
import mkdirp from 'mkdirp';
import imageSize from 'fast-image-size';

const env = new Framework('face');
const camera = env.camera;

const HAAR = '../../../../../../sim/system/silk/media/opencv/haarcascade_frontalface_alt2.xml';
const DLIB_LANDMARK = '../../../../../../external-dlib/shape_predictor_68_face_landmarks.dat';
let showAnnotations = false;

/**
 * Checks whether a path starts with or contains a hidden file or a folder
 *
 * @param {string} source - The path of the file that needs to be validated
 * returns {boolean} - `true` if the source is blacklisted and otherwise `false`
 */
let isHiddenPath = function (file) {
  return (/(^|\/)\.[^\/\.]/g).test(file);
};

/**
 * Scales normalized rectangles to the custom frame size
 *
 * @param rects Array of normalized rectangles to scale
 * @param width/height Desired scale
 * @return Array of rectangles in the desired scale
 */
function normalRectsToCustom(rects, width, height) {
  const frame = camera.getFrameSize('normal');
  const scaleWidth = width / frame.width;
  const scaleHeight = height / frame.height;

  return rects.map(rect => {
    return {
      x: Math.round(rect.x * scaleWidth),
      y: Math.round(rect.y * scaleHeight),
      width: Math.round(rect.width * scaleWidth),
      height: Math.round(rect.height * scaleHeight),
    };
  });
}

/**
 * Run predictions on all the specified images from FDDB dataset and write
 * detections to files in caltech detection format.
 */
class FacePredictor {
  constructor(fileListPath, dbPath, destPath) {
    this.fileListPath = fileListPath;
    this.dbPath = dbPath;
    this.destPath = destPath;
    this.totalImages = 0;

    if (!fs.existsSync(this.destPath)) {
      throw new Error(`${this.destPath} doesn't exit`);
    }

    this.faceDetector = new FaceDetector(env, path.resolve(__dirname, HAAR),
        path.resolve(__dirname, DLIB_LANDMARK));
  }

  /**
   * Run prediction on each image and return the detected face rectangles
   */
  async detectFaces(fileName) {
    this.totalImages++;
    let filePath = `${this.dbPath}/${fileName}`;
    console.log(`Reading image ${fileName}`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`${filePath} doesn't exit`);
    }
    let when = Date.now();
    await camera.setPreviewFrame(when, filePath);

    // Fetch the current frame in all the different required formats at once
    let [grayeq, highgray, fullgray] = await camera.getFrame(
        when,
        ['grayeq', 'highgray', 'fullgray']
    );

    let [faceRects, weakFaceRects] =
      await this.faceDetector.detect(Date.now(), highgray, 'high', grayeq, fullgray);

    // Normalize rectangle to the size of the original image as faceDetector
    // returns the rectangles in 'normal' size
    let size = imageSize(filePath);
    faceRects = normalRectsToCustom(faceRects, size.width, size.height);
    weakFaceRects = normalRectsToCustom(weakFaceRects, size.width, size.height);

    if (showAnnotations) {
      this.annotateImage(fileName, faceRects, weakFaceRects);
    }

    return [faceRects, weakFaceRects];
  }

  /**
   * Read the specified FDDB File and write predictions in the detections file.
   * Detection file has one line per image. There is one file per FDDB fold.
   */
  async readAndPredict(fddbFile, destFileName) {
    destFileName = `${this.destPath}/${destFileName}`;
    console.log(`Reading FDDB file ${fddbFile}`);

    // Read FDDB file
    let lines = fs.readFileSync(fddbFile).toString().split('\n');

    // For each image listed in the FDDB-fold file run prediction
    let data = '';
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i]) {
        break;
      }
      let fileName = `${lines[i]}.jpg`;

      let [faceRects, weakFaceRects] = await this.detectFaces(fileName);
      console.log(`Weak faces: ${JSON.stringify(weakFaceRects)}`);
      console.log(`Strong faces: ${JSON.stringify(faceRects)}`);

      // Detection format: id x y width height score
      // Write one prediction per line
      for (let j = 0; j < faceRects.length; j++) {
        data = data + `${i + 1} ${faceRects[j].x} ${faceRects[j].y} ` +
            `${faceRects[j].width} ${faceRects[j].height} 1\n`;
      }
    }

    // Write detection results in a file in caltech detection format
    // One file per FDDB fold
    fs.writeFileSync(destFileName, data, 'utf8');
  }

  /**
   * Annotate the image with provided strong and weak faces
   *
   * Strong faces: green color
   * Weak faces: red color
   */
  annotateImage(fileName, faceRects, weakFaceRects) {
    let filePath = `${this.dbPath}/${fileName}`;
    cv.readImage(filePath, function(err, im) {
      if (err) {
        throw err;
      }
      if (im.width() < 1 || im.height() < 1) {
        throw new Error('Image has no size');
      }

      for (let i = 0; i < faceRects.length; i++) {
        im.rectangle([faceRects[i].x, faceRects[i].y], [faceRects[i].width,
            faceRects[i].height], [0, 255, 0]);
      }
      for (let i = 0; i < weakFaceRects.length; i++) {
        im.rectangle([weakFaceRects[i].x, weakFaceRects[i].y],
            [weakFaceRects[i].width, weakFaceRects[i].height], [0, 0, 255]);
      }

      im.save(`./tmp/${fileName.replace(/\//g, '_')}`);
    });
  }

  /**
   *
   */
  async run() {
    if (showAnnotations) {
      mkdirp.sync('./tmp');
    }

    // For all detection files (one per fold)
    let files = fs.readdirSync(this.fileListPath);
    for (let i = 0; i < files.length; i++) {
      if (isHiddenPath(files[i])) {
        continue;
      }
      let index = files[i].indexOf('-ellipseList.txt');
      if (index === -1) {
        await this.readAndPredict(`${this.fileListPath}/${files[i]}`, files[i]);
      }
    }

    console.log(``);
    console.log(`********************`);
    console.log(`Total images: ${this.totalImages}`);
    console.log(`Finished face prediction on ${this.dbPath}`);
    process.exit(0);
  }
}

/*****************************************************************************/
if (process.argv.length < 5) {
  console.log(`Usage:
    fileListPath : Directory containing the list of files for each FDDB fold
    dbPath       : Directory containing original set of test images
    dest         : Directory to store the detection files
    [show]       : Show annotations on the test images`);
  process.exit(1);
}

let fileListPath = process.argv[2];
let dbPath = process.argv[3];
let destPath = process.argv[4];
if (process.argv.length >= 6) {
  if (process.argv[5] === 'true') {
    showAnnotations = true;
  }
}

async function run() {
  try {
    let predictor = new FacePredictor(fileListPath, dbPath, destPath);
    await predictor.run();
  } catch(err) {
    console.error(`Error running face predictor: ${err.stack || err}`);
  }
}

run();
