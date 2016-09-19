/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import invariant from 'assert';
import silkcv from 'silk-cv';
import safeRoi from './safe_roi.js';
import {
  Matrix,
  Face,
  FaceRect,
} from './face';

import * as config from './face_config';

let camera;
let log;
let timeline;

export default class FaceTracker {
  _faces: Array<Face> = [];  // list of currently tracked faces

  constructor(env, frameSize /*: CameraFrameSize*/) {
    camera = env.camera;
    this.env = env;
    log = env.log;
    timeline = env.timeline;
    this._frameSize = frameSize;
    this._lostFaces = [];
  }

  // Computes the area and overlap ratios between two face rectangles
  _faceRectRatio(r1: FaceRect, r2: FaceRect): [/*overlap:*/ number, /*area:*/ number] {
    const area1 = r1.width * r1.height;
    const area2 = r2.width * r2.height;
    const areaRatio = Math.min(area1, area2) / Math.max(area1, area2);

    const xOverlap = Math.max(
      0,
      Math.min(r1.x + r1.width, r2.x + r2.width) - Math.max(r1.x, r2.x)
    );
    const yOverlap = Math.max(
      0,
      Math.min(r1.y + r1.height, r2.y + r2.height) - Math.max(r1.y, r2.y)
    );
    const areaOverlap = xOverlap * yOverlap;
    const overlapRatio = areaOverlap / Math.min(area1, area2);

    //log.debug(`_faceRectRatio: or=${overlapRatio} ar=${areaRatio}: ${JSON.stringify(r1)} ${JSON.stringify(r2)}`);
    return [overlapRatio, areaRatio];
  }

  _probablySameFace(r1: FaceRect, r2: FaceRect): boolean {
    const [overlapRatio] = this._faceRectRatio(r1, r2);

    // Faces overlapping by more than a given threshold are probably the same face.
    // TODO: Consider areaRatio?  Need test cases that demonstrate where
    //       testing overlapRatio alone fails first...
    return overlapRatio > 0.2;
  }

  _newTracker(frame: Matrix, rect: FaceRect) {
    return new silkcv.Tracker(
      config.TRACKER_NAME,
      frame,
      camera.normalRectsTo([rect], this._frameSize)[0],
      () => null,
      {confidence: config.TRACKER_CONFIDENCE}
    );
  }

  _promiseTrackerUpdate(face: Face, frame: Matrix): Promise<[Face, boolean, boolean, ?FaceRect]> {
    invariant(!face.i.tracker.impl.busy());
    return new Promise(resolve => {
      face.i.tracker.impl.update(frame, (err, found, rect) => {
        resolve([
          face,
          err,
          found,
          rect && camera.normalRectsFrom([rect], this._frameSize)[0],
        ]);
      });
    });
  }

  _updateFaceLocation(face: Face, when: number, rect: FaceRect, frame: Matrix) {
    log.verbose(`Updating location of face ${face.id} [${rect.x}, ${rect.y}, ${rect.width}, ${rect.height}]`);
    // Update the tracking rectangle to the latest detected location for
    // this face.
    face.setLocation(rect, when);
    face.i.tracker.notSeenCount = 0;

    // TODO LATER: it would be nice to update the Tracker API to allow
    // reinitializing a tracker as for certain Tracker implementations
    // this could be a win.
    if (face.i.tracker.impl) {
      face.i.tracker.impl.cancel();
    }
    face.i.tracker.impl = this._newTracker(frame, rect);
  }

