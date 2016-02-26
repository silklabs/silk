/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

// Load the regnerator polyfill manually so we don't need to also load all the
// core-js polyfills which we don't actually need...
import regeneratorRuntime from 'babel-runtime/regenerator';
global.regeneratorRuntime = global.regeneratorRuntime || regeneratorRuntime;

import cv from 'opencv';

let log;
let timeline;

let previewScale = 0;

const facecascade = {
  tag: 'face',
  file: 'system/silk/media/opencv/haarcascade_frontalface_alt2.xml',
  opts: {
    scale: 1.1,
    neighbors: 2,
    min: [ 15, 15 ],
  },
};

const eyecascadeOpts = {
  scale: 1.1,
  neighbors: 2,
  min: [ 15, 15 ],
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

const EYE_CASCADE1 = 'system/silk/media/opencv/haarcascade_eye.xml';
const EYE_CASCADE2 = 'system/silk/media/opencv/haarcascade_eye_tree_eyeglasses.xml';

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
    face.detectObject(cascade, eyecascadeOpts, (err, rects) => {
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
function _detectBothEyes(when, orig, faceRect, eyeCascade1, eyeCascade2) {
  // Eye detection requires fullsize image for better detection
  // Adjust face rectangle to scale up to the original size as face detection
  // was run on scaled image
  let face = orig.roi(faceRect.x * previewScale, faceRect.y * previewScale,
      faceRect.width * previewScale, faceRect.height * previewScale);
  face = face.copy();
  face.equalizeHist();
  timeline.addDiagFrame('fullrescandidate', when, face);

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

      let rightEyeRect;
      if (leftEyeRect) {
        // Find right eye. If the eye was not detected, try a different cascade
        rightEyeRect = await _runEyeCascasde(topRightOfFace, eyeCascade1);
        if (!rightEyeRect && eyeCascade2) {
          rightEyeRect = await _runEyeCascasde(topRightOfFace, eyeCascade2);
        }
      }

      timeline.addDiagFrame(`lefteye:${!!leftEyeRect}`, when, topLeftOfFace);
      timeline.addDiagFrame(`righteye:${!!rightEyeRect}`, when, topRightOfFace);

      if (rightEyeRect) {
        // Adjust the eye rectangles because the face border was removed
        // Also scale down the eye rectangles to match preview size
        leftEyeRect.x += leftX;
        leftEyeRect.y += topY;

        leftEyeRect.x = leftEyeRect.x / previewScale;
        leftEyeRect.y = leftEyeRect.y / previewScale;
        leftEyeRect.width = leftEyeRect.width / previewScale;
        leftEyeRect.height = leftEyeRect.height / previewScale;

        leftEye = new cv.Point(faceRect.x + leftEyeRect.x + leftEyeRect.width / 2,
            faceRect.y + leftEyeRect.y + leftEyeRect.height / 2);

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
    face.release();
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

    /*
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
    */

    this._onMotion = when => {
      if (working) {
        log.error(`Still busy, unable to process next preview image`);
        return;
      }
      working = true;

      this._env.camera.getPreviewFrame(when, 'grayeq', (err, im) => {
        if (err) {
          log.warn(`Unable to fetch grayeq frame: ${err}`);
          working = false;
          return;
        }
        this._env.camera.getPreviewFrame(when, 'fullgray', async (err2, orig) => {
          if (err2) {
            log.warn(`Unable to fetch full frame: ${err2}`);
            working = false;
            return;
          }

          // Calculate preview scale
          previewScale = orig.width() / im.width();

          let start = Date.now();
          let faces = [];

          try {
            // Find faces
            let faceRects = await detectFaces(im, 0, 0);
            log.debug(`faces: ${JSON.stringify(faceRects)}`);
            for (let i = 0; i < faceRects.length; i++) {
              let faceRect = faceRects[i];

              let weakface = im.roi(faceRect.x, faceRect.y, faceRect.width, faceRect.height);
              timeline.addDiagFrame('candidate', when, weakface);

              // Detect both eyes
              let [leftEye, rightEye] = await _detectBothEyes(when, orig, faceRect,
                  EYE_CASCADE1, EYE_CASCADE2);

              log.warn('Detect eyes', leftEye, rightEye);
              // Only if both the eyes are visible is when we say it is a face
              if (leftEye && rightEye) {
                faceRect.leftEye = [leftEye.x, leftEye.y];
                faceRect.rightEye = [rightEye.x, rightEye.y];
                faces.push(faceRect);

                const roi = im.roi(faceRect.x, faceRect.y, faceRect.width, faceRect.height);
                timeline.addDiagFrame('face', when, roi);
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
        });
      });
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
