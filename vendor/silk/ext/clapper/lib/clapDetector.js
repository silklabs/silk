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
  constructor(cfg = {}) {
    super();

    let loudCfg = {
      riseDurationMs: 24,
      riseEnergyDelta: 25000,
      minEnergyThreshold: 30000,
      minEnergyDurationMs: 70,
      maxEnergyDurationMs: 140,

      // Apply band pass filter using this range. A clap has a lot of energy
      // in this freq range, filtering out other common sounds that do not.
      bandFilterLowFreq: 2200,
      bandFilterHighFreq: 2800,
    };

    Object.assign(loudCfg, cfg);

    this._lastClapTime = 0;
    this._repeatedClapCnt = 0;
    // max time in ms between 2 claps to be 'repeated'
    this._maxClapIntervalMs = 550;

    let LoudSoundDetector = require('./loudSoundDetector')(env);
    this._loudSoundDetector = new LoudSoundDetector(loudCfg);
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
}

module.exports = envParam => {
  env = envParam;
  return ClapDetector;
};
