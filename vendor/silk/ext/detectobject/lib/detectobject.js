/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

let log;

const cascades = [
  {
    tag: 'car', file: '/system/silk/media/opencv/hogcascade_cars_sideview.xml',
    opts: {
      scale: 1.2,
      neighbors: 2,
      min: [40, 80],
    },
  },
  {
    tag: 'face', file: '/system/silk/media/opencv/haarcascade_frontalface_alt2.xml',
    opts: {
      scale: 1.2,
      neighbors: 2,
      min: [25, 25],
    },
  }
];

/**
 * Call opencv methods to detect objects as defined by {@code cascades}
 *
 * @param im image representing region of interest
 * @param when timestamp of the preview image
 * @param motionx x-coord of im within the original preview image
 * @param motiony y-coord of im within the original preview image
 * @param cb user callback
 */
function detectObjects(im, motionx, motiony, when, cb) {
  let start = Date.now();
  let objs = [];
  let pendingCallbacks = cascades.length;

  cascades.forEach(c => {
    im.detectObject(c.file, {}, (err, rects) => {
      if (err) {
        throw err;
      }
      if (rects.length > 0) {
        // Adjust rectangle's position within the original preview image
        let newRects = rects.map(rect => {
          let newRect = rect;
          newRect.x += motionx;
          newRect.y += motiony;
          return newRect;
        });
        objs.push({tag: c.tag, when: when, rects: newRects});
      }
      if (--pendingCallbacks <= 0) {
        let diff = Date.now() - start;
        let msg = `Cascades ran for ${diff}ms`;
        if (diff > 500) {
          // Time to optimize?
          log.warn(msg);
        } else {
          log.verbose(msg);
        }
        cb(objs);
      }
    });
  });
}

export default function init(env) {
  log = env.log;

  let working = false;

  env.timeline.on('preview', when => {
    if (working) {
      log.error(`Still busy, unable to process next preview image`);
      return;
    }
    working = true;

    let start = Date.now();
    env.camera.getPreviewFrame((err, im) => {
      if (err) {
        log.warn(`Unable to fetch frame: ${err}`);
        working = false;
        return;
      }
      let diff = Date.now() - start;
      log.verbose(`Acquired preview image in ${diff}ms`);

      // Fake a "motion" rectangle since the "preview" timeline event is being
      // used at the moment.
      let rects = [
        { x: 0, y: 0, width: im.width(), height: im.height() }
      ];

      // Restrict object detection to a section of the image that shows motion
      if (rects.length > 1) {
        log.warn(`More than one (${rects.length}) motion rectangles received`);
      }
      let motionRect = rects[0]; // Only one motion rectangle is supported right now
      let motion = im.roi(motionRect.x, motionRect.y, motionRect.width, motionRect.height);

      detectObjects(motion, motionRect.x, motionRect.y, when, objs => {
        let what;
        if (objs.length > 0) {
          what = objs.reduce((s, o) => `${s} ${o.tag}=${o.rects.length}`, '');
          env.timeline.addObjects(objs);
        } else {
          what = ' -';
        }
        log.info(`Detected objects:${what}`);
        working = false;
      });
    }, 1 /* == 1 channel image (RGB not required) */);
  });
}

