/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import EventEmitter from 'events';

import AudioAnalyzer from './AudioAnalyzer';

import type {SvmSoundsConfig} from '..';

/**
 * Return the value of the maximum element of `array`.
 *
 * A naive grasshopper might be tempted to write something like
 * `Math.max(...array)`, but that would be foolish indeed.  Something
 * pathological in the spread-operator translation causes that
 * expression to run ~200x slower than this loop on device.
 */
function max(array) {
  let maxValue = -Infinity;
  for (let i = 0; i < array.length; ++i) {
    maxValue = Math.max(array[i], maxValue);
  }
  return maxValue;
}

/**
 * Extract "feature vectors" from an incoming audio stream by way of
 * an AudioAnalyzer.
 *
 * Two events are emitted:
 *
 *  'loud-sound': a loud sound was detected over the duration
 *    determined by the feature-vector length.  The feature vector
 *    itself and start/end times for the vector are passed to the
 *    listener.
 *
 *  'quiet': no lound sounds have been detected over the prior "quiet
 *    timeout" since the last loud sound.
 *
 * The configuration params affected behavior of
 * FeatureVectorExtractor are
 *
 *  'featureVectorFrameCount': how many FFT frames (samples of the
 *    frequency domain) comprise a feature vector
 *
 *  'quietTimeout': how many seconds of quiet after a loud-sound event
 *    before emitting a 'quiet' event.
 */
export default class FeatureVectorExtractor extends EventEmitter {
  analyzer: AudioAnalyzer;
  cfg: SvmSoundsConfig;
  currentLoudStartTime: number;
  featureVector: Float32Array;
  featureVectorIndex: number;
  lastLoudEndTime: number;

  constructor(analyzer: AudioAnalyzer, cfg: SvmSoundsConfig) {
    super();

    this.analyzer = analyzer;
    this.cfg = cfg;
    this.featureVector = new Float32Array(cfg.featureVectorFrameCount *
                                          analyzer.frequencyBinCount);

    this.analyzer.on(cfg.fftType, this._onFFTMagnitude);
    this._clearQuietTimeout();
    this._resetLoudDetector();
  }

  destructor() {
    this.analyzer.removeListener(this.cfg.fftType, this._onFFTMagnitude);
    this.removeAllListeners();
  }

  _onFFTMagnitude = (magnitudes: Float32Array, startTime: number, endTime: number) => {
    if (!this._detectingLoudSound) {
      let isLoud = max(magnitudes) > this.cfg.loudThreshold;
      if (!isLoud) {
        if (this._quietTimerRunning
            && (endTime - this.lastLoudEndTime >= this.cfg.quietTimeout)) {
          this.emit('quiet', endTime);
          this._clearQuietTimeout();
        }
        return;
      }
      this._clearQuietTimeout();
      this.currentLoudStartTime = startTime;
    }
    this.featureVector.set(magnitudes, this.featureVectorIndex);
    this.featureVectorIndex += this.analyzer.frequencyBinCount;
    if (!this._filledFeatureVector) {
      return;
    }
    this.emit('loud-sound',
              this.featureVector, this.currentLoudStartTime, endTime);
    this.lastLoudEndTime = endTime;
    this._resetLoudDetector();
  };

  _clearQuietTimeout() {
    this.lastLoudEndTime = -1;
  }

  _resetLoudDetector() {
    this.currentLoudStartTime = -1;
    this.featureVectorIndex = 0;
  }

  get _detectingLoudSound(): boolean {
    return this.featureVectorIndex > 0;
  }

  get _filledFeatureVector(): boolean {
    return this.featureVectorIndex === this.featureVector.length;
  }

  get _quietTimerRunning(): boolean {
    return this.lastLoudEndTime > 0;
  }
}
