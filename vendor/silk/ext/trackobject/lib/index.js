/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */
let cv = require('opencv');

let log;
let prevFrame = null, currentFrame = null, nextFrame = null;

/**
 * Following constans could be tweaked to improve motion detection
 */
// Maximum deviation of the image, higher the value more the motion is allowed
// This is used to isolate big changes like snow or sunlight changes
const MAX_DEVIATION = 75;

// Low differences are ignored (ex. contrast change due to sunlight)
const THRESHOLD = 45;
const MAX_THRESHOLD_VAL = 255;

// If more than 'MOTION_THRESHOLD' pixels are changed, we say there is motion
let MOTION_THRESHOLD = 10;

const NUM_ITERATIONS_ERODE = 1;


/**
 * Compare three consecutive frames by diffing them and find out how many pixels
 * have changed. Also calculate the biggest rectangle representing the changed
 * pixels
 *
 * Reference: https://kerberos.io/
 */
function _detectMotion(image, callback) {
  // d1 and d2 for calculating the differences
  // motion, the result of "and" operation, calculated on d1 and d2
  // numChanges, the amount of changes in the result matrix.
  let d1, d2, motion;

  // Window in which to detect for motion
  let xStart = 0, xStop = image.width();
  let yStart = 0, yStop = image.height();

  // Take a new image
  prevFrame = currentFrame;
  currentFrame = nextFrame;
  nextFrame = image;

  // Check if atleast three frames are available
  if (!prevFrame || !currentFrame) {
    callback(0);
    return;
  }

  // Calc differences between the images and do AND-operation
  d1 = new cv.Matrix(xStop, yStop);
  d1.absDiff(prevFrame, nextFrame);
  d2 = new cv.Matrix(xStop, yStop);
  d2.absDiff(nextFrame, currentFrame);
  motion = new cv.Matrix(xStop, yStop);
  motion.bitwiseAnd(d1, d2);

  // Threshold the image, low differences are ignored (ex. contrast change due
  // to sunlight)
  motion = motion.threshold(THRESHOLD, MAX_THRESHOLD_VAL, 'Binary');
  motion.erode(NUM_ITERATIONS_ERODE);

  let meanStdDev;
  meanStdDev = motion.meanStdDev(); // calculate the standard deviation

  // If not too much changes then the motion is real (neglect agressive snow,
  // temporary sunlight)
  if (meanStdDev.stddev.get(0, 0) < MAX_DEVIATION) {
    let numChanges = 0;
    let minx = motion.width(), maxx = 0;
    let miny = motion.height(), maxy = 0;

    // Loop over image and detect changes
    for (let j = yStart; j < yStop; j += 2) { // height
      for (let i = xStart; i < xStop; i += 2) { // width
        // Check if at pixel (j,i) intensity is equal to 255 this means that the
        // pixel is different in the sequence of images
        // (prevFrame, currentFrame, nextFrame)
        if (motion.pixel(j, i) === MAX_THRESHOLD_VAL) {
          numChanges++;
          if (minx > i) {
            minx = i;
          }
          if (maxx < i) {
            maxx = i;
          }
          if (miny > j) {
            miny = j;
          }
          if (maxy < j) {
            maxy = j;
          }
        }
      }
    }

    // Remove this code once silk-server#150 is resolved
    if (numChanges) {
      // Check if not out of bounds
      if ((minx - 10) > 0) {
        minx -= 10;
      }
      if ((miny - 10) > 0) {
        miny -= 10;
      }
      if ((maxx + 10) < (image.cols - 1)) {
        maxx += 10;
      }
      if ((maxy + 10) < (image.rows - 1)) {
        maxy += 10;
      }
      log.debug(`rect: [${minx}, ${miny}, ${maxx}, ${maxy}]`);
    }
    callback(numChanges, {x: minx, y: miny, width: maxx - minx, height: maxy - miny});
  } else {
    callback(0);
  }
}

/**
 * Entry point into this module
 */
export default function init(env) {
  log = env.log;
  let working = false;

  env.timeline.on('preview', (when, retrieveFunc) => {
    if (working) {
      log.error('Still busy, unable to process next preview image');
      return;
    }

    working = true;
    retrieveFunc((err, image) => {
      if (err) {
        log.warning(`Unable to fetch frame: ${err}`);
        working = false;
        return;
      }

      let start = Date.now();

      _detectMotion(image, (numChanges, rect) => {
        let diff = Date.now() - start;
        log.verbose(`Motion detection ran for ${diff}ms numChanges: ${numChanges}`);

        // If a lot of changes happened, we assume something changed.
        if (numChanges >= MOTION_THRESHOLD) {
          env.timeline.addObject('motion', when, rect);
        }
        working = false;
      });
    }, 1 /* == 1 channel image (RGB not required) */);
  });
}
