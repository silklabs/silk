/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

import EventEmitter from 'events';
import fs from 'fs';
import cv from 'opencv';
import silkcv from 'silk-cv';

import {FaceRect, Matrix} from './face';
import safeRoi from './safe_roi.js';

let camera;
let log;
let timeline;

const HAAR = 'system/silk/media/opencv/haarcascade_frontalface_alt2.xml';
const DLIB_LANDMARK = 'system/silk/media/shape_predictor_68_face_landmarks.dat';
const facecascade = {
  classifier: null,
  opts: {
    scale: 1.1,
    neighbors: 2,
    min: [ 15, 15 ],
  },
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

export default class FaceDetector extends EventEmitter {
  _busy: boolean = false;

  constructor(env, haarCascade = HAAR, dlibLandmark = DLIB_LANDMARK) {
    super();
    camera = env.camera;
    log = env.log;
    timeline = env.timeline;

    if (!fs.existsSync(dlibLandmark)) {
      throw new Error(`${dlibLandmark} not available`);
    }
    if (!fs.existsSync(haarCascade)) {
      throw new Error(`${haarCascade} not available`);
    }

    facecascade.classifier = new cv.CascadeClassifier(haarCascade);

    let faceDetector = new silkcv.FaceDetector(dlibLandmark,
      err => {
        if (err) {
          throw err;
        }
        this._faceDetector = faceDetector;
        this.emit('ready');
      }
    );
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

  /**
   * Check if the HoG classifier thinks there's a face in the provided rectangle
   */
  async _checkHogFace(when: number,
                      faceIndex: number,
                      faceRect: FaceRect,
                      frame: Matrix,
                      frameSize /*: CameraFrameSize*/): ?FaceRect {

    if (!this._faceDetector) {
      return null;
    }
    if (this._faceDetector.busy()) {
      throw new Error('FaceDetector should not be busy');
    }

    const start = Date.now();
    const frameRect = camera.normalRectsTo([faceRect], frameSize)[0];

    // Slightly dilate the candidate rectangle to avoid risk of clipping part of
    // the face. TODO: Need to further evaluate how effective this dilate is...
    const DILATE_SIZE = 10;
    frameRect.x -= DILATE_SIZE;
    frameRect.y -= DILATE_SIZE;
    frameRect.width += DILATE_SIZE * 2;
    frameRect.height += DILATE_SIZE * 2;
    let faceIm = safeRoi(frame, frameRect);

    // Resize the face to the "optimal" size for the detector.
    //
    // TODO: HOG detector was trained on 80x80 dataset, but making that
    //       "80x80" assumption right here is dirty.
    faceIm.resize(80 + DILATE_SIZE, 80 + DILATE_SIZE);

    return await new Promise((resolve, reject) => {
      this._faceDetector.detect(
        faceIm,
        (err, faces) => {
          if (err) {
            reject(err);
          }
          const diff = Date.now() - start;
          const diagLabel = `hog_${faceIndex}:${faces.length > 0}:${diff}ms`;
          if (timeline.diagFrameEnabled(diagLabel)) {
            faces.forEach(rect => {
              faceIm.rectangle([rect.x, rect.y], [rect.width, rect.height], null, 2);
            });
            timeline.addDiagFrame(diagLabel, when, faceIm);
          }
          faceIm.release();
          if (faces.length > 0) {
            if (faces.length > 1) {
              log.warn('More than one hog face detected, selecting first');
            }

            // Scale the face back to the dimensions of the caller
            const xScale = faceRect.width / (80 + DILATE_SIZE);
            const yScale = faceRect.height / (80 + DILATE_SIZE);
            const hogFaceRect = faces[0];

            resolve({
              x: hogFaceRect.x * xScale,
              y: hogFaceRect.y * yScale,
              width: hogFaceRect.width * xScale,
              height: hogFaceRect.height * yScale,
              leftEye: [
                hogFaceRect.leftEye[0] * xScale,
                hogFaceRect.leftEye[1] * yScale,
              ],
              rightEye: [
                hogFaceRect.rightEye[0] * xScale,
                hogFaceRect.rightEye[1] * yScale,
              ],
              forehead: {
                x: hogFaceRect.forehead.x * xScale,
                y: hogFaceRect.forehead.y * yScale,
                width: hogFaceRect.forehead.width * xScale,
                height: hogFaceRect.forehead.height * yScale,
              },
            });
          } else {
            resolve(null);
          }
        }
      );
    });
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

        const hogFace = await this._checkHogFace(when, i, faceRect, fullgray, 'full');

        let diagLabel;
        if (hogFace) {
          // Update the face rectangle to what was detected by HOG as it's more
          // reliable than the Haar rectangle
          hogFace.x += faceRect.x;
          hogFace.y += faceRect.y;
          hogFace.leftEye[0] += faceRect.x;
          hogFace.leftEye[1] += faceRect.y;
          hogFace.rightEye[0] += faceRect.x;
          hogFace.rightEye[1] += faceRect.y;
          hogFace.forehead.x += faceRect.x;
          hogFace.forehead.y += faceRect.y;
          faceRect = hogFace;

          faces.push(faceRect);
          diagLabel = `face_${i}`;
        } else {
          weakfaces.push(faceRect);
          diagLabel = `weakface_${i}`;
        }
        if (timeline.diagFrameEnabled(diagLabel)) {
          const roi = safeRoi(grayeq, faceRect);
          timeline.addDiagFrame(
            diagLabel,
            when,
            roi
          );
          roi.release();
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
