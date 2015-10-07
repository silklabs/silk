/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

let log;
let timeline;

const facecascade = {
  tag: 'face', file: '/system/silk/media/opencv/haarcascade_frontalface_alt2.xml',
  opts: {
    scale: 1.2,
    neighbors: 2,
  },
};

// Find both eyes in roughly 40% of detected faces
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
function _detectBothEyes(face, eyeCascade1, eyeCascade2) {
  let cols = face.width();
  let rows = face.height();
  let leftX = Math.round(cols * EYE_SX);
  let topY = Math.round(rows * EYE_SY);
  let widthX = Math.round(cols * EYE_SW);
  let heightY = Math.round(rows * EYE_SH);
  let rightX = Math.round(cols * (1.0 - EYE_SX - EYE_SW));

  let topLeftOfFace = face.roi(leftX, topY, widthX, heightY);
  let topRightOfFace = face.roi(rightX, topY, widthX, heightY);
  let leftEyeRect = null;
  let rightEyeRect = null;

  return new Promise(async (resolve, reject) => {
    try {
      // Find left eye. If the eye was not detected, try a different cascade
      leftEyeRect = await _runEyeCascasde(topLeftOfFace, eyeCascade1);
      if (!leftEyeRect && eyeCascade2) {
        leftEyeRect = await _runEyeCascasde(topLeftOfFace, eyeCascade2);
      }

      // Find right eye. If the eye was not detected, try a different cascade
      rightEyeRect = await _runEyeCascasde(topRightOfFace, eyeCascade1);
      if (!rightEyeRect && eyeCascade2) {
        rightEyeRect = await _runEyeCascasde(topRightOfFace, eyeCascade2);
      }

      // Adjust the eye rectangles because the face border was removed
      if (leftEyeRect) {
        leftEyeRect.x += leftX;
        leftEyeRect.y += topY;
      }

      if (rightEyeRect) {
        rightEyeRect.x += rightX;
        rightEyeRect.y += topY;
      }

      log.debug(`eyes: ${JSON.stringify(leftEyeRect)} ${JSON.stringify(rightEyeRect)}`);
      resolve([leftEyeRect, rightEyeRect]);
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

  _init() {
    log = this._env.log;
    timeline = this._env.timeline;
    let working = false;

    this._onMotion = when => {
      if (working) {
        log.error(`Still busy, unable to process next preview image`);
        return;
      }
      working = true;

      let start = Date.now();
      this._env.camera.getPreviewFrame(async (err, im) => {
        if (err) {
          log.warn(`Unable to fetch frame: ${err}`);
          working = false;
          return;
        }
        let diff = Date.now() - start;
        log.verbose(`Acquired preview image in ${diff}ms`);

        // Fake a "motion" rectangle since the "preview" timeline event is being
        // used at the moment.
        let rects = [{ x: 0, y: 0, width: im.width(), height: im.height() }];

        // Restrict object detection to a section of the image that shows motion
        if (rects.length > 1) {
          log.warn(`More than one (${rects.length}) motion rectangles received`);
        }
        let motionRect = rects[0]; // Only one motion rectangle is supported right now
        let motion = im.roi(motionRect.x, motionRect.y, motionRect.width, motionRect.height);

        start = Date.now();
        let faces = [];

        try {
          // Find faces
          let faceRects = await detectFaces(motion, motionRect.x, motionRect.y);
          log.debug(`faces: ${JSON.stringify(faceRects)}`);
          for (let i = 0; i < faceRects.length; i++) {
            let faceRect = faceRects[i];

            // Detect both eyes
            let faceim = im.roi(faceRect.x, faceRect.y, faceRect.width, faceRect.height);
            let [leftEye, rightEye] = await _detectBothEyes(faceim, EYE_CASCADE1,
                EYE_CASCADE2);

            // Only if both the eyes are visible is when we say it is a face
            if (leftEye && rightEye) {
              faces.push(faceRect);
            }
          }

          diff = Date.now() - start;
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
