/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

let util = require('./util');
let fs = require('fs');

let enabled = !util.getprop('persist.silk.quiet');

class Vibrator {

  constructor() {
    this._active = false;
  }

  _vib(duration) {
    if (enabled) {
      try {
        fs.writeFileSync('/sys/class/timed_output/vibrator/enable', duration);
      } catch (err) {
        if (err.code === 'ENOENT') {
          enabled = false;
        } else {
          throw err;
        }
      }
    }
  }

  get active() {
    return this._active;
  }

  on(duration) {
    this._active = true;
    this._vib(duration);
  }

  off() {
    this._active = false;
    this._vib(0);
  }

  // pattern(on1_ms, off1_ms, on2_ms, off2_ms, ... , onN_ms)
  pattern(onDuration, offDuration, ...more) {
    if (onDuration) {
      this.on(onDuration);
      util.timeout(onDuration + offDuration).then(() => this.pattern(...more));
    } else {
      this.off();
    }
  }
}

module.exports = () => new Vibrator();
