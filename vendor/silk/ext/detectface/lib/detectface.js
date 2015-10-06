/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

let log;
let timeline;

const facecascade = {
  tag: 'face', file: '/system/silk/media/opencv/haarcascade_frontalface_alt2.xml',
  opts: {
    scale: 1.2,
    neighbors: 2,
    min: [25, 25],
  },
};

/**
 * Call opencv methods to detect faces as defined by {@code cascades}
 *
 * @param im image representing region of interest
 * @param motionx x-coord of im within the original preview image
 * @param motiony y-coord of im within the original preview image
 * @param when timestamp of the preview image
 * @param cb user callback
 */
function detectFaces(im, motionx, motiony, when, cb) {
  let start = Date.now();
  let faces = [];

  im.detectObject(facecascade.file, {}, (err, rects) => {
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
      faces.push({tag: facecascade.tag, when: when, rects: newRects});
    }
    let diff = Date.now() - start;
    let msg = `Cascade ran for ${diff}ms`;
    if (diff > 500) {
      // Time to optimize?
      log.warn(msg);
    } else {
      log.verbose(msg);
    }
    cb(faces);
  });
}

class DetectFace {
  constructor(env) {
    this._init(env);
  }

  _init(env) {
    log = env.log;
    timeline = env.timeline;
    let working = false;

    timeline.on('motion', when => {
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

        detectFaces(motion, motionRect.x, motionRect.y, when, faces => {
          this._notifyObjs(faces);
          working = false;
        });
      }, when, 1 /* == 1 channel image (RGB not required) */);
    });
  }

  /**
   * Notify timeline of the new faces detected
   * @param faces
   */
  _notifyObjs(faces) {
    let what;
    if (faces && faces.length > 0) {
      what = faces.reduce((s, o) => `${s} ${o.tag}=${o.rects.length}`, '');
      timeline.addObjects(faces);
    } else {
      what = ' -';
    }
    log.info(`Detected faces:${what}`);
  }
}

module.exports = (env) => new DetectFace(env);
