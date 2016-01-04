/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab */

/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

let log;
import { EventEmitter } from 'events';

//
// LoudSoundDetector
//
// Basic algorithm for loud sounds. The algorithm processes a continuous
// stream of PCM samples to detect if the average energy in the frequency
// domain spikes up very quickly. A loud sound results in a sharp rise in
// all frequencies. Talking is more gradual, and even then, not across all
// frequencies. Additionally, we check that the energy is maintained for
// some amount to filter out other sounds (like knocks) that don't maintain
// energy like a loud sound.
//
// In more detail, we perform a FFT on a set of samples. The number of samples
// is _fftWindowSize, and we do this ever time we receive another
// _fftWindowStep number of samples. The FFT across N samples will give us
// the energy at each freq bucket between 0 and samplingRate / 2, where each
// bucket size is samplingRate / N; this is just how FFT works. The more
// samples you use, the more granular your frequency buckets. For loud sounds,
// we don't need too much precision, so the window size doesn't matter too much.
//
// We take the FFT results and calculate the average energy across ALL freq
// buckets and then save this off; let's call this the AWE for "Average Window
// Energy." When we have enough AWE values saved off, we check to see if there
// is a large rise (_riseEnergyDelta) between the current AWE and and one
// _riseDistance back. Using 2 for _riseDistance is good because it smooths
// thing over in case the loud sound started in the middle of a PCM sample. Also,
// when a loud sound starts, the AWE will continue to rise for a few PCM samples,
// so, we don't consider it another loud sound if there was a large rise within
// the last few PCM samples back, specifically _minDistance back.
//
// _riseEnergyDelta is the value we'll have to tune the most as it depends on
// the mic sensitivity.
//
// To filter out other sounds with a quick rise, we check that the AWE is
// maintained above a certain threshold for a specific duration.
//
class LoudSoundDetector extends EventEmitter {
  constructor(cfg) {
    super();

    let params = [
      'fftProcessor',
      'riseEnergyDelta',     // initial rise energy delta to consider loud sound
      'riseDurationMs',      // ^^^ energy must rise within this duration
      'minEnergyThreshold',  // after initial rise, energy must be above this
      'minEnergyDurationMs', // energy must stay above ^ for this amount of time
      'maxEnergyDurationMs'  // ... but not more then this amount of time
    ];

    params.forEach(param => {
      if (!(param in cfg)) {
        throw `Missing ${param} in cfg`;
      }
    });

    this._sampleRate = cfg.fftProcessor.sampleRate;
    this._bytesPerSample = cfg.fftProcessor.bytesPerSample;
    this._numChannels = cfg.fftProcessor.numChannels;
    this._fftWindowSize = cfg.fftProcessor.fftWindowSize;
    this._fftWindowStep = cfg.fftProcessor.fftWindowStep;
    this._riseEnergyDelta = cfg.riseEnergyDelta;

    // If set, save band pass filter range, else use the entire range.
    // By definition, the entire FFT freq range is 0 to sampleRate / 2 + 1
    this._bandFilterLowFreq = 'bandFilterLowFreq' in cfg ?
        cfg.bandFilterLowFreq : 0;
    this._bandFilterHighFreq = 'bandFilterHighFreq' in cfg ?
        cfg.bandFilterHighFreq : this._sampleRate / 2 + 1;

    // (note, duration in units of fftWindowStep)
    this._riseEnergyDelta = cfg.riseEnergyDelta;
    this._riseDistance = this._msToSteps(cfg.riseDurationMs);

    // (note, duration in units of fftWindowStep)
    this._minEnergyThreshold = cfg.minEnergyThreshold;
    this._minEnergyDuration = this._msToSteps(cfg.minEnergyDurationMs);
    this._maxEnergyDuration = this._msToSteps(cfg.maxEnergyDurationMs);

    this._highEnergyCnt = 0;
    this._highEnergyStart = null;

    let audioTools = require('./audioTools')({log});

    // calculates the fft for each window
    this._fftProcessor = cfg.fftProcessor;
    this._fftProcessor.on('fftDone', fftNode => this._onFftDone(fftNode));

    // keeps track of historical fft results for analysis
    this._windowHistory = new audioTools.WindowHistory(this._riseDistance + 1);
  }

  _msToSteps(ms) {
    return Math.ceil(ms / 1000 * this._sampleRate / this._fftWindowStep);
  }

  _stepsToMs(steps) {
    return steps * this._fftWindowStep / this._sampleRate * 1000;
  }

  cleanup() {
  }

  _performLoudSoundAnalysis() {
    // perform analysis from historical fft results

    let cur = this._windowHistory.getNode(0);
    let prev = this._windowHistory.getNode(this._riseDistance);

    if (this._highEnergyStart === null &&
        (cur.data - prev.data) > this._riseEnergyDelta) {
      // found initial large rise in energy, now need to maintain energy
      this._highEnergyStart = cur.windowCnt;
      this._highEnergyCnt = 0;

      log.debug('loud sound rise detected');
    }

    if (this._highEnergyStart !== null) {
      // we detected high energy, now need to see its duration
      if (cur.data > this._minEnergyThreshold) {
        // energy level met threshold, need to maintain for a little bit
        this._highEnergyCnt++;
      } else {
        if (this._highEnergyCnt >= this._minEnergyDuration &&
            this._highEnergyCnt < this._maxEnergyDuration) {
          // energy is not too short or long, consider this a loud sound

          log.debug('  loud sound detected ' +
              this._stepsToMs(this._highEnergyCnt) + ' ms');
          this.emit('loudSound', {});
        } else {
          log.debug('  no sound detected ' +
              this._stepsToMs(this._highEnergyCnt) + ' ms');
        }
        this._highEnergyStart = null;
      }
    }
  }

  _onFftDone(fftNode) {
    // calculate avg energy while filtering out freq outside of band
    const hzPerBin = 2 * this._fftWindowSize / this._sampleRate;

    let minFreqBin = Math.floor(this._bandFilterLowFreq * hzPerBin);
    let maxFreqBin = Math.floor(this._bandFilterHighFreq * hzPerBin);

    let avg = 0;
    for (let i = minFreqBin; i < maxFreqBin; i++) {
      avg += fftNode.freq[i];
    }
    fftNode.data = avg / (maxFreqBin - minFreqBin);

    this._windowHistory.push(fftNode);
    if (!this._windowHistory.isPrimed()) {
      // Can't do analysis until history is fully primed
      return;
    }
    this._performLoudSoundAnalysis();
    this._windowHistory.shift();
  }
}

module.exports = env => {
  log = env.log;
  return LoudSoundDetector;
};
