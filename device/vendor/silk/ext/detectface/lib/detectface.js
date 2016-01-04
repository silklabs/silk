/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import cv from 'opencv';

let log;
let timeline;

let previewScale = 0;

const facecascade = {
  tag: 'face', file: '/system/silk/media/opencv/haarcascade_frontalface_alt2.xml',
  opts: {
    scale: 1.2,
    neighbors: 2,
  },
};

// For eye detection, it is important to crop the input image to just show the
// approximate eye region. If we just do eye detection on a whole face or whole
// photo then it will be much slower and less reliable. Different eye detectors
// are better suited to different regions of the face, for example, the
// haarcascade_eye.xml detector works best if it only searches in a very tight
// region around the actual eye.
// Reference: http://image2measure.net/files/Mastering_OpenCV.pdf Chapter 8
// (Eye search regions)
const EYE_SX = 0.16;
const EYE_SY = 0.26;
const EYE_SW = 0.30;
const EYE_SH = 0.28;

const EYE_CASCADE1 = '/system/silk/media/opencv/haarcascade_eye.xml';
const EYE_CASCADE2 = '/system/silk/media/opencv/haarcascade_eye_tree_eyeglasses.xml';

/**
 * Call opencv methods to detect faces as defined by {@code cascades}
 *
 * @param im image representing region of interest
 * @param motionx x-coord of im within the original preview image
 * @param motiony y-coord of im within the original preview image
 */
function detectFaces(im, motionx, motiony) {
  return new Promise(resolve => {
    im.detectObject(facecascade.file, facecascade.opts, (err, rects) => {
      if (err) {
        throw err;
      }
      if (rects.length > 0) {
        // Adjust rectangle's position within the original preview image
        let newRects = rects.map(rect => {
          let newRect = rect;
          newRect.x += motionx;
          newRect.y += motiony;
          return newRect;
        });
        resolve(newRects);
      } else {
        resolve([]);
      }
    });
  });
}

/**
 * Run eye cascade to confirm that the image is a face
 */
function _runEyeCascasde(face, cascade) {
  return new Promise((resolve, reject) => {
    face.detectObject(cascade, {}, (err, rects) => {
      if (err) {
        reject(err);
        return;
      }
      if (rects.length > 0) {
        resolve(rects[0]);
      }
      resolve(null);
    });
  });
}

/**
 * Search for both eyes within the given face image. Note that we can pass a
 * second eyeCascade if we want to search eyes using two different cascades.
 * For example, we could use a regular eye detector as well as an eyeglasses
 * detector, or a left eye detector as well as a right eye detector.
 *
 * Reference: http://image2measure.net/files/Mastering_OpenCV.pdf
 */
