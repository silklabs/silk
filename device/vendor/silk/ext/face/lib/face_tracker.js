/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import invariant from 'assert';
import silkcv from 'silk-cv';
import {
  Matrix,
  Face,
  FaceRect,
} from './face';

const TRACKER_NAME = 'MEDIANFLOW';
//const TRACKER_NAME = 'CMT';

// Set a reasonable limit of tracked objects
const MAX_TRACKED_OBJECTS = 10;

let log;
let timeline;

export default class FaceTracker {

  constructor(env) {
    log = env.log;
    timeline = env.timeline;
  }

  _probablySameFace(r1: FaceRect, r2: FaceRect): bool {
    const area1 = r1.width * r1.height;
    const area2 = r2.width * r2.height;

    // Are the two rectangles close enough in size
    const areaRatio = Math.min(area1, area2) / Math.max(area1, area2);
    if (areaRatio < 0.5) {
      // Rectangles that differ in size by more than 50% are probably not
      // the same
      return false;
    }

    // Do both rectangles mostly overlap?
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

    // Rectangles overlapping by more than 50% probably are the same
    return overlapRatio > 0.5;
  }

  detectedFaces(when: number, faceRects: Array<FaceRect>, grayeq: Matrix) {
    faceRects.forEach(rect => {
      const alreadyTracked = this.faces.some(face => {
        if (face.i.tracker === null) {
          return false; // Zombie face that hasn't been removed yet by update()
        }
        if (this._probablySameFace(rect, face.rect)) {
          log.info(`Updating location of face ${face.id} to ${JSON.stringify(rect)}`);
          face.setLocation(rect, when);

          // Cancel any existing tracker operation and create a new tracker
          // starting at the latest confirmed face location.
          // TODO LATER: it would be nice to update the Tracker API to allow
          // reinitializing a tracker as for certain Tracker implementations
          // this could be a win.
          face.i.tracker.cancel();
          face.i.tracker = new silkcv.Tracker(TRACKER_NAME, grayeq, rect, () => null);
          return true;
        }
        return false;
      });

      if (!alreadyTracked) {
        if (this.faces.length >= MAX_TRACKED_OBJECTS) {
          log.warn(`Unable to track new face, already tracking ${MAX_TRACKED_OBJECTS}`);
        } else {
          let face = new Face(timeline.getNextObjectId());
          face.setLocation(rect, when);
          face.i.tracker = new silkcv.Tracker(TRACKER_NAME, grayeq, rect, () => null);
          this.faces.push(face);
        }
      }
    });
  }

  _promiseTrackerUpdate(face: Face, grayeq: Matrix): Promise<[Face, bool, bool, FaceRect]> {
    invariant(!face.i.tracker.busy());
    return new Promise(resolve => {
      face.i.tracker.update(grayeq, (err, found, rect) => {
        resolve([face, err, found, rect]);
      });
    });
  }

  _getIdleTrackers(): Array<Face> {
    let idleFaces = [];
    for (let i = 0; i < this.faces.length; i++) {
      let face = this.faces[i];
      if (face.i.tracker === null) {
        continue;
      }
      if (face.i.tracker.busy()) {
        log.warn(`Tracker still busy for face ${face.id}`);
        continue;
      }

      // Check if another tracker appears to be also tracking this face
      for (let j = i + 1; j < this.faces.length; j++) {
        let face2 = this.faces[j];
        if (face2.i.tracker === null) {
          continue;
        }
        if (!face2.i.tracker.busy() && this._probablySameFace(face.rect, face2.rect)) {
          // Drop the other tracker.
          // TODO: Be smarter about which tracker to drop, based on
          // area/tracker age/...?
          face2.i.tracker = null;
          log.warn(`Suspected duplicate face tracker, dropping face ${face.id}`);
          continue;
        }
      }
      idleFaces.push(face);
    }
    return idleFaces;
  }

  async update(when: number, grayeq: Matrix): Promise<Array<Face>> {
    // Filter out lost faces
    this.faces = this.faces.filter(face => face.i.tracker !== null);

    // Collect the list of idle trackers
    const idleFaces = this._getIdleTrackers();

    // Run all the trackers in parallel
    const startTime = Date.now();
    let trackingResults = await Promise.all(idleFaces.map(face => {
      return this._promiseTrackerUpdate(face, grayeq);
    }));
    const elapsedTime = Date.now() - startTime;
    log.debug(`Tracking took ${elapsedTime}ms for ${trackingResults.length} faces`);

    // Update face objects with tracking results
    let lostFaces = [];
    for (let idx = 0; idx < trackingResults.length; idx++) {
      let [face, err, found, rect] = trackingResults[idx];

      if (err) {
        log.error('Tracker failed', err.stack || err);
        found = false;
      }

      if (!found) {
        face.i.tracker = null;
        lostFaces.push(face);
        continue;
      }

      face.setLocation(rect, when);

      const diagId = `tracked:${face.id}:${elapsedTime}ms`;
      if (timeline.diagFrameEnabled(diagId)) {
        // boundingRect must be fully contained within the grayeq or OpenCV will
        // assert within the |.roi| method.
        if (rect.x < 0) {
          rect.width += rect.x;
          rect.x = 0;
        }
        if (rect.y < 0) {
          rect.height += rect.y;
          rect.y = 0;
        }
        let [ maxHeight, maxWidth ] = grayeq.size();
        if (rect.x + rect.width >= maxWidth) {
          rect.width = maxWidth - rect.x;
        }
        if (rect.y + rect.height >= maxHeight) {
          rect.height = maxHeight - rect.y;
        }

        const roi = grayeq.roi(rect.x, rect.y, rect.width, rect.height);
        timeline.addDiagFrame(diagId, when, roi);
        roi.release();
      }
    }

    if (lostFaces.length > 0) {
      log.info(`Lost ${lostFaces.length} faces`);
    }
    return lostFaces;
  }

  // list of currently tracked faces
  faces: Array<Face> = [];
}

