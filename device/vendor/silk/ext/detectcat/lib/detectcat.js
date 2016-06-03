/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import type { Env, Log, Timeline, Rect } from 'silk-exttest';
type DetectCatsCallback = (rects: Array<Rect>) => void;

let log: Log;
let timeline: Timeline;

const cascade = {
  tag: 'cat',
  file: 'system/silk/media/opencv/lbpcascade_cat.xml',
  opts: {
    scale: 1.2,
    neighbors: 2,
  },
};

/**
 * Call opencv methods to detect cat as defined by {@code cascades}
 *
 * @param im image representing region of interest
 * @param when timestamp of the preview image
 * @param cb user callback
 */
function detectCats(im: any, when: number, cb: DetectCatsCallback) {
  let start = Date.now();

  im.detectObject(cascade.file, cascade.opts, (err, rects) => {
    if (err) {
      throw err;
    }
    let diff = Date.now() - start;
    let msg = `Cascades ran for ${diff}ms`;
    if (diff > 500) {
      log.warn(msg);
    } else {
      log.verbose(msg);
    }
    rects.forEach(rect => {
      const roi = im.roi(rect.x, rect.y, rect.width, rect.height);
      timeline.addDiagFrame(cascade.tag, when, roi);
      roi.release();
    });
    cb(rects);
  });
}

class DetectCat {
  _env: Env;

  constructor(env: Env, cascadeFile: string) {
    // Override cascade file if explicitly provided
    cascade.file = cascadeFile || cascade.file;

    this._env = env;
    this._init();
  }

  _init() {
    log = this._env.log;
    timeline = this._env.timeline;
    let working = false;

    timeline.on('motion', async (when) => {
      if (working) {
        log.error(`Still busy, unable to process next preview image`);
        return;
      }
      working = true;

      try {
        let [im] = await this._env.camera.getFrame(when, ['gray']);
        detectCats(im, when, (rects) => {
          let what;
          if (rects.length > 0) {
            what = `${rects.length}`;
            timeline.addObjects([{
              source: 'detectcat',
              tag: cascade.tag,
              when,
              rects,
            }]);
          } else {
            what = ' -';
          }
          log.info(`Detected cats: ${what}`);
          working = false;
        });
      } catch (err) {
        log.error(`${err.stack} || ${err}`);
        working = false;
      }
    });
  }
}

module.exports = (env: Env, cascadeFile: string) => new DetectCat(env, cascadeFile);
