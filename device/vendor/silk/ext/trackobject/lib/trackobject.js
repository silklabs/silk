/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

// Load the regnerator polyfill manually so we don't need to also load all the
// core-js pollyfills which we don't actually need...
import regeneratorRuntime from 'babel-runtime/regenerator';
global.regeneratorRuntime = regeneratorRuntime;

import cv from 'opencv';
import MotionZone from './motionzone';

let log;
let util;
let prevFrame = null, currentFrame = null, nextFrame = null;

/**
 * Following constants could be tweaked to improve motion detection
 */
// Low differences are ignored (ex. contrast change due to sunlight)
const THRESHOLD = 25;
const MAX_THRESHOLD_VAL = 255;

const NUM_ITERATIONS_DILATE = 2;

// Enable sound when motion is detected
const MOTION_PLAY_SOUND_PROP = 'persist.silk.motion.sound';
let soundEnabled = false;

// Minimum rectangle size for motion
const MIN_AREA = 500;

const GAUSSIAN_KERNEL_SIZE = 21;

/**
 * Compare three consecutive frames by diffing them and find out how many pixels
 * have changed. Also calculate the biggest rectangle representing the changed
 * pixels
 *
 * Reference: https://kerberos.io/
 */
function _detectMotion(image, motionZone, callback) {
  // d1 and d2 for calculating the differences
  // motion, the result of "and" operation, calculated on d1 and d2
  // numChanges, the amount of changes in the result matrix.
  let d1, d2, motion;

  // Window in which to detect for motion
  let xStop = image.width();
  let yStop = image.height();

  // Apply Gaussian smoothing to average pixel intensities due to tiny
  // variations in the digital camera sensor
  image.gaussianBlur([GAUSSIAN_KERNEL_SIZE, GAUSSIAN_KERNEL_SIZE]);

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

  // Dilate the thresholded image to fill in holes
  motion.dilate(NUM_ITERATIONS_DILATE);

  // Find contours on thresholded image
  let contours = motion.findContours();
  log.debug(`Contours # ${contours.size()}`);

  let rects = [];
  for (let i = 0; i < contours.size(); i++) {
    if (contours.area(i) < MIN_AREA) {
      continue;
    }
    let rect = contours.boundingRect(i);
    rects.push(rect);
    log.debug(`${JSON.stringify(rect)}`);
  }

  // Group rectangles that intersect with each other or are contained within
  // each other
  if (rects.length > 0) {
    motionZone.groupRectangles(rects);
    log.debug(`group rects: ${JSON.stringify(rects)}`);

    // Remove motion rectangles that fall with in the ignore motion zones
    rects = motionZone.pruneMotionZones(rects);
    log.debug(`pruned rects: ${JSON.stringify(rects)}`);
  }

  callback(rects);
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
 * This class tracks any motion in the preview image and repots discrete motion
 * rectangles
 */
class TrackObject {
  constructor(env) {
    this._env = env;
    log = this._env.log;
    util = this._env.util;
    let working = false;
    let timeline = this._env.timeline;
    soundEnabled = util.getboolprop(MOTION_PLAY_SOUND_PROP);
    this._motionzone = new MotionZone(this._env);

    this._onPreview = when => {
      log.debug(`Retrieving frame ${when}`);
      if (working) {
        log.error('Still busy, unable to process next preview image');
        return;
      }

      working = true;
      this._env.camera.getPreviewFrame((err, image) => {
        if (err) {
          log.warn(`Unable to fetch frame: ${err}`);
          working = false;
          return;
        }

        let start = Date.now();

        _detectMotion(image, this._motionzone, (rects) => {
          let diff = Date.now() - start;
          log.verbose(`Motion detection ran for ${diff}ms`);

          if (rects && (rects.length > 0)) {
            timeline.addObjects([{tag: 'motion', when, rects}]);
            _playSound();
          } else {
            timeline.noMotion(when);
          }
          working = false;
        });
      }, when, 1 /* == 1 channel image (RGB not required) */);
    };

    timeline.on('preview', this._onPreview);
  }

  /**
   *
   */
  willUnload() {
    if (this._onPreview) {
      this._env.timeline.removeListener('preview', this._onPreview);
    }
  }
}

module.exports = (env) => new TrackObject(env);