  detectedFaces(when: number,
                faceRects: Array<FaceRect>,
                weakFaceRects: Array<FaceRect>,
                frame: Matrix) {
    // Filter out lost faces
    this._faces = this._faces.filter(face => face.i.tracker.impl !== null);

    this._faces.forEach(
      face => {
        face.i.tracker.detected = false;
      }
    );

    // Update trackers with new (strong) face data, and create new trackers if
    // necessary
    faceRects.forEach(rect => {
      let alreadyTracked = false;
      this._faces.forEach(face => {
        if (this._probablySameFace(rect, face.rect)) {
          this._updateFaceLocation(face, when, rect, frame);
          face.i.tracker.detected = true;
          alreadyTracked = true;
        }
      });

      // Skip faces for which tracker hasn't finished yet on that frame
      this._faces.forEach(face => {
        if (face.rectWhen < when) {
          log.info(`Skipping face: ${face.id}`);
          face.i.tracker.detected = true;
          alreadyTracked = true;
        }
      });

      // Check if this face data matches a just lost face. If yes then reinstate
      // the lost face
      let face = this._recoverLostFace(rect);
      if (face) {
        this._updateFaceLocation(face, when, rect, frame);
        face.i.tracker.detected = true;
        alreadyTracked = true;
      }

      if (!alreadyTracked) {
        if (this._faces.length >= config.MAX_TRACKED_OBJECTS) {
          log.warn(`Unable to track new face, already tracking ${config.MAX_TRACKED_OBJECTS}`);
        } else {
          let face = new Face(timeline.getNextObjectId(), this.env);
          face.setLocation(rect, when);
          face.i.tracker = {
            detected: true,
            impl: this._newTracker(frame, rect),
            notSeenCount: 0,
          };
          this._faces.push(face);
          log.verbose(`Tracking new face ${face.id}`);
        }
      }
    });

    // Update trackers with new weak face data, only for trackers that didn't
    // already match a strong face
    weakFaceRects.forEach(
      rect => {
        this._faces.forEach(
          face => {
            if (face.i.tracker.detected) {
              return;
            }
            if (this._probablySameFace(rect, face.rect)) {
              this._updateFaceLocation(face, when, rect, frame);
              face.i.tracker.detected = true;
            }
          }
        );
      }
    );

    // Search for faces that were not updated with the latest detection results,
    // and remove them if they've not been associated with a detected face
    // recently.
    this._faces.forEach(face => {
      if (face.i.tracker.detected) {
        return;
      }

      // Clear eye locations as this face was not detected, so any existing eye location
      // is now likely wrong
      face.rect.leftEye = null;
      face.rect.rightEye = null;

      if (++face.i.tracker.notSeenCount >= config.MAX_NO_FACE_SEEN) {
        log.warn(`No new update seen for a while, dropping face ${face.id}`);
        this._cancelFace(face);
      } else {
        // Adjust the face timestamp as we are keeping the faces around a few
        // times after they were seen. This is done to match the time when
        // the face is considered lost
        log.warn(`Face not seen count: ${face.i.tracker.notSeenCount}`);
        face.rectWhen = when;
      }
    });

    // Search for duplicate trackers and remove them
    for (let i = 0; i < this._faces.length; i++) {
      let face = this._faces[i];
      if (face.i.tracker.impl === null) {
        continue;
      }

      // Check if another tracker appears to be also tracking this face
      for (let j = i + 1; j < this._faces.length; j++) {
        let face2 = this._faces[j];
        if (face2.i.tracker.impl === null) {
          continue;
        }
        if (this._probablySameFace(face.rect, face2.rect)) {
          // Keep the tracker for the face that was observed recently and drop the
          // other as guess right now.
          let keepFace1 = null;

          // If one of the faces have eye points, it's a strong face
          if (face.rect.leftEye) {
            keepFace1 = true;
          } if (face2.rect.leftEye) {
            keepFace1 = false;
          } else {
            // Both weak faces.  Select the face that's been seen the most recently.
            keepFace1 = face.i.tracker.notSeenCount > face2.i.tracker.notSeenCount;
          }

          if (keepFace1) {
            log.warn(`Suspected duplicate face tracker, dropping face ${face2.id}`);
            this._cancelFace(face2);
            continue;
          } else {
            log.warn(`Suspected duplicate face tracker, dropping face ${face.id}`);
            this._cancelFace(face);
            break;
          }
        } else {
          //log.debug(`Not the same faces - ${face.id}:${face2.id}`);
        }
      }
    }
  }