function _detectBothEyes(orig, faceRect, eyeCascade1, eyeCascade2) {
  // Eye detection requires fullsize image for better detection
  // Adjust face rectangle to scale up to the original size as face detection
  // was run on scaled image
  let face = orig.roi(faceRect.x * previewScale, faceRect.y * previewScale,
      faceRect.width * previewScale, faceRect.height * previewScale);
  face.convertGrayscale();
  face.equalizeHist();

  let cols = face.width();
  let rows = face.height();
  let leftX = Math.round(cols * EYE_SX);
  let topY = Math.round(rows * EYE_SY);
  let widthX = Math.round(cols * EYE_SW);
  let heightY = Math.round(rows * EYE_SH);
  let rightX = Math.round(cols * (1.0 - EYE_SX - EYE_SW));

  let topLeftOfFace = face.roi(leftX, topY, widthX, heightY);
  let topRightOfFace = face.roi(rightX, topY, widthX, heightY);

  let leftEye = null;
  let rightEye = null;

  return new Promise(async (resolve, reject) => {
    try {
      // Find left eye. If the eye was not detected, try a different cascade
      let leftEyeRect = await _runEyeCascasde(topLeftOfFace, eyeCascade1);
      if (!leftEyeRect && eyeCascade2) {
        leftEyeRect = await _runEyeCascasde(topLeftOfFace, eyeCascade2);
      }

      // Find right eye. If the eye was not detected, try a different cascade
      let rightEyeRect = await _runEyeCascasde(topRightOfFace, eyeCascade1);
      if (!rightEyeRect && eyeCascade2) {
        rightEyeRect = await _runEyeCascasde(topRightOfFace, eyeCascade2);
      }

      // Adjust the eye rectangles because the face border was removed
      // Also scale down the eye rectangles to match preview size
      if (leftEyeRect) {
        leftEyeRect.x += leftX;
        leftEyeRect.y += topY;

        leftEyeRect.x = leftEyeRect.x / previewScale;
        leftEyeRect.y = leftEyeRect.y / previewScale;
        leftEyeRect.width = leftEyeRect.width / previewScale;
        leftEyeRect.height = leftEyeRect.height / previewScale;

        leftEye = new cv.Point(faceRect.x + leftEyeRect.x + leftEyeRect.width / 2,
            faceRect.y + leftEyeRect.y + leftEyeRect.height / 2);
      }

      if (rightEyeRect) {
        rightEyeRect.x += rightX;
        rightEyeRect.y += topY;

        rightEyeRect.x = rightEyeRect.x / previewScale;
        rightEyeRect.y = rightEyeRect.y / previewScale;
        rightEyeRect.width = rightEyeRect.width / previewScale;
        rightEyeRect.height = rightEyeRect.height / previewScale;

        rightEye = new cv.Point(faceRect.x + rightEyeRect.x + rightEyeRect.width / 2,
            faceRect.y + rightEyeRect.y + rightEyeRect.height / 2);
      }

      log.debug(`eyes: ${JSON.stringify(leftEyeRect)} ${JSON.stringify(rightEyeRect)}`);
      resolve([leftEye, rightEye]);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Detect a face in the camera frame
 */
class DetectFace {
  constructor(env) {
    this._env = env;
    this._init();
  }

  /**
   *
   */
  willUnload() {
    if (this._onMotion) {
      timeline.removeListener('motion', this._onMotion);
    }
  }

  async _init() {
    timeline = this._env.timeline;
    log = this._env.log;
    let working = false;

    try {
      const halFaces = await this._env.camera.getParameterInt('max-num-detected-faces-hw');
      log.verbose(`HAL faces: ${halFaces}`);
      if (halFaces > 0) {
        log.info(`Disabling opencv face detection`);
        return;
      }
    } catch (err) {
      log.error(`${err}`);
      return;
    }

    this._onMotion = when => {
      if (working) {
        log.error(`Still busy, unable to process next preview image`);
        return;
      }
      working = true;

      this._env.camera.getPreviewFrame(async (err, im, orig) => {
        if (err) {
          log.warn(`Unable to fetch frame: ${err}`);
          working = false;
          return;
        }
        // Calculate preview scale
        previewScale = orig.width() / im.width();

        // Fake a "motion" rectangle since the "preview" timeline event is being
        // used at the moment.
        let rects = [{ x: 0, y: 0, width: im.width(), height: im.height() }];

        // Restrict object detection to a section of the image that shows motion
        if (rects.length > 1) {
          log.warn(`More than one (${rects.length}) motion rectangles received`);
        }
        let motionRect = rects[0]; // Only one motion rectangle is supported right now
        let motion = im.roi(motionRect.x, motionRect.y, motionRect.width, motionRect.height);

        let start = Date.now();
        let faces = [];

        try {
          // Find faces
          let faceRects = await detectFaces(motion, motionRect.x, motionRect.y);
          log.debug(`faces: ${JSON.stringify(faceRects)}`);
          for (let i = 0; i < faceRects.length; i++) {
            let faceRect = faceRects[i];

            // Detect both eyes
            let [leftEye, rightEye] = await _detectBothEyes(orig, faceRect,
                EYE_CASCADE1, EYE_CASCADE2);

            // Only if both the eyes are visible is when we say it is a face
            if (leftEye && rightEye) {
              faceRect.leftEye = [leftEye.x, leftEye.y];
              faceRect.rightEye = [rightEye.x, rightEye.y];
              faces.push(faceRect);
            }
          }

          let diff = Date.now() - start;
          let msg = `Cascade ran for ${diff}ms`;
          if (diff > 500) {
            log.warn(msg); // Time to optimize?
          } else {
            log.verbose(msg);
          }

          this._notifyObjs({tag: facecascade.tag, when, rects: faces});
        } catch (e) {
          log.error(`Error running face detection: ${e}`);
        }
        working = false;
      }, when, 1 /* == 1 channel image (RGB not required) */);
    };

    timeline.on('motion', this._onMotion);
  }

  /**
   * Notify timeline of the new faces detected
   * @param faces
   */
  _notifyObjs(faces) {
    let what;
    if (faces.rects.length > 0) {
      what = `${faces.tag}=${faces.rects.length}`;
      timeline.addObjects([faces]);
    } else {
      what = ' -';
    }
    log.info(`Detected faces:${what}`);
  }
}

module.exports = (env) => new DetectFace(env);
