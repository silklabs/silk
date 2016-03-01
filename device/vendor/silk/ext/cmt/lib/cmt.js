/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

// Load the regnerator polyfill manually so we don't need to also load all the
// core-js polyfills which we don't actually need...
import regeneratorRuntime from 'babel-runtime/regenerator';
global.regeneratorRuntime = global.regeneratorRuntime || regeneratorRuntime;

import silkcv from 'silk-cv';
import invariant from 'assert';

const TRACKER_NAME = 'MEDIANFLOW';
//const TRACKER_NAME = 'CMT';

const MAX_TRACKED_OBJECTS = (process.platform === 'android' ? 1 : 10);

type TrackedObject = {
  tag: string;
  id: number;
  cx: number;
  cy: number;
  when: number; // time of last cx, cy update
  tracker: any;
};
let objects: Array<TrackedObject> = [];
let nextObjectId = 0;

let log;
let env;

/**
 * Listen for all detected faces and try to match them up with the existing
 * face database
 */
class ObjectTracker {
  constructor() {
    env.timeline.on('car', this.onCar);
    env.timeline.on('face', this.onFace);
    env.timeline.on('preview', this.onPreview);
  }

  onObjects(tag, when, rects) {

    // Try to determine if each new object is already being tracked.  This is
    // done by checking the distance between the center of the new object and
    // the last known center of each object currently being tracked.
    //
    // TODO: This algorithm needs improvement.  It could also compare the
    // object size for example.  It also should use `when` to match up the times
    // of when the object info was last updated
    let untrackedRects = [];
    rects.forEach(rect => {
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const alreadyTracked = objects.some(object => {
        const distance = Math.sqrt(
          Math.pow(object.cx - cx, 2) +
          Math.pow(object.cy - cy, 2)
        );
        return tag === object.tag &&
          distance < Math.min(object.height, object.width);
      });
      if (!alreadyTracked) {
        untrackedRects.push(rect);
      }
    });

    if (untrackedRects.length <= 0) {
      // Nothing to do
      return;
    }

    env.camera.getPreviewFrame(when, 'grayeq', (err, image) => {
      if (err) {
        log.warn(`Unable to fetch frame: ${err}`);
        return;
      }

      untrackedRects.forEach(rect => {
        if (objects.length >= MAX_TRACKED_OBJECTS) {
          log.warn(`Already tracking max objects: ${MAX_TRACKED_OBJECTS}`);
          return;
        }

        log.info(`Tracking new ${tag} at ${JSON.stringify(rect)}`);
        objects.push({
          id: nextObjectId++,
          tag,
          when,
          cx: rect.x + rect.width / 2,
          cy: rect.y + rect.height / 2,
          width: rect.width,
          height: rect.height,
          tracker: new silkcv.Tracker(TRACKER_NAME, image, rect, () => null),
        });
      });

    });
  }

  onFace = (when, rects) => {
    this.onObjects('face', when, rects);
  };

  onCar = (when, rects) => {
    this.onObjects('car', when, rects);
  };

  // Feed each new preview frame into each tracker object
  onPreview = (when) => {
    // Filter out any stale objects
    objects = objects.filter((object) => object.tracker !== null);

    // TODO: Check the center/size of the remaining tracked objects.  If they
    // overlap too much then they're probably tracking the same object...

    if (objects.length <= 0) {
      return;
    }

    log.verbose(`Tracking ${objects.length} objects`);

    const frameFetchStart = Date.now();
    env.camera.getPreviewFrame(when, 'grayeq', (err, image) => {
      if (err) {
        log.warn(`Unable to fetch frame: ${err}`);
        return;
      }
      log.verbose(`fetched preview frame in ${Date.now() - frameFetchStart}ms`);

      // Make a local copy of the image because some |tracker.update|
      // implementations (CMT) can draw the feature points and bounding
      // rectangle over the image.
      let localImage = image.copy();
      objects.forEach(object => {
        if (object.tracker === null) {
          // Old entry that hasn't been cleaned yet..
          return;
        }
        const id = object.id;
        if (object.tracker.busy()) {
          log.error(`Tracker still busy for id=${id}`);
          return;
        }

        const startTime = Date.now();
        object.tracker.update(localImage, (err, found, rect) => {
          invariant(!object.tracker.busy());
          if (err) {
            // TODO: Figure out why CppMT/fastcluser/fastcluster.cpp throws sometimes :-/
            log.error('Tracker failed', err.stack || err);
            return;
          }

          log.debug('Tracker results', found, JSON.stringify(rect));
          if (!found) {
            log.info('Lost object, releasing object', id);
            object.tracker = null;
            return;
          }
          object.cx = rect.x + rect.width / 2;
          object.cy = rect.y + rect.height / 2;
          object.when = when;
          object.height = rect.height;
          object.width = rect.width;

          const elapsedTime = Date.now() - startTime;
          log.verbose(`Tracking took ${elapsedTime}ms for id=${id}: ${JSON.stringify(object)}`);

          if (object.width < 0 || object.height < 0) {
            log.info('Invalid object width or height');
            object.tracker = null;
            return;
          }

          // boundingRect must be fully contained within localImage or OpenCV will
          // assert within the |.roi| method.
          if (rect.x < 0) {
            rect.width += rect.x;
            rect.x = 0;
          }
          if (rect.y < 0) {
            rect.height += rect.y;
            rect.y = 0;
          }
          let [ maxHeight, maxWidth ] = localImage.size();
          if (rect.x + rect.width >= maxWidth) {
            rect.width = maxWidth - rect.x;
          }
          if (rect.y + rect.height >= maxHeight) {
            rect.height = maxHeight - rect.y;
          }

          log.verbose(`im: ${maxWidth}x${maxHeight}, rect: ${JSON.stringify(rect)}`);
          const roi = localImage.roi(rect.x, rect.y,
            rect.width, rect.height);
          env.timeline.addDiagFrame(
            `${object.tag}:${id}:${elapsedTime}ms`,
            when,
            roi
          );
          roi.release();
          localImage.release();
        });
      });
    });
  };


  willUnload() {
    env.timeline.removeListener('face', this.onFace);
    env.timeline.removeListener('car', this.onCar);
    env.timeline.removeListener('preview', this.onPreview);
  }
}

module.exports = (_env) => {
  env = _env;
  log = env.log;
  return new ObjectTracker();
};