  /*
   * Returns the list of Faces where the associated is not currently busy
   * performing a tracking update.
   */
  _getIdleTrackers(): Array<Face> {
    let idleFaces = [];
    for (let i = 0; i < this._faces.length; i++) {
      let face = this._faces[i];
      if (face.i.tracker.impl === null) {
        continue;
      }
      if (face.i.tracker.impl.busy()) {
        log.warn(`Tracker still busy for face ${face.id}`);
        continue;
      }
      idleFaces.push(face);
    }
    return idleFaces;
  }

  async update(when: number, frame: Matrix): Promise<Array<Face>> {
    // Collect the list of idle trackers
    const idleFaces = this._getIdleTrackers();

    if (idleFaces.length === 0) {
      return [];
    }

    // Run all the trackers in parallel
    const startTime = Date.now();
    let trackingResults = await Promise.all(idleFaces.map(face => {
      return this._promiseTrackerUpdate(face, frame);
    }));
    const elapsedTime = Date.now() - startTime;
    log.debug(`Tracking took ${elapsedTime}ms for ${trackingResults.length} faces`);

    // Update face objects with tracking results
    for (let idx = 0; idx < trackingResults.length; idx++) {
      let [face, err, found, rect] = trackingResults[idx];

      if (err) {
        log.error('Tracker failed', err.stack || err);
        found = false;
      }

      if (!found) {
        log.verbose(`Tracker lost face ${face.id}`);
        this._cancelFace(face);
        continue;
      }

      face.setLocation(rect, when);

      const diagId = `tracked:${face.id}:${elapsedTime}ms:` +
                     `${face.i.tracker.notSeenCount}/${config.MAX_NO_FACE_SEEN}`;
      if (timeline.diagFrameEnabled(diagId)) {
        const framerect = camera.normalRectsTo([rect], this._frameSize)[0];
        const roi = safeRoi(frame, framerect);
        timeline.addDiagFrame(diagId, when, roi);
        roi.release();
      }
    }

    return this._lostFaces;
  }

  get faces(): Array<Face> {
    // Filter out lost faces
    this._faces = this._faces.filter(face => face.i.tracker.impl !== null);

    // Clear lost faces that are old
    let now = Date.now();
    this._lostFaces = this._lostFaces.filter((face) => {
      let keep = ((now - face.rectWhen) < config.FACE_DURATION);
      if (!keep) {
        face.cancel();
      }
      return keep;
    });

    return this._faces;
  }

  _cancelFace(face: Face, reason: String) {
    log.info(`Canceling face id: ${face.id}, faceId: ${face.faceId}`);
    if (face.i.tracker.impl !== null) {
      face.i.tracker.impl.cancel();
      face.i.tracker.impl = null;
      this._lostFaces.push(face);
    }
  }

  /*
   * Check if the face rectangle matches any of the lost faces with in the past
   * ${@code FACE_DURATION}. Reinstante the lost face if there is a match
   */
  _recoverLostFace(rect) {
    if (!this._lostFaces.length) {
      return null;
    }

    let lost = this._lostFaces.reduce((lost, lostFace) => {
      return lost + `{id: ${lostFace.id}, faceId: ${lostFace.faceId}, when: ${lostFace.rectWhen}}, `;
    }, '');

    log.info(`Lost faces: [${lost}]`);
    for (let count = 0; count < this._lostFaces.length; count++) {
      if (this._probablySameFace(rect, this._lostFaces[count].rect)) {
        log.info(`Found a matching lost face with id: ${this._lostFaces[count].id}`);
        let lostFace = this._lostFaces[count];
        this._faces.push(lostFace);
        this._lostFaces.splice(count, 1);
        return lostFace;
      }
    }
    return null;
  }
}

