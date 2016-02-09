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
import DiffSubtractor from './diffsubtractor';

let log;
let util;
let timeline;

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
    timeline = this._env.timeline;
    soundEnabled = util.getboolprop(MOTION_PLAY_SOUND_PROP);

    this.working = false;
    this.motionzone = new MotionZone(this._env);
    this.subtractor = new DiffSubtractor();
    timeline.on('preview', this._onPreview);
  }

  _onPreview = (when) => {
    log.debug(`Retrieving frame ${when}`);
    if (this.working) {
      log.error('Still busy, unable to process next preview image');
      return;
    }

    this.working = true;
    this.when = when;
    this._env.camera.getPreviewFrame(when, 'gray', this._onPreviewFrame);
  };

  _onPreviewFrame = (err, image) => {
    if (err) {
      log.warn(`Unable to fetch frame: ${err}`);
      this.working = false;
      return;
    }
    const when = this.when;
    const start = Date.now();

    let maskedImage = this.motionzone.applyIgnoreMask(image);

    // Apply Gaussian smoothing to average pixel intensities due to tiny
    // variations in the digital camera sensor
    maskedImage.gaussianBlur([GAUSSIAN_KERNEL_SIZE, GAUSSIAN_KERNEL_SIZE]);
    timeline.addDiagFrame('blurred', when, maskedImage);

    this.subtractor.apply(maskedImage, (motion) => {
      maskedImage.release();

      timeline.addDiagFrame('diff', when, motion);

      // Threshold the image, low differences are ignored (ex. contrast change due
      // to sunlight)
      motion = motion.threshold(THRESHOLD, MAX_THRESHOLD_VAL, 'Binary');
      timeline.addDiagFrame('threshold', when, motion);

      // Dilate the thresholded image to fill in holes
      motion.dilate(NUM_ITERATIONS_DILATE);
      timeline.addDiagFrame('dilate', when, motion);

      // Compute edges by subtracting an eroded version of the image
      let gooeyInsides = motion.copy();
      silkcv.Matrix.erodeWithBlackBorder(gooeyInsides, 2);

      let edges = new cv.Matrix();
      edges.absDiff(motion, gooeyInsides);
      gooeyInsides.release();

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
        this.motionzone.groupRectangles(rects);
        if (timeline.diagFrameEnabled(`pixels`)) {
          log.debug(`group rects: ${JSON.stringify(rects)}`);

          let motionMask = new cv.Matrix(image.height(), image.width(), cv.Constants.CV_8UC1, [0]);
          rects.forEach(r => {
            motionMask.rectangle([r.x, r.y], [r.width, r.height], [255, 255, 255], cv.Constants.CV_FILLED);
          });
          timeline.addDiagFrame(`mask`, when, motionMask);

          let motionPixels = new cv.Matrix(image.height(), image.width(), cv.Constants.CV_8UC1, [0]);
          image.copyWithMask(motionPixels, motionMask);
          timeline.addDiagFrame(`pixels`, when, motionPixels);

          motionPixels.release();
          motionMask.release();
        }
      }

      edges.release();

      let diff = Date.now() - start;
      log.verbose(`Motion detection ran for ${diff}ms`);

      if (rects && (rects.length > 0)) {
        timeline.addObjects([{tag: 'motion', when, rects}]);
        _playSound();
      } else {
        timeline.noMotion(when);
      }
      this.working = false;
    });
  };

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
