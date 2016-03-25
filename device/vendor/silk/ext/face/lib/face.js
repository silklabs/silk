/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import movingAverage from 'moving-average';
import type { Env, Log } from 'silk-sdk-glue/interface/env';

export type Matrix = any;
export type Eye = [number, number]; // center x,y

/**
 * Type representing a face
 *
 * @property {number} x x co-ordinate of the object rectangle
 * @property {number} y y co-ordinate of the object rectangle
 * @property {number} width width of the object rectangle
 * @property {number} height height of the object rectangle
 */
export type FaceRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  leftEye: ?Eye;
  rightEye: ?Eye;
};

export type FaceId = number; // index into face database

const CHANGE_THRESHOLD = 30;
const FACE_DETECT_INTERVAL = 1000;
const FACE_AVERAGE_DURATION = 2000;

const FACE_MOVEMENT_NOT_CHANGED = 'notchanged';
const FACE_MOVEMENT_CLOSER = 'closer';
const FACE_MOVEMENT_FARTHER = 'farther';
let FaceMovementType = FACE_MOVEMENT_NOT_CHANGED | FACE_MOVEMENT_CLOSER | FACE_MOVEMENT_FARTHER;

let log: Log;

/**
 *
 */
export class Face {
  id: number; // Unique object Id
  name: string; // name identified for the face
  rect: FaceRect; // Last known location
  rectWhen: number; // Time when `rect` was last updated
  percentTrained: number = 0;
  movement: FaceMovementType;
  _origAvgSize: number;
  _curAvgSize: number;
  _doneCollectingFaces: boolean;
  _exponentialMovingAverage: Function;

  // Who this face has been recognized as
  faceId: ?FaceId = null;

  i: {
    tracker: ?any;    // Internal FaceTracker state
    recognizer: ?any; // Internal FaceRecognizer state
  } = {};

  constructor(id: number, env: Env) {
    this.id = id;
    log = env.log;
    this.name = 'unknown face';
    this._origAvgSize = 0;
    this._curAvgSize = 0;
    this.faceStart = Date.now();
    this.movement = FACE_MOVEMENT_NOT_CHANGED;
    this._doneCollectingFaces = false;

    // Calculate exponential moving average over FACE_AVERAGE_DURATION
    // Reference https://en.wikipedia.org/wiki/Moving_average#Exponential_moving_average
    this._exponentialMovingAverage = movingAverage(FACE_AVERAGE_DURATION);
  }

  /**
   * Notify timeline if face is approaching or moving away from the device
   */
  setFaceMovement(movement: FaceMovementType) {
    if (this.movement !== movement) {
      this.movement = movement;

      log.verbose(`**************************************`);
      log.verbose(`face: ${this.id} is moving ${movement}`);
      log.verbose(`**************************************`);
    }

    // Set the new comparison point so face movement is estimated from this
    // point onwards
    this._origAvgSize = this._curAvgSize;
    this._curAvgSize = 0;
  }

  /**
   * Compare the new face size with the average size of the face in the previous
   * frames to estimate the movement of the face
   */
  faceMovementEstimation(rect: FaceRect) {
    let size = Math.round(rect.width * rect.height);
    this._exponentialMovingAverage.push(Date.now(), size);
    this._curAvgSize = this._exponentialMovingAverage.movingAverage();
    log.debug(`Face size: ${size} current average: ${this._curAvgSize} ` +
        `original average: ${this._origAvgSize}`);

    // Keep collecting faces for FACE_AVERAGE_DURATION before running
    // movement estimation
    const now = Date.now();
    if (Math.abs(this.faceStart - now) < FACE_AVERAGE_DURATION) {
      return;
    }

    // Done collecting faces; start movement estimation from the next run
    if (!this._doneCollectingFaces) {
      log.debug(`Done collecting face averages`);
      this._doneCollectingFaces = true;

      // Reset original average to set a new comparison point and start
      // the new current average for the new faces
      this._origAvgSize = this._curAvgSize;
      this._curAvgSize = 0;
      this._exponentialMovingAverage = movingAverage(FACE_DETECT_INTERVAL);

      return;
    }

    // Check how much face size has changes w.r.t average face to know
    // if a face is moving towards or away from the device
    let change = Math.abs(this._curAvgSize - this._origAvgSize) / this._origAvgSize * 100;
    change = Math.round(change);
    log.debug(`Face size change: ${change} %`);
    if ((this._curAvgSize > this._origAvgSize) && (change > CHANGE_THRESHOLD)) {
      this.setFaceMovement(FACE_MOVEMENT_CLOSER);
    } else if ((this._curAvgSize < this._origAvgSize) && (change > CHANGE_THRESHOLD)) {
      this.setFaceMovement(FACE_MOVEMENT_FARTHER);
    }
  }

  setLocation(rect: FaceRect, rectWhen: number) {
    this.rect = rect;
    this.rectWhen = rectWhen;

    // Run face movement estimation
    this.faceMovementEstimation(this.rect);
  }
}
