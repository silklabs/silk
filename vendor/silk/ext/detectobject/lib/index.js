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

function detectObjects(im, when, cb) {
  let start = Date.now();
  let objs = [];
  let pendingCallbacks = cascades.length;

  cascades.forEach(c => {
    im.detectObject(c.file, {}, (err, rects) => {
      if (err) {
        throw err;
      }
      if (rects.length > 0) {
        objs.push({tag: c.tag, when: when, rects: rects});
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

  env.timeline.on('preview', (when, retrieveFunc) => {
    if (working) {
      log.error('Still busy, unable to process next preview image');
      return;
    }
    working = true;

    let start = Date.now();
    retrieveFunc((err, im) => {
      if (err) {
        log.warning(`Unable to fetch frame: ${err}`);
        working = false;
        return;
      }
      let diff = Date.now() - start;
      log.verbose(`Acquired preview image in ${diff}ms`);

      detectObjects(im, when, objs => {
        if (objs.length > 0) {
          let what = objs.reduce((s, o) => `${s} ${o.tag}=${o.rects.length}`, '');
          log.info(`Detected objects:${what}`);
          env.timeline.addObjects(objs);
        }
        working = false;
      });
    }, 1 /* == 1 channel image (RGB not required) */);
  });
}

