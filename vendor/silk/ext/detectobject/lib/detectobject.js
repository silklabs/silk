/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import fs from 'mz/fs';
import path from 'path';

let log;
let timeline;

const REPORT_OBJECT_DIR = '/data/silk/opencv/';

const cascades = [
  {
    tag: 'car', file: '/system/silk/media/opencv/hogcascade_cars_sideview.xml',
    opts: {
      scale: 1.2,
      neighbors: 2,
    },
  },
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
    im.detectObject(c.file, c.opts, (err, rects) => {
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

class DetectObject {
  constructor(env) {
    this._env = env;
    this._init();
  }

  onCommand(cmd) {
    switch (cmd.msg) {
    case 'reportobject':
      log.info('reportobject command:', JSON.stringify(cmd));
      this._reportObject(cmd);
      break;
    default:
      break;
    }
  }

  /**
   * User reported that the object is invalid so save the image on the device
   * to be later used for opencv training
   */
  _reportObject(cmd) {
    this._env.camera.getPreviewFrame((err, im) => {
      if (err) {
        log.warn(`Unable to fetch frame: ${err}`);
        return;
      }
      log.info(`Found image in cache, saving...`);

      // Create directory if it doesn't exist
      let dir = path.join(REPORT_OBJECT_DIR, `no-${cmd.tag}`);
      fs.mkdir(dir).catch(e => {
        if (e.code !== 'EEXIST') {
          log.error(`Failed to create ${dir}, error: ${e}`);
        }
      });

      // Save the image
      im.save(`${dir}/no-${cmd.tag}-${cmd.when}.jpg`);
    }, cmd.when, 1);
  }

  _init() {
    log = this._env.log;
    timeline = this._env.timeline;
    let working = false;

    timeline.on('motion', when => {
      if (working) {
        log.error(`Still busy, unable to process next preview image`);
        return;
      }
      working = true;

      this._env.camera.getPreviewFrame((err, im) => {
        if (err) {
          log.warn(`Unable to fetch frame: ${err}`);
          working = false;
          return;
        }

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
          this._notifyObjs(objs);
          working = false;
        });
      }, when, 1 /* == 1 channel image (RGB not required) */);
    });
  }

  /**
   * Notify timeline of the new objects detected
   * @param objs
   */
  _notifyObjs(objs) {
    let what;
    if (objs && objs.length > 0) {
      what = objs.reduce((s, o) => `${s} ${o.tag}=${o.rects.length}`, '');
      timeline.addObjects(objs);
    } else {
      what = ' -';
    }
    log.info(`Detected objects:${what}`);
  }
}

module.exports = (env) => new DetectObject(env);
