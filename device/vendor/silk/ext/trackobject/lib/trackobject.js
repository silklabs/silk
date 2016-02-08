/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

// Load the regnerator polyfill manually so we don't need to also load all the
// core-js polyfills which we don't actually need...
import regeneratorRuntime from 'babel-runtime/regenerator';
global.regeneratorRuntime = global.regeneratorRuntime || regeneratorRuntime;

import cv from 'opencv';
import silkcv from 'silk-cv';
import MotionZone from './motionzone';

let log;
let util;
let timeline;
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
const MIN_AREA = 5 * 5;

const GAUSSIAN_KERNEL_SIZE = 15;

/**
 * Compare three consecutive frames by diffing them and find out how many pixels
 * have changed. Also calculate the biggest rectangle representing the changed
 * pixels
 *
 * Reference: https://kerberos.io/
 */
function _detectMotion(when, image, motionZone, callback) {
  // d1 and d2 for calculating the differences
  // motion, the result of "and" operation, calculated on d1 and d2
  // numChanges, the amount of changes in the result matrix.
  let d1, d2, motion;

  // Window in which to detect for motion
  let imageWidth = image.width();
  let imageHeight = image.height();

  // Take a new image
  if (prevFrame) {
    prevFrame.release();
  }
  prevFrame = currentFrame;
  currentFrame = nextFrame;
  nextFrame = motionZone.applyIgnoreMask(image);

  // Apply Gaussian smoothing to average pixel intensities due to tiny
  // variations in the digital camera sensor
  nextFrame.gaussianBlur([GAUSSIAN_KERNEL_SIZE, GAUSSIAN_KERNEL_SIZE]);

  // Check if at least three frames are available
  if (!prevFrame || !currentFrame) {
    callback(0);
    return;
  }
  timeline.addDiagFrame('blurred', when, nextFrame);

  // Calc differences between the images and do AND-operation
  d1 = new cv.Matrix(imageHeight, imageWidth, cv.Constants.CV_8UC1);
  d1.absDiff(prevFrame, nextFrame);
  d2 = new cv.Matrix(imageHeight, imageWidth, cv.Constants.CV_8UC1);
  d2.absDiff(nextFrame, currentFrame);
  motion = new cv.Matrix(imageHeight, imageWidth, cv.Constants.CV_8UC1);
  motion.bitwiseAnd(d1, d2);
  d1.release();
  d2.release();

  timeline.addDiagFrame('diff', when, motion);

  // Threshold the image, low differences are ignored (ex. contrast change due
  // to sunlight)
  motion = motion.threshold(THRESHOLD, MAX_THRESHOLD_VAL, 'Binary');
  timeline.addDiagFrame('threshold', when, motion);

  // Dilate the thresholded image to fill in holes
  motion.dilate(NUM_ITERATIONS_DILATE);
  timeline.addDiagFrame('dilate', when, motion);

  // Compute edges by subtracting an eroded version of the image (the
  // "gooeyInsides")
  let gooeyInsides = motion.copy();
  silkcv.Matrix.erodeWithBlackBorder(gooeyInsides, 2);

  let edges = new cv.Matrix();
  edges.absDiff(motion, gooeyInsides);

  timeline.addDiagFrame('edges', when, edges);

  // Find contours (note that findContours() writes onto |edges|)
  let contours = edges.findContours();
  let rects = [];
  let diagEnabled = timeline.diagFrameEnabled(`contours`);
  for (let i = 0; i < contours.size(); i++) {
    const rect = contours.boundingRect(i);
    let color = [63, 63, 63];
    if (contours.area(i) >= MIN_AREA) {
      rects.push(rect);
      color = [255, 255, 255];
    }
    if (diagEnabled) {
      edges.rectangle(
        [rect.x, rect.y],
        [rect.width, rect.height],
        color,
        1
      );
    }
  }

  if (diagEnabled) {
    timeline.addDiagFrame(`contours`, when, edges);
  }

  // Group rectangles that intersect with each other or are contained within
  // each other

  if (rects.length > 0) {
    motionZone.groupRectangles(rects);
    if (timeline.diagFrameEnabled(`pixels`)) {
      log.debug(`group rects: ${JSON.stringify(rects)}`);

      let motionMask = new cv.Matrix(imageHeight, imageWidth, cv.Constants.CV_8UC1, [0]);
      rects.forEach(r => {
        motionMask.rectangle([r.x, r.y], [r.width, r.height], [255, 255, 255], cv.Constants.CV_FILLED);
      });
      timeline.addDiagFrame(`mask`, when, motionMask);

      let motionPixels = new cv.Matrix(imageHeight, imageWidth, cv.Constants.CV_8UC1, [0]);
      image.copyWithMask(motionPixels, motionMask);
      timeline.addDiagFrame(`pixels`, when, motionPixels);

      motionPixels.release();
      motionMask.release();
    }
  }

  edges.release();
  motion.release();
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
    timeline = this._env.timeline;
    soundEnabled = util.getboolprop(MOTION_PLAY_SOUND_PROP);
    this._motionzone = new MotionZone(this._env);

    this._onPreview = when => {
      log.debug(`Retrieving frame ${when}`);
      if (working) {
        log.error('Still busy, unable to process next preview image');
        return;
      }

      working = true;
      this._env.camera.getPreviewFrame(when, 'gray', (err, image) => {
        if (err) {
          log.warn(`Unable to fetch frame: ${err}`);
          working = false;
          return;
        }

        let start = Date.now();

        _detectMotion(when, image, this._motionzone, (rects) => {
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
      });
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
