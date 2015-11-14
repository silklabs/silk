/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
import cv from 'opencv';

let log;
let util;
let prevFrame = null, currentFrame = null, nextFrame = null;

/**
 * Following constants could be tweaked to improve motion detection
 */
// Maximum deviation of the image, higher the value more the motion is allowed
// This is used to isolate big changes like snow or sunlight changes
const MAX_DEVIATION = 75;

// Low differences are ignored (ex. contrast change due to sunlight)
const THRESHOLD = 25;
const MAX_THRESHOLD_VAL = 255;

// If more than 'MOTION_THRESHOLD' pixels are changed, we say there is motion
let MOTION_THRESHOLD = 1;

const NUM_ITERATIONS_ERODE = 1;

// Enable sound when motion is detected
const MOTION_PLAY_SOUND_PROP = 'persist.silk.motion.sound';
let soundEnabled = false;

// Minimum rectangle size for motion
const MIN_WIDTH = 10;
const MIN_HEIGHT = 10;

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
  d1 = new cv.Matrix(xStop, yStop, cv.Constants.CV_8UC1);
  d1.absDiff(prevFrame, nextFrame);
  d2 = new cv.Matrix(xStop, yStop, cv.Constants.CV_8UC1);
  d2.absDiff(nextFrame, currentFrame);
  motion = new cv.Matrix(xStop, yStop, cv.Constants.CV_8UC1);
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

    let width = 0;
    let height = 0;
    if (numChanges) {
      width = maxx - minx;
      height = maxy - miny;

      // Check if the motion rectangle size is bigger than the minimum required
      if ((width < MIN_WIDTH) || (height < MIN_HEIGHT)) {
        log.debug(`Ignoring motion: ${width} x ${height}`);
        callback(0);
        return;
      }

      log.debug(`rect: [${minx}, ${miny}, ${width}, ${height}]`);
    }
    callback(numChanges, {x: minx, y: miny, width, height});
  } else {
    callback(0);
  }
}

/**
 * Play a sound when motion is detected
 */
function _playSound() {
  const FILE_NAME = 'motion_detected.mp3';
  if (soundEnabled) {
    util.playSound(FILE_NAME);
  }
}


/**
 * Entry point into this module
 */
export default function init(env) {
  log = env.log;
  util = env.util;
  let working = false;
  let timeline = env.timeline;
  soundEnabled = util.getboolprop(MOTION_PLAY_SOUND_PROP);

  timeline.on('preview', when => {
    log.debug(`Retrieving frame ${when}`);
    if (working) {
      log.error('Still busy, unable to process next preview image');
      return;
    }

    working = true;
    env.camera.getPreviewFrame((err, image) => {
      if (err) {
        log.warn(`Unable to fetch frame: ${err}`);
        working = false;
        return;
      }

      let start = Date.now();

      _detectMotion(image, (numChanges, rect) => {
        let diff = Date.now() - start;
        log.verbose(`Motion detection ran for ${diff}ms numChanges: ${numChanges}`);

        // If a lot of changes happened, we assume something changed.
        if (numChanges >= MOTION_THRESHOLD) {
          timeline.addObject('motion', when, rect);
          _playSound();
        } else {
          timeline.noMotion(when);
        }
        working = false;
      });
    }, when, 1 /* == 1 channel image (RGB not required) */);
  });
}
