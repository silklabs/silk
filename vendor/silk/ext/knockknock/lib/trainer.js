/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import cv from 'opencv';
import fs from 'mz/fs';
import path from 'path';

const TRAIN_FACES_PATH = '/data/silk/opencv/faces';
const TRAIN_FACES_YML = '/data/silk/opencv/face_model.yml';
const TRAIN_FACES_MAP = '/data/silk/opencv/face_map.json';
const FACE_COUNT = 100;

const DESIRED_LEFT_EYE_X = 0.23; // Desired left eye center on a scale of 1.0
const DESIRED_LEFT_EYE_Y = 0.2;
const FACE_ELLIPSE_CY = 0.40;
const FACE_ELLIPSE_W = 0.50; // Controls the width of the face mask
const FACE_ELLIPSE_H = 0.80; // Controls the height of the face mask
const FACE_WIDTH = 75;
const FACE_HEIGHT = FACE_WIDTH;

// Parameters controlling how often to keep new faces when collecting them
// Otherwise, the training set could look too similar to each other
const CHANGE_IN_IMAGE_FOR_COLLECTION = 0.20;
const CHANGE_IN_SECONDS_FOR_COLLECTION = 1000;

let log;

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
 * This class prepares the training data needed for face recognition and them
 * trains the face recognizer using the training data
 */
export default class Trainer {
  constructor(env) {
    this._env = env;
    log = env.log;
    this._trainingData = [];
    this._faceMap = {};
  }

  /**
   * Start face training
   *
   * @param model Face recognizer to be trained
   */
  async start(model) {
    log.info(`Collecting data for face training`);

    // Find everyone for whom we have faces available
    let people = null;
    people = await fs.readdir(TRAIN_FACES_PATH);
    log.debug(`Done reading ${TRAIN_FACES_PATH} and found ${people.length} people`);
    for (let count = 0; count < people.length; count++) {
      if (isHiddenPath(people[count])) {
        log.info(`Ignoring directory ${people[count]}`);
        continue;
      }

      // For each person find all faces and to the training set
      await this._findFaces(count, path.join(TRAIN_FACES_PATH, people[count]));

      // Add id to the face map
      this._faceMap[count] = people[count];
    }

    if (this._trainingData.length <= 0) {
      throw new Error(`No faces available to train; skipping face training`);
    }

    // Train the model using the collected training data
    log.info(`Face training in progress`);
    let start = Date.now();
    await this._trainFaces(model);

    // Save training data in a file
    model.saveSync(TRAIN_FACES_YML);

    // Save face map in a file
    let err = await fs.writeFile(TRAIN_FACES_MAP, JSON.stringify(this._faceMap));
    if (err) {
      throw new Error(`Failed to save ${TRAIN_FACES_MAP}`);
    }

    let diff = Date.now() - start;
    log.info(`Face training finished in ${diff}ms`);
  }

  /**
   * Find faces in the specified directory and add them to the training set
   *
   * @param id integer uniquely identifying this person
   * @param faceDir directory path where faces for this person is stored
   */
  async _findFaces(id, faceDir) {
    try {
      let files = await fs.readdir(faceDir);
      for (let count = 0; count < files.length; count++) {
        let file = files[count];
        if (isHiddenPath(file)) {
          log.info(`Ignoring file ${file}`);
          continue;
        }
        log.debug(`Adding file ${path.join(faceDir, file)}`);
        this._trainingData.push([id, path.join(faceDir, file)]);
      }
    } catch (e) {
      log.warn(`No faces available for ${faceDir}`);
      return;
    }
  }

  /**
   * Calls train method asynchronously to prepare the model for facial
   * recognition
   */
  _trainFaces(model) {
    return new Promise(resolve => {
      model.train(this._trainingData, resolve);
    });
  }

