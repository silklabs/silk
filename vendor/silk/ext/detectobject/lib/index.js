/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let cv = require('opencv');
let log;

const cascades = [
  { tag: 'car', file: '/system/media/opencv/hogcascade_cars_sideview.xml'},
  { tag: 'face', file: '/system/media/opencv/haarcascade_frontalface_alt2.xml'}
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
  env.camera.on('preview', (when, jpeg) => {
    if (working) {
      log.error('Still busy, unable to process next preview image');
      return;
    }
    working = true;

    let start = Date.now();
    cv.readImage(jpeg, (err, im) => {
      if (err) {
        working = false;
        throw err;
      }
      if (im.width() < 1 || im.height() < 1) {
        working = false;
        throw new Error('Invalid image');
      }

      let diff = Date.now() - start;
      log.debug(`Loaded preview image in ${diff}ms`);

      detectObjects(im, when, objs => {
        if (objs.length > 0) {
          let what = objs.reduce((s, o) => `${s} ${o.tag}=${o.rects.length}`, '');
          log.info(`Detected objects:${what}`);
          env.camera.addObjects(objs);
        }
        working = false;
      });
    });
  });
}
