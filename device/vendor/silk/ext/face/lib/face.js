/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

export type Matrix = any;

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
  leftEye: ?[number, number]; // center x,y
  rightEye: ?[number, number]; // center x,y
};


export type FaceId = number; // index into face database

export class Face {
  id: number; // Unique object Id
  rect: FaceRect; // Last known location
  rectWhen: number; // Time when `rect` was last updated

  // Who this face has been recognized as
  faceId: ?FaceId = null;

  i: {
    tracker: ?any;    // Internal FaceTracker state
    recognizer: ?any; // Internal FaceRecognizer state
  } = {};

  constructor(id: number) {
    this.id = id;
  }

  setLocation(rect: FaceRect, rectWhen: number) {
    this.rect = rect;
    this.rectWhen = rectWhen;
  }
}

