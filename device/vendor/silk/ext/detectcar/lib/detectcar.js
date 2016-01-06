/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

// Load the regnerator polyfill manually so we don't need to also load all the
// core-js pollyfills which we don't actually need...
import regeneratorRuntime from 'babel-runtime/regenerator';
global.regeneratorRuntime = global.regeneratorRuntime || regeneratorRuntime;

import fs from 'mz/fs';
import path from 'path';

let log;
let timeline;

const REPORT_OBJECT_DIR = '/data/silk/opencv/';

const cascade = {
  tag: 'car', file: '/system/silk/media/opencv/hogcascade_cars_sideview.xml',
  opts: {
    scale: 1.2,
    neighbors: 2,
  },
};

/**
 * Call opencv methods to detect car as defined by {@code cascades}
 *
 * @param im image representing region of interest
 * @param when timestamp of the preview image
 * @param cb user callback
 */
function detectCars(im, when, cb) {
  let start = Date.now();

  im.detectObject(cascade.file, cascade.opts, (err, rects) => {
    if (err) {
      throw err;
    }
    let diff = Date.now() - start;
    let msg = `Cascade ran for ${diff}ms`;
    if (diff > 500) {
      log.warn(msg);
    } else {
      log.verbose(msg);
    }
    cb({tag: cascade.tag, when, rects});
  });
}

/**
 *
 */
class DetectCar {
  constructor(env, cascadeFile) {
    // Override cascade file if explicitly provided
    cascade.file = cascadeFile || cascade.file;

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

        detectCars(im, when, cars => {
          this._notifyCars(cars);
          working = false;
        });
      }, when, 1);
    });
  }

  /**
   * Notify timeline of the new cars detected
   * @param cars
   */
  _notifyCars(cars) {
    let what;
    if (cars.rects.length > 0) {
      what = `${cars.rects.length}`;
      timeline.addObjects([cars]);
    } else {
      what = ' -';
    }
    log.info(`Detected cars: ${what}`);
  }
}

module.exports = (env, cascadeFile) => new DetectCar(env, cascadeFile);
