/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import cv from 'opencv';
import {
  Eye,
  FaceRect,
  Matrix,
} from './face';

let camera;
let log;
let timeline;


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
function _detectBothEyes(when: number,
                         faceIndex: number,
                         /*inout*/ faceRect: FaceRect,
                         frame: Matrix,
                         frameSize /*: CameraFrameSize*/): [?Eye, ?Eye] {

  // Eye detection requires fullsize image for better detection
  // Adjust face rectangle to scale up to the original size as face detection
  // was run on scaled image

  const fullRect = camera.normalRectsTo([faceRect], frameSize)[0];

  let face = frame.roi(fullRect.x, fullRect.y, fullRect.width, fullRect.height);
  face = face.copy();
  face.equalizeHist();
  timeline.addDiagFrame(`fullrescandidate_${faceIndex}`, when, face);

  const cols = face.width();
  const rows = face.height();
  const leftX = Math.round(cols * EYE_SX);
  const topY = Math.round(rows * EYE_SY);
  const widthX = Math.round(cols * EYE_SW);
  const heightY = Math.round(rows * EYE_SH);
  const rightX = Math.round(cols * (1.0 - EYE_SX - EYE_SW));

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

        rightEyeRect.x += rightX;
        rightEyeRect.y += topY;

        const [normalLeftEyeRect, normalRightEyeRect] =
          camera.normalRectsFrom([leftEyeRect, rightEyeRect], frameSize);

        leftEye = [
          faceRect.x + normalLeftEyeRect.x + normalLeftEyeRect.width / 2,
          faceRect.y + normalLeftEyeRect.y + normalLeftEyeRect.height / 2
        ];
        rightEye = [
          faceRect.x + normalRightEyeRect.x + normalRightEyeRect.width / 2,
          faceRect.y + normalRightEyeRect.y + normalRightEyeRect.height / 2
        ];
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
    camera = env.camera;
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

  async detect(when: number,
               frame: Matrix,
               frameSize /*: CameraFrameSize*/,
               grayeq: Matrix,
               fullgray: Matrix): Promise<Array<FaceRect>> {
    if (this._busy) {
      log.warn('FaceDetector is busy, skipping detect()');
      return [];
    }
    this._busy = true;

    let start = Date.now();
    let faces = [];
    let weakfaces = [];

    try {
      // Find faces
      let faceRects = await getCascadeRects(facecascade, frame);
      faceRects = camera.normalRectsFrom(faceRects, frameSize); // Normalize
      log.debug(`faces: ${JSON.stringify(faceRects)}`);
      for (let i = 0; i < faceRects.length; i++) {
        let faceRect = faceRects[i];

        // Detect both eyes
        let [leftEye, rightEye] = await _detectBothEyes(when, i, faceRect, fullgray, 'full');

        // Only if both the eyes are visible is when we say it is a face
        let diagLabel;
        if (leftEye && rightEye) {
          faceRect.leftEye = leftEye;
          faceRect.rightEye = rightEye;
          faces.push(faceRect);
          diagLabel = `face_${i}`;
        } else {
          weakfaces.push(faceRect);
          diagLabel = `weakface_${i}`;
        }
        if (timeline.diagFrameEnabled(diagLabel)) {
          timeline.addDiagFrame(
            diagLabel,
            when,
            grayeq.roi(faceRect.x, faceRect.y, faceRect.width, faceRect.height)
          );
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

