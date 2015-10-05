/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab */

/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

let env;
import { EventEmitter } from 'events';

class ClapDetector extends EventEmitter {
  constructor() {
    super();

    let cfg = {
      // TODO: hard coded audio constants assumed
      sampleRate: 8000,
      bytesPerSample: 2,
      numChannels: 1,
      fftWindowSize: 256, // 32ms - units of samples
      fftWindowStep: 16,  // 2ms - units of samples 
      riseDurationMs: 8,
      riseEnergyDelta: 30000,
      minEnergyThreshold: 45000,
      minEnergyDurationMs: 70,
      maxEnergyDurationMs: 300,
      //saveWavFilename: '/data/media/micInputDebug.wav',
      //saveWavDurationSecs: 10,
    };

    this._lastClapTime = 0;
    this._repeatedClapCnt = 0;
    this._maxClapIntervalMs = 550;// max time in ms between 2 claps to be 'repeated'

    let LoudSoundDetector = require('./loudSoundDetector')(env);
    this._loudSoundDetector = new LoudSoundDetector(cfg);
    this._loudSoundDetector.on('loudSound', () => this._onLoudSound());
  }

  _onLoudSound() {
    // determine if this is part of a chain of repeated claps
    let now = Date.now();
    if (now - this._lastClapTime < this._maxClapIntervalMs) {
      this._repeatedClapCnt++;
    } else {
      this._repeatedClapCnt = 1;
    }
    this._lastClapTime = now;

    this.emit('clap', { type: 'normal', count: this._repeatedClapCnt });

    // Set timer to send event when last clap is detected
    clearTimeout(this._nextClapTimeout);
    this._nextClapTimeout = setTimeout(
        () => this.emit('clap', { type: 'last', count: this._repeatedClapCnt }),
        this._maxClapIntervalMs);
  }

  cleanup() {
    this._loudSoundDetector.cleanup();
  }

  processPcmFrames(when, frames) {
    this._loudSoundDetector.processPcmFrames(when, frames);
  }
}

module.exports = envParam => {
  env = envParam;
  return ClapDetector;
};
