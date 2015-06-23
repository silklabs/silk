/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let util = require('./util');
let fs = require('fs');

let enabled = !util.getprop('persist.silk.quiet');

class Vibrator {
  _vib(duration) {
    if (enabled) {
      fs.writeFileSync('/sys/class/timed_output/vibrator/enable', duration);
    }
  }

  on(duration) {
    this._vib(duration);
  }

  off() {
    this._vib(0);
  }

  // pattern(on1_ms, off1_ms, on2_ms, off2_ms, ... , onN_ms)
  pattern(onDuration, offDuration, ...more) {
    if (onDuration) {
      this.on(onDuration);
      if (offDuration) {
        util.timeout(onDuration + offDuration).then(() => this.pattern(...more));
      }
    }
  }
}

module.exports = () => new Vibrator();
