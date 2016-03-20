/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import cv from 'opencv';
import {
  Matrix,
  FaceRect,
} from './face';

let log;
let timeline;
let previewScale = 0;


const facecascade = {
  classifier: new cv.CascadeClassifier('system/silk/media/opencv/haarcascade_frontalface_alt2.xml'),
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

const EYE_CASCADE1 = {
  classifier: new cv.CascadeClassifier('system/silk/media/opencv/haarcascade_eye.xml'),
  opts: eyecascadeOpts,
};

// #906 - haarcascade_eye_tree_eyeglasses.xml blows up on OS X?!
const EYE_CASCADE2 = process.platform === 'android' && {
  classifier: new
  cv.CascadeClassifier('system/silk/media/opencv/haarcascade_eye_tree_eyeglasses.xml'),
  opts: eyecascadeOpts,
};

/**
 * Call opencv methods to detect faces as defined by {@code cascades}
 *
 * @param im image representing region of interest
 */
function getCascadeRects(cascade: any, im: Matrix): Promise<Array<FaceRect>> {
  const opts = cascade.opts;
  return new Promise((resolve, reject) => {
    cascade.classifier.detectMultiScale(
      im,
      (err, rects) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rects);
      },
      opts.scale,
      opts.neighbors,
      opts.min && opts.min[0],
      opts.min && opts.min[1],
      opts.max && opts.max[0],
      opts.max && opts.max[1],
    );
  });
}

async function getCascadeRect(cascade: any, im: Matrix): ?FaceRect {
  const rects = await getCascadeRects(cascade, im);
  return rects.length > 0 ? rects[0] : null;
}

/**
 * Search for both eyes within the given face image. Note that we can pass a
 * second eyeCascade if we want to search eyes using two different cascades.
 * For example, we could use a regular eye detector as well as an eyeglasses
 * detector, or a left eye detector as well as a right eye detector.
 *
 * Reference: http://image2measure.net/files/Mastering_OpenCV.pdf
 */
function _detectBothEyes(when, orig, faceRect, faceIndex) {
  // Eye detection requires fullsize image for better detection
  // Adjust face rectangle to scale up to the original size as face detection
  // was run on scaled image
  let face = orig.roi(faceRect.x * previewScale, faceRect.y * previewScale,
      faceRect.width * previewScale, faceRect.height * previewScale);
  face = face.copy();
  face.equalizeHist();
  timeline.addDiagFrame(`fullrescandidate_${faceIndex}`, when, face);

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
      let leftEyeRect = await getCascadeRect(EYE_CASCADE1, topLeftOfFace);
      if (!leftEyeRect && EYE_CASCADE2) {
        leftEyeRect = await getCascadeRect(EYE_CASCADE2, topLeftOfFace);
      }

      let rightEyeRect;
      if (leftEyeRect) {
        // Find right eye. If the eye was not detected, try a different cascade
        rightEyeRect = await getCascadeRect(EYE_CASCADE1, topRightOfFace);
        if (!rightEyeRect && EYE_CASCADE2) {
          rightEyeRect = await getCascadeRect(EYE_CASCADE2, topRightOfFace);
        }
      }

      if (timeline.diagFrameEnabled('')) {
        if (rightEyeRect) {
          topLeftOfFace.rectangle([leftEyeRect.x, leftEyeRect.y], [leftEyeRect.width, leftEyeRect.height]);
          topRightOfFace.rectangle([rightEyeRect.x, rightEyeRect.y], [rightEyeRect.width, rightEyeRect.height]);
        }

        timeline.addDiagFrame(`lefteye_${faceIndex}:${!!leftEyeRect}`, when, topLeftOfFace);
        timeline.addDiagFrame(`righteye_${faceIndex}:${!!rightEyeRect}`, when, topRightOfFace);
      }

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

      resolve([leftEye, rightEye]);
    } catch (e) {
      reject(e);
    }
    face.release();
  });
}

export default class FaceDetector {
  _busy: bool = false;

  constructor(env) {
    log = env.log;
    timeline = env.timeline;

    /*
    try {
      const halFaces = await env.camera.getParameterInt('max-num-detected-faces-hw');
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
  }

  async detect(when: number, grayeq: Matrix, fullgray: Matrix): Promise<Array<FaceRect>> {
    if (this._busy) {
      log.warn('FaceDetector is busy, skipping detect()');
      return [];
    }
    this._busy = true;

    // Calculate preview scale
    previewScale = fullgray.width() / grayeq.width();

    let start = Date.now();
    let faces = [];
    let weakfaces = [];

    try {
      // Find faces
      let faceRects = await getCascadeRects(facecascade, grayeq);
      log.debug(`faces: ${JSON.stringify(faceRects)}`);
      for (let i = 0; i < faceRects.length; i++) {
        let faceRect = faceRects[i];

        let weakface = grayeq.roi(faceRect.x, faceRect.y, faceRect.width, faceRect.height);

        // Detect both eyes
        let [leftEye, rightEye] = await _detectBothEyes(when, fullgray, faceRect, i);

        // Only if both the eyes are visible is when we say it is a face
        if (leftEye && rightEye) {
          faceRect.leftEye = [leftEye.x, leftEye.y];
          faceRect.rightEye = [rightEye.x, rightEye.y];
          faces.push(faceRect);

          const roi = grayeq.roi(faceRect.x, faceRect.y, faceRect.width, faceRect.height);
          timeline.addDiagFrame(`face_${i}`, when, roi);
        } else {
          weakfaces.push(faceRect);
          timeline.addDiagFrame(`weakface_${i}`, when, weakface);
        }
      }

      let diff = Date.now() - start;
      let msg = `Ran for ${diff}ms - ` +
        `strong:${faces.length}, weak:${weakfaces.length} faces(s) detected.`;
      if (diff > 500) {
        log.warn(msg); // Time to optimize?
      } else {
        log.verbose(msg);
      }
    } catch (err) {
      log.error(`Face detection error: ${err.stack || err}`);
    }

    this._busy = false;
    return [faces, weakfaces];
  }
}

