/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

let log;
let timeline;

const cascade = {
  tag: 'cat', file: '/system/silk/media/opencv/lbpcascade_cat.xml',
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
function detectCats(im, when, cb) {
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
    cb({tag: cascade.tag, when, rects});
  });
}

class DetectCat {
  constructor(env, cascadeFile) {
    // Override cascade file if explicitly provided
    cascade.file = cascadeFile || cascade.file;

    this._env = env;
    this._init();
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

        detectCats(im, when, cats => {
          this._notifyCats(cats);
          working = false;
        });
      }, when, 1);
    });
  }

  /**
   * Notify timeline of the new cats detected
   * @param cats
   */
  _notifyCats(cats) {
    let what;
    if (cats.rects.length > 0) {
      what = `${cats.rects.length}`;
      timeline.addObjects([cats]);
    } else {
      what = ' -';
    }
    log.info(`Detected cats: ${what}`);
  }
}

module.exports = (env, cascadeFile) => new DetectCat(env, cascadeFile);
