/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import * as util from './sysutils';
import fs from 'fs';
import version from 'silk-core-version';

// Vibrate by default only on developer builds
let enabled = !util.getprop('persist.silk.quiet', version.official);

export default class Vibrator {

  _active: boolean = false;

  _vib(duration: number) {
    if (enabled) {
      try {
        fs.writeFileSync('/sys/class/timed_output/vibrator/enable', String(duration));
      } catch (err) {
        if (err.code === 'ENOENT') {
          enabled = false;
        } else {
          throw err;
        }
      }
    }
  }

  get active(): boolean {
    return this._active;
  }

  on(duration: number) {
    this._active = true;
    this._vib(duration);
  }

  off() {
    this._active = false;
    this._vib(0);
  }

  // pattern(on1_ms, off1_ms, on2_ms, off2_ms, ... , onN_ms)
  pattern(onDuration: number, offDuration: number, ...more: Array<number>) {
    if (onDuration) {
      this.on(onDuration);
      util.timeout(onDuration + offDuration).then(() => this.pattern(...more));
    } else {
      this.off();
    }
  }
}
