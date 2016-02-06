/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

// Load the regnerator polyfill manually so we don't need to also load all the
// core-js polyfills which we don't actually need...
import regeneratorRuntime from 'babel-runtime/regenerator';
global.regeneratorRuntime = global.regeneratorRuntime || regeneratorRuntime;

import Cmt from 'silk-cv';
import invariant from 'assert';

const MAX_TRACKED_OBJECTS = (process.platform === 'android' ? 1 : 10);

type TrackedObject = {
  tag: string;
  id: number;
  cx: number;
  cy: number;
  when: number; // time of last cx, cy update
  cmt: Cmt;
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

        let cmtInitOptions = {
          drawPoints: true,
        };

        log.info(`Tracking new ${tag} at ${JSON.stringify(rect)}`);
        objects.push({
          id: nextObjectId++,
          tag,
          when,
          cx: rect.x + rect.width / 2,
          cy: rect.y + rect.height / 2,
          width: rect.width,
          height: rect.height,
          cmt: new Cmt(image, rect, () => null, cmtInitOptions),
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

  // Feed each new preview frame into each CMT tracker object
  onPreview = (when) => {
    // Filter out any stale objects
    objects = objects.filter((object) => object.cmt !== null);

    // TODO: Check the center/size of the remaining tracked objects.  If they
    // overlap too much then they're probably tracking the same object...

    if (objects.length <= 0) {
      return;
    }

    log.verbose(`Tracking ${objects.length} objects`);

    const frameFetchStart = Date.now();
    env.camera.getPreviewFrame((err, image) => {
      if (err) {
        log.warn(`Unable to fetch frame: ${err}`);
        return;
      }
      log.verbose(`fetched preview frame in ${Date.now() - frameFetchStart}ms`);

      // Make a local copy of the image because |drawPoints=true|, so
      // |cmt.nextFrame| will draw the feature points and bounding rectangle
      // over the image.
      let localImage = image.copy();
      objects.forEach(object => {
        if (object.cmt === null) {
          // Old entry that hasn't been cleaned yet..
          return;
        }
        const id = object.id;
        if (object.cmt.busy()) {
          log.error(`CMT still busy for id=${id}`);
          return;
        }

        const startTime = Date.now();
        object.cmt.nextFrame(localImage, (err, results) => {
          invariant(!object.cmt.busy());
          if (err) {
            // TODO: Figure out why CppMT/fastcluser/fastcluster.cpp throws sometimes :-/
            log.error('CMT failed', err.stack || err);
            return;
          }

          log.debug('CMT results', JSON.stringify(results));
          if (results.confidence < 0.3) {
            log.info('Lost confidence, releasing object', id);
            object.cmt = null;
            return;
          }
          const boundingRect = results.boundingRect;
          object.cx = boundingRect.x + boundingRect.width / 2;
          object.cy = boundingRect.y + boundingRect.height / 2;
          object.when = when;
          object.height = results.size.height;
          object.width = results.size.width;

          const elapsedTime = Date.now() - startTime;
          log.verbose(`Tracking took ${elapsedTime}ms for id=${id}: ${JSON.stringify(object)}`);
          // boundingRect must be fully contained within localImage or OpenCV will
          // assert within the |.roi| method.
          if (boundingRect.x < 0) {
            boundingRect.width += boundingRect.x;
            boundingRect.x = 0;
          }
          if (boundingRect.y < 0) {
            boundingRect.height += boundingRect.y;
            boundingRect.y = 0;
          }
          let [ maxHeight, maxWidth ] = localImage.size();
          if (boundingRect.x + boundingRect.width >= maxWidth) {
            boundingRect.width = maxWidth - boundingRect.x;
          }
          if (boundingRect.y + boundingRect.height >= maxHeight) {
            boundingRect.height = maxHeight - boundingRect.y;
          }
          log.verbose(`im: ${maxWidth}x${maxHeight}, boundingRect: ${JSON.stringify(boundingRect)}`);
          const roi = localImage.roi(boundingRect.x, boundingRect.y,
            boundingRect.width, boundingRect.height);
          env.timeline.addDiagFrame(`${object.tag}:${id}:${elapsedTime}ms`, when, roi);
          roi.release();
          localImage.release();
        });
      });
    }, when, 1 /* == 1 channel image (RGB not required) */);
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
