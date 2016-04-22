/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import type { Log } from 'silk-sdk-glue/interface/env';
import silkcv from 'silk-cv';
import bandPassFilter from './bandpass_filter';
import regression from 'regression';

// Constants used to compute the Blackman windowing function below.
// See WebAudio specification, section 2.23.3 "FFT Windowing and
// smoothing over time".
const ALPHA = 0.16;
const A0 = 0.5 * (1 - ALPHA);
const A1 = 0.5;
const A2 = 0.5 * ALPHA;

let log: Log;

function tryGetFFT() {
  let fftSync = null;
  try {
    fftSync = require('kissfft').fftSync;
  } catch (e) {
    log.error(`No FFT implementation available (${e})`);
  }
  return fftSync;
}

/**
 * This class preprocesses the input samples provided and runs
 * an FFT on the samples to calculate the bpm for each of the components.
 */
export default class HeartRateAnalyzer {
  fft: any;
  fftSize: number;
  inputWindowStartTime: number;
  sampleRate: number;

  // This is a private API.  Use `createHeartRateAnalyzer()` instead.
  constructor(env, fftSize, sampleRate, bandFilterLowFreq, bandFilterHighFreq) {
    log = env.log;
    this.fftSize = fftSize;
    this.sampleRate = sampleRate;

    this.hzPerBin = this.sampleRate / this.fftSize;
    this.minFreqBin = Math.floor(bandFilterLowFreq / this.hzPerBin) - 1; // 0-indexed
    this.maxFreqBin = Math.floor(bandFilterHighFreq / this.hzPerBin) - 1;
    log.info(`minFreqBin: ${this.minFreqBin + 1} maxFreqBin: ${this.maxFreqBin + 1} hzPerBin: ${this.hzPerBin}`);

    this.fft = tryGetFFT(this.fftSize);
  }

  /**
   * Return the number of frequency bins that each FFT will compute,
   * i.e. the number of complex values returned by the `'fft'` event
   * and the number of magnitudes returned by the `'fftMagnitude*'`
   * events.
   */
  get frequencyBinCount() {
    return this.fftSize / 2;
  }

  /**
   * Detrend, scale, filter and normalize the samples
   *
   * @return the normalized sample as Float32Array
   */
  _preprocess(samples) {
    let fftInput = new Array(this.fftSize);

    // Detrend input signal
    let data = samples.map((sample, index) => {
      return [index, sample];
    });
    let result = regression('linear', data);
    samples = result.points.map((point, index) => {
      return samples[index] - point[1];
    });

    // sampleMin: minimum possible value for any sample
    // sampleMax: maximum possible value for any sample
    // sampleMin and sampleMax are used to normalize the input samples
    let sampleMax = Math.max.apply(Math, samples);
    let sampleMin = Math.min.apply(Math, samples);
    let range = (sampleMax - sampleMin);
    let scale = 2.0 / range;
    let offset = -(sampleMax + sampleMin) / range;

    for (let i = 0; i < this.fftSize; ++i) {
      fftInput[i] = samples[i] * scale + offset;
    }

    // Run band pass filter
    fftInput = bandPassFilter(fftInput);

    // Apply Blackman windowing function (see above) to normalized samples.
    const N = this.fftSize;
    for (let i = 0; i < this.fftSize; ++i) {
      let x = i / N;
      let window = (A0 -
                    A1 * Math.cos(2 * Math.PI * x) +
                    A2 * Math.cos(4 * Math.PI * x));
      fftInput[i] *= window;
    }
    return fftInput;
  }

  /**
   * Run analyses on the current full sample window and deliver results to
   * clients.
   *
   * @return an array of:
   *  - output: complex numbers `(r + i c)` comprising the FFT of the
   *     current analysis window, returned interleaved as `[ r_1, c_1, r_2,
   *     c_2, ..., r_N, c_N ]`.
   *  - outputMagnitudes: array of FFT magnitudes (amplitudes) on
   *     linear scale
   *  - dc
   *  - nyquist
   */
  _runFFT(samples) {
    let fftInput = new Float32Array(this.fftSize);
    fftInput.set(samples);

    let fftOutput = new Float32Array(this.fftSize + 2);
    let outputMagnitudes = new Float32Array(this.fftSize / 2);

    let output = this.fft(fftInput, fftOutput);

    // Compute the linear magnitudes of the frequency domain data.
    let i = 0;
    for (i = 0; i < this.frequencyBinCount; ++i) {
      let [ r, c ] = [ output[2 * i], output[2 * i + 1] ];
      outputMagnitudes[i] = Math.hypot(r, c) / this.fftSize;
    }

    let dc = output[2 * i];
    let nyquist = output[2 * i + 1];

    return [output, outputMagnitudes, dc, nyquist];
  }

  /**
   * Find the FFT bin with the highest magnitude with in the specified
   * range and calculate the heart rate.
   *
   * @param fftInput Float32Array of time domain samples
   * @return An object with heart rate in beats per minute (bpm) and its magnitude
   */
 estimate(fftInput) {
   // Run the forward FFT on the normalized and windowed samples.
   if (!this.fft) {
     log.error('No FFT implementation available, skipping further processing');
     return null;
   }

   let [output, outputMagnitudes, dc, nyquist] = this._runFFT(fftInput); // eslint-disable-line no-unused-vars
   log.debug(`outputMagnitudes: ${outputMagnitudes}`);

   let maxBin = this.minFreqBin;
   for (let i = this.minFreqBin; i < this.maxFreqBin; i++) {
     if (outputMagnitudes[i] > outputMagnitudes[maxBin]) {
       maxBin = i;
     }
   }
   let bpm = (maxBin + 1) * this.hzPerBin * 60;
   let maxIca = Math.max(...fftInput);
   return {bpm: Math.floor(bpm), magnitude: outputMagnitudes[maxBin], maxIca};
 }

 /**
  * Estimate the heartrate given all three components
  */
 estimateAll(y, cb, cr) {
   let yInput = this._preprocess(y);
   let cbInput = this._preprocess(cb);
   let crInput = this._preprocess(cr);

   // Run Independent Component Analysis on the sources to eliminate motion
   // artifacts
   let result = silkcv.Ica.jade(yInput, cbInput, crInput);
   log.debug(`ICA[0] ${result[0]}`);
   log.debug(`ICA[1] ${result[1]}`);
   log.debug(`ICA[2] ${result[2]}`);

   // Estimate heartrate on all three components
   let result0 = this.estimate(result[0]);
   let result1 = this.estimate(result[1]);
   let result2 = this.estimate(result[2]);

   // Sort result in descending order of magnitude
   result = [result0, result1, result2];
   result.sort((a, b) => {
     return (a.magnitude > b.magnitude) ? -1 :
         ((a.magnitude === b.magnitude) ? 0 : 1);
   });

   // Pick the component with the highest magnitude
   let bpm = result[0].bpm;
   log.info(`comp 1 bpm: ${result[0].bpm}, ${result[0].magnitude} ${result[0].maxIca}`);
   log.info(`comp 2 bpm: ${result[1].bpm}, ${result[1].magnitude} ${result[1].maxIca}`);
   log.info(`comp 3 bpm: ${result[2].bpm}, ${result[2].magnitude} ${result[2].maxIca}`);
   return bpm;
 }
}
