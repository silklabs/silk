/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab */

/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

let log;
let util;
import { EventEmitter } from 'events';

// Url to send audio diag data. Consider disabled if prop not set
const AUDIO_DIAG_URL = 'persist.silk.audioDiagUrl';

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
  constructor(cfg = {}) {
    super();

    let params = [
      'sampleRate',          // samples per second
      'bytesPerSample',      // bytes per sample
      'numChannels',         // number of audio channels
      'fftWindowSize',       // samples to use in fft window
      'fftWindowStep',       // samples to step skip for next fft calculation
      'riseEnergyDelta',     // initial rise energy delta to consider loud sound
      'riseDurationMs',      // ^^^ energy must rise within this duration
      'minEnergyThreshold',  // after initial rise, energy must be above this
      'minEnergyDurationMs', // energy must stay above ^^^ for this amount of time
      'maxEnergyDurationMs'  // ... but not more then this amount of time
    ];

    params.forEach(param => {
      if (!(param in cfg)) {
        throw `Missing ${param} in cfg`;
      }
    });

    this._sampleRate = cfg.sampleRate;
    this._bytesPerSample = cfg.bytesPerSample;
    this._numChannels = cfg.numChannels;
    this._riseEnergyDelta = cfg.riseEnergyDelta;
    this._fftWindowSize = cfg.fftWindowSize;
    this._fftWindowStep = cfg.fftWindowStep;

    // util to convert time units from ms to fftWindowStep (needed for history)
    let msToSteps = ms => Math.ceil(ms / 1000 * this._sampleRate / 
        this._fftWindowStep);

    // (note, duration in units of fftWindowStep)
    this._riseEnergyDelta = cfg.riseEnergyDelta;
    this._riseDistance = msToSteps(cfg.riseDurationMs);

    // (note, duration in units of fftWindowStep)
    this._minEnergyThreshold = cfg.minEnergyThreshold;
    this._minEnergyDuration = msToSteps(cfg.minEnergyDurationMs);
    this._maxEnergyDuration = msToSteps(cfg.maxEnergyDurationMs);

    this._saveWavFilename = '';
    this._saveWavDurationSecs = 10;
    if ('saveWavFilename' in cfg) this._saveWavFilename = cfg.saveWavFilename;
    if ('saveWavDurationSecs' in cfg)
      this._saveWavDurationSecs = cfg.saveWavDurationSecs;

    this._highEnergyCnt = 0;
    this._highEnergyStart = null;

    let audioTools = require('./audioTools')({log});

    // calculates the fft for each window
    this._fftProcessor = new audioTools.FftProcessor(cfg);
    this._fftProcessor.on('fftDone', fftNode => this._onFftDone(fftNode));

    // keeps track of historical fft results for analysis
    this._windowHistory = new audioTools.WindowHistory(this._riseDistance + 1);

    // optionally send fft data to audio diag to visualize for tuning/analysis
    let audioDiagUrl = util.getprop(AUDIO_DIAG_URL);
    if (audioDiagUrl) {
      this._audioDiag = new audioTools.AudioDiag(audioDiagUrl, 20, cfg);
    }

    // if set, save wave file locally
    if (this._saveWavFilename) {
      this._wavFileSaver = new audioTools.WavFileSaver(
          this._saveWavFilename, this._saveWavDurationSecs, cfg);
      this._wavFileSaver.on('fileSaved', err => log.info(`file saved ${err}`));
    }
  }

  cleanup() {
    if (this._audioDiag) {
      this._audioDiag.cleanup();
    }
  }

  _performLoudSoundAnalysis() {
    // perform analysis from historical fft results

    let cur = this._windowHistory.getNode(0);
    let prev = this._windowHistory.getNode(this._riseDistance);

    if ((cur.data - prev.data) > this._riseEnergyDelta) {
      // found initial large rise in energy, now need to maintain energy
      this._highEnergyStart = cur.windowCnt;
      this._highEnergyCnt = 0;
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

          log.debug('loud sound detected',
              this._highEnergyStart,
              this._highEnergyStart * this._fftWindowStep / this._sampleRate,
              this._highEnergyCnt);

          this.emit('loudSound', {});
        } else {
          log.debug('  no loud sound:',
              this._highEnergyStart,
              this._highEnergyStart * this._fftWindowStep / this._sampleRate,
              this._highEnergyCnt);
        }
        this._highEnergyStart = null;
      }
    }
  }

  _onFftDone(fftNode) {
    // calculate average energy
    let avg = 0;
    for (let i = 0; i < fftNode.freq.length; i++) {
      avg += fftNode.freq[i];
    }
    fftNode.data = avg / fftNode.freq.length;

    if (this._audioDiag) {
      this._audioDiag.addFftNode(fftNode);
    }

    this._windowHistory.push(fftNode);
    if (!this._windowHistory.isPrimed()) {
      // Can't do analysis until history is fully primed
      return;
    }
    this._performLoudSoundAnalysis();
    this._windowHistory.shift();
  }

  processPcmFrames(when, frames) {
    if (this._saveWavFilename) {
      this._wavFileSaver.addSamples(frames);
    }
    this._fftProcessor.processSamples(when, frames);
  }
}

module.exports = env => {
  log = env.log;
  util = env.util;
  return LoudSoundDetector;
};