  /**
   * Performs face preprocessing as a combination of:
   *  - Geometrical scaling, rotation and translation using Eye Detection
   *  - Smoothing away image noise using a Bilateral Filter
   *  - Standardize the brightness on both left and right sides of the face
   *    independently using separated Histogram Equalization
   *  - Removal of background and hair using an Elliptical Mask
   *
   *  Reference: https://github.com/MasteringOpenCV/code/blob/master/
   *             Chapter8_FaceRecognition/preprocessFace.cpp
   *  @returns a preprocessed face square image
   */
  _preprocessFace(im, face) {
    const leftEye = {x: face.leftEye[0], y: face.leftEye[1]};
    const rightEye = {x: face.rightEye[0], y: face.rightEye[1]};
    let gray = im.roi(face.x, face.y, face.width, face.height);

    // Since we found both eyes lets rotate & scale & translate the face so that
    // the two eyes line up perfectly with ideal eye positions. This makes sure
    // that eyes will be horizontal, and not too far left or right of the face

    // Get the center between the 2 eyes
    const eyesCenter = new cv.Point((leftEye.x + rightEye.x) * 0.5,
        (leftEye.y + rightEye.y) * 0.5);

    // Get the angle between the 2 eyes
    const dy = (rightEye.y - leftEye.y);
    const dx = (rightEye.x - leftEye.x);
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * 180.0 / cv.Constants.CV_PI; // Convert radians to degrees

    // Get the amount we need to scale the image to be the desired fixed size we
    // want
    const DESIRED_RIGHT_EYE_X = (1.0 - DESIRED_LEFT_EYE_X);
    const desiredLen = (DESIRED_RIGHT_EYE_X - DESIRED_LEFT_EYE_X) * FACE_WIDTH;
    const scale = desiredLen / len;

    // Get the transformation matrix for rotating and scaling the face to the
    // desired angle & size
    let rotMatrix = new cv.Matrix(2, 3, cv.Constants.CV_8UC1);
    rotMatrix.getRotationMatrix2D(angle, eyesCenter.x, eyesCenter.y, scale);

    // Shift the center of the eyes to be the desired center between the eyes
    const adjustx = rotMatrix.get(0, 2) + (FACE_WIDTH * 0.5 - eyesCenter.x);
    const adjusty = rotMatrix.get(1, 2) + (FACE_HEIGHT * DESIRED_LEFT_EYE_Y -
        eyesCenter.y);
    rotMatrix.set(0, 2, adjustx);
    rotMatrix.set(1, 2, adjusty);
    log.debug(`Eye center: ${eyesCenter.x}, ${eyesCenter.y} angle: ${angle}`);

    // Rotate and scale the image to the desired angle, position and size
    // Reference: http://docs.opencv.org/doc/tutorials/imgproc/imgtrans/
    //            warp_affine/warp_affine.html
    gray.warpAffine(rotMatrix, FACE_WIDTH, FACE_HEIGHT);

    // Use the "Bilateral Filter" to reduce pixel noise by smoothing the image,
    // but keeping the sharp edges in the face
    gray.bilateralFilter(0, 20.0, 2.0);

    const cols = gray.width();
    const rows = gray.height();

    // Filter out the corners of the face, since we mainly just care about the
    // middle parts
    // Draw a filled ellipse in the middle of the face-sized image
    let mask = new cv.Matrix(rows, cols, cv.Constants.CV_8UC1, [0]);
    const faceCenter = new cv.Point(FACE_WIDTH / 2,
        Math.round(FACE_HEIGHT * FACE_ELLIPSE_CY));
    const faceWidth = Math.round(FACE_WIDTH * FACE_ELLIPSE_W);
    const faceHeight = Math.round(FACE_HEIGHT * FACE_ELLIPSE_H);
    mask.ellipse(faceCenter.x, faceCenter.y, faceWidth, faceHeight, [255],
        cv.Constants.CV_FILLED);

    // Use the mask to remove outside pixels
    let dstImg = new cv.Matrix(rows, cols, cv.Constants.CV_8UC1, [128, 128, 128]);

    // Apply elliptical mask on the face
    gray.copyWithMask(dstImg, mask);

    return dstImg;
  }

  /**
   * Compare two images by getting the L2 error (square-root of sum of squared error)
   *
   * Reference: http://docs.opencv.org/2.4/modules/core/doc/operations_on_arrays.html#norm
   */
  _getSimilarity(matA, matB) {
    if ((matA.width() == matB.width()) && (matA.width() > 0) &&
        (matA.height() == matB.height()) && (matB.height() > 0)) {
      // Calculate the L2 relative error between the 2 images
      let errorL2 = matA.norm(matB, cv.Constants.NORM_L2);

      // Convert to a reasonable scale, since L2 error is summed across all pixels
      // of the image
      let similarity = errorL2 / (matA.height() * matA.width());
      return similarity;
    } else {
      return Number.MAX_VALUE;
    }
  }

  /**
   * Start collecting faces for the specified person and store the resulting
   * face set to be later used for training for that person
   *
   * @param person String name of the person to train
   */
  addPerson(person) {
    log.info(`Adding faces for ${person}`);
    let faceCount = 1;
    let facePath = path.join(TRAIN_FACES_PATH, person);
    let oldPreprocessedFaceImg = null;
    let oldTime = 0;

    return new Promise((resolve, reject) => {
      fs.mkdir(facePath)
      .catch(e => {
        if (e.code !== 'EEXIST') {
          log.error(`Failed to create ${facePath}, error: ${e}`);
          reject();
        }
      });

      this._onFace = (when, faces, source) => {
        if ((faces.length <= 0) || (source === 'hal')) {
          return;
        }

        if (this._working) {
          log.error(`Still busy, unable to process next preview image`);
          return;
        }

        this._working = true;
        this._env.camera.getPreviewFrame((err, image) => {
          if (err) {
            log.warn(`Unable to fetch frame: ${err}`);
            this._working = false;
            return;
          }

          // Ignore if there are more than one face as we don't know which of
          // the face is the person being trained
          if (faces.length > 1) {
            return;
          }

          // Save the face
          this._working = false;
          let face = faces[0];
          let faceim = this._preprocessFace(image, face);

          // Check if this face looks somewhat different from the previously
          // collected face
          let imageDiff = Number.MAX_VALUE;
          if (oldPreprocessedFaceImg) {
            imageDiff = this._getSimilarity(faceim, oldPreprocessedFaceImg);
            log.debug(`Image diff: ${imageDiff}`);
          }

          // Also record when it happened
          let currentTime = Date.now();
          let timeDiff = currentTime - oldTime;

          // Only process the face if it is noticably different from the
          // previous frame and there has been noticeable time gap
          if ((imageDiff > CHANGE_IN_IMAGE_FOR_COLLECTION) &&
              (timeDiff > CHANGE_IN_SECONDS_FOR_COLLECTION)) {
            log.info(`Saving ${facePath}/${person}_${Date.now()}.jpg, ` +
                 `count: ${faceCount}`);
            faceim.save(`${facePath}/${person}_${Date.now()}.jpg`);
            faceCount++;

            oldPreprocessedFaceImg = faceim;
            oldTime = currentTime;
          }

          if (faceCount >= FACE_COUNT) {
            this._env.timeline.removeListener('face', this._onFace);
            resolve();
          }
        }, when, 1 /* == 1 channel image (RGB not required) */);
      };

      this._env.timeline.on('face', this._onFace);
    });
  }
}
