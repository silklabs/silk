/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import cv from 'opencv';
import path from 'path';
import * as silkcv from 'silk-cv';
import MotionZone from './motionzone';
import DiffSubtractor from './diffsubtractor';
import MogSubtractor from './mogsubtractor';
import * as util from 'silk-sysutils';
import Player from 'silk-audioplayer';

import type { Env, Log, Camera, Timeline } from 'silk-exttest';
type PreviewType = (when: number) => void;

let camera: Camera;
let log: Log;
let timeline: Timeline;

/**
 * Following constants could be tweaked to improve motion detection
 */
// Low differences are ignored (ex. contrast change due to sunlight)
const THRESHOLD = 25;
const MAX_THRESHOLD_VAL = 255;

const NUM_ITERATIONS_DILATE = 2;

// Enable sound when motion is detected
const MOTION_PLAY_SOUND_PROP = 'persist.silk.motion.sound';
const MOTION_SUBTRACTOR_PROP = 'persist.silk.motion.subtractor';
let soundEnabled = false;

// Minimum rectangle size for motion
const MIN_AREA = 100;

const GAUSSIAN_KERNEL_SIZE = 15;

const MOTION_DURATION_MS = 250;

const SOUND_FILE = path.join(__dirname, '../motion_detected.mp3');
const player = new Player();

/**
 * Play a sound when motion is detected
 */
function _playSound() {
  if (soundEnabled) {
    player.play(SOUND_FILE);
  }
}

/**
 * This class detects motion in the preview image and reports discrete motion
 * rectangles
 */
class Motion {
  _env: Env;
  working: boolean;
  motionzone: MotionZone;
  subtractor: DiffSubtractor | MogSubtractor;

  constructor(env: Env) {
    this._env = env;
    camera = this._env.camera;
    log = this._env.log;
    timeline = this._env.timeline;
    soundEnabled = util.getboolprop(MOTION_PLAY_SOUND_PROP);

    this.working = false;
    this.motionzone = new MotionZone(env, env.camera.getFrameSize('low'));

    const subtractorName = util.getprop(MOTION_SUBTRACTOR_PROP, 'mog2');
    switch (subtractorName) {
    default:
      log.warn('Unknown', MOTION_SUBTRACTOR_PROP, 'value:', subtractorName);
      //fall through
    case 'mog2':
      this.subtractor = new MogSubtractor(env);
      break;
    case 'diff':
      this.subtractor = new DiffSubtractor(env);
      break;
    }

    timeline.on('preview', this._onPreview);
  }

  _onPreview: PreviewType = async (when) => {
    log.debug(`Retrieving frame ${when}`);
    if (this.working) {
      log.error('Still busy, unable to process next preview image');
      return;
    }

    this.working = true;
    try {
      let [image] = await camera.getFrame(when, ['lowgray']);

      const start = Date.now();

      let maskedImage = this.motionzone.applyIgnoreMask(image);

      // Apply Gaussian smoothing to average pixel intensities due to tiny
      // variations in the digital camera sensor
      maskedImage.gaussianBlur([GAUSSIAN_KERNEL_SIZE, GAUSSIAN_KERNEL_SIZE]);
      timeline.addDiagFrame('blurred', when, maskedImage);

      this.subtractor.apply(when, maskedImage, (motion) => {
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
          const normalRects = camera.normalRectsFrom(rects, 'low');
          timeline.addObjects([{
            source: 'motion',
            tag: 'motion',
            when,
            rects: normalRects,
            durationMs: MOTION_DURATION_MS,
          }]);
          _playSound();
        } else {
          timeline.noMotion(when);
        }
        this.working = false;
      });
    } catch (err) {
      log.error(err);
      this.working = false;
    }
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

module.exports = (env: Env) => new Motion(env);
