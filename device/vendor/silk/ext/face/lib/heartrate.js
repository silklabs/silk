/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import CBuffer from 'CBuffer';
import movingAverage from 'moving-average';
import silkcv from 'silk-cv';

import HeartRateAnalyzer from './heartrate_analyzer';
import safeRoi from './safe_roi.js';

import type { Env, Camera, Timeline, Log } from 'silk-exttest/interface/env';
import type { Face } from './face';

let log: Log;
let camera: Camera;
let timeline: Timeline;

const FFT_SIZE = 128; // Should be a power of 2

// Total samples needed for heart rate estimation
const TOTAL_SAMPLES = FFT_SIZE;

const FILTER_LOW_FREQ = 0.7; // 42 bpm
const FILTER_HIGH_FREQ = 4; // 240 bpm
const AVERAGE_BPM_DURATION = 5000; // Average BPM for the last these many seconds

let isPowerOfTwo = (x) => (x & (x - 1)) === 0;

/**
 * This class measures the heart rate of a person by measuring the light
 * reflected from the face as blood flows through the face. Hemoglobin absorbs
 * light so when blood is flowing through the face, less light is reflected than
 * usual.
 */
export default class HeartRate {
  _face: Face;
  _y: CBuffer<number>;
  _cb: CBuffer<number>;
  _cr: CBuffer<number>;
  _when: CBuffer<number>;
  _frameCount: number;
  _busy: boolean = false;
  _averageBpm: Function;

  constructor(env: Env, face: Face) {
    log = env.log;
    camera = env.camera;
    timeline = env.timeline;
    this._face = face;

    this._y = new CBuffer(TOTAL_SAMPLES);
    this._cb = new CBuffer(TOTAL_SAMPLES);
    this._cr = new CBuffer(TOTAL_SAMPLES);
    this._frameCount = 0;

    this._averageBpm = movingAverage(AVERAGE_BPM_DURATION);
    this.analyzer = this._createHeartRateAnalyzer(env, FFT_SIZE,
        (1000 / camera.FAST_FRAME_DELAY_MS));

    if (process.platform === 'android') {
      this._getMean = (im, rect, when) => {
        return this._yvu420spMean(im, rect, when);
      };
    } else {
      this._getMean = (im, rect, when) => {
        return this._rgbMean(im, rect, when);
      };
    }
  }

  /**
   * Start heart rate estimation
   */
  start() {
    log.info(`Starting heart rate estimation`);
    timeline.on('preview-fast', this._onPreview);

    this._heartRateInterval = setInterval(this._getHeartRate, 1000);
  }

  /**
   * Cancel heart rate estimation
   */
  async cancel() {
    timeline.removeListener('preview-fast', this._onPreview);
    if (this._heartRateInterval) {
      clearInterval(this._heartRateInterval);
      this._heartRateInterval = null;
    }

    this._y.empty();
    this._cb.empty();
    this._cr.empty();
  }

  /**
   * Create and return a heart rate analyzer
   *
   * @param env
   * @param fftSize: size of requested FFT window. It should be a power of 2
   * @param sampleRate: Sampling rate of the input data
   */
  _createHeartRateAnalyzer(env, fftSize, sampleRate) {
    if (!(0 <= fftSize && fftSize === (fftSize | 0) && isPowerOfTwo(fftSize))) {
      log.error(`'fftSize' must be a power of two`);
      return null;
    }
    return new HeartRateAnalyzer(env, fftSize, sampleRate, FILTER_LOW_FREQ,
        FILTER_HIGH_FREQ);
  }

  /**
   * Call HeartRateAnalyzer to analyze the components and estimate
   * the heart rate
   */
  _getHeartRate = () => {
    log.debug(`Frame rate ${this._frameCount}`);
    this._frameCount = 0;

    // Check if we have enough samples already
    if (this._cr.size < TOTAL_SAMPLES) {
      return;
    }

    if (!this.analyzer) {
      return;
    }

    let bpm = this.analyzer.estimateAll(this._y.toArray(), this._cb.toArray(),
        this._cr.toArray());

    // Calculate exponential moving average
    this._averageBpm.push(Date.now(), bpm);
    let avgbpm = Math.floor(this._averageBpm.movingAverage());

    log.info(`********`);
    log.info(`bpm: ${avgbpm}`);
    log.info(`********`);
  };

  /**
   * Process camera preview
   */
  _onPreview = async (when: number, imRaw: any): Promise<void> => {
    if (this._busy) {
      log.debug(`onPreview busy, skipping update`);
      return;
    }
    this._busy = true;

    // Get the roi on the fullsize image
    try {
      const frameRect = camera.normalRectsTo([this._face.rect.forehead], 'full')[0];

      // Create means of RGB/YCbCr channels over the entire roi and store it
      let means = this._getMean(imRaw, frameRect, when);
      this._y.push(parseFloat(means[0].toFixed(4)));
      this._cb.push(parseFloat(means[1].toFixed(4)));
      this._cr.push(parseFloat(means[2].toFixed(4)));
      this._frameCount++;
    } catch (err) {
      log.error(`Error getting face rectangle: ${err.stack || err}`);
    }
    this._busy = false;
  };

  /**
   * Return means for R, G and B components of an RGB frame
   */
  _rgbMean(im, rect, when) {
    const roi = safeRoi(im, rect);
    let mean = roi.mean();

    // Add diag frame if enabled
    const diagId = `fullForehead:${this._face.id}`;
    if (timeline.diagFrameEnabled(diagId)) {
      timeline.addDiagFrame(diagId, when, roi);
    }
    roi.release();

    return mean;
  }

  /**
   * Return means for Y, Cb and Cr components from YVU420SP raw frame.
   */
  _yvu420spMean(im, rect, when) {
    // Add diag frame if enabled
    const diagId = `fullForehead:${this._face.id}`;
    if (timeline.diagFrameEnabled(diagId)) {
      const roi = safeRoi(im, rect);
      timeline.addDiagFrame(diagId, when, roi);
      roi.release();
    }

    return silkcv.Matrix.yvu420spMean(im, rect);
  }
}
