/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import movingAverage from 'moving-average';
import type { Env, Log, Timeline } from 'silk-sdk-glue/interface/env';

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

const FACE_LOCATION_NOT_CHANGED = 'notchanged';
const FACE_LOCATION_CLOSER = 'coming closer';
const FACE_LOCATION_AWAY = 'going away';
let FaceLocationType = FACE_LOCATION_NOT_CHANGED | FACE_LOCATION_CLOSER | FACE_LOCATION_AWAY;

let log: Log;
let timeline: Timeline;

/**
 *
 */
export class Face {
  id: number; // Unique object Id
  name: string; // name identified for the face
  rect: FaceRect; // Last known location
  rectWhen: number; // Time when `rect` was last updated
  percentTrained: number = 0;
  _origAvgSize: number;
  _curAvgSize: number;
  _faceLocation: FaceLocationType;
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
    timeline = env.timeline;
    this.name = 'unknown face';
    this._origAvgSize = 0;
    this._curAvgSize = 0;
    this.faceStart = Date.now();
    this._faceLocation = FACE_LOCATION_NOT_CHANGED;
    this._doneCollectingFaces = false;

    // Calculate exponential moving average over FACE_AVERAGE_DURATION
    // Reference https://en.wikipedia.org/wiki/Moving_average#Exponential_moving_average
    this._exponentialMovingAverage = movingAverage(FACE_AVERAGE_DURATION);
  }

  /**
   * Notify timeline if face is approaching or moving away from the device
   */
  notifyFaceLocation(_faceLocation: FaceLocationType) {
    // Only notify when location type changes
    if (this._faceLocation !== _faceLocation) {
      timeline.addObjects([{
        tag: `${this.name} is ${_faceLocation}`,
        when: this.rectWhen,
        source: 'face',
        durationMs: FACE_DETECT_INTERVAL,
      }]);
      this._faceLocation = _faceLocation;

      log.verbose(`${this.name} is ${_faceLocation} at ${this.rectWhen}`);
    }

    // Set the new comparison point so face location is estimated from this
    // point onwards
    this._origAvgSize = this._curAvgSize;
    this._curAvgSize = 0;
  }

  /**
   * Compare the new face size with the average size of the face in the previous
   * frames to estimate the location of the face
   */
  faceLocationEstimation(rect: FaceRect) {
    let size = Math.round(rect.width * rect.height);
    this._exponentialMovingAverage.push(Date.now(), size);
    this._curAvgSize = this._exponentialMovingAverage.movingAverage();
    log.debug(`Face size: ${size} current average: ${this._curAvgSize} ` +
        `original average: ${this._origAvgSize}`);

    // Keep collecting faces for FACE_AVERAGE_DURATION before running
    // location estimation
    const now = Date.now();
    if (Math.abs(this.faceStart - now) < FACE_AVERAGE_DURATION) {
      return;
    }

    // Done collecting faces; start location estimation from the next run
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
      this.notifyFaceLocation(FACE_LOCATION_CLOSER);
    } else if ((this._curAvgSize < this._origAvgSize) && (change > CHANGE_THRESHOLD)) {
      this.notifyFaceLocation(FACE_LOCATION_AWAY);
    }
  }

  setLocation(rect: FaceRect, rectWhen: number) {
    this.rect = rect;
    this.rectWhen = rectWhen;

    // Run face location estimation
    this.faceLocationEstimation(this.rect);
  }
}
