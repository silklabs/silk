/**
 * @private
 * @flow
 */

import fs from 'fs';
import * as util from 'silk-sysutils';
import version from 'silk-core-version';

// Vibrate by default only on developer builds
let enabled = !util.getboolprop('persist.silk.quiet', version.official);

/**
 * Silk vibrator module
 *
 * @module silk-vibrator
 * @example
 * 'use strict';
 *
 * const Vibrator = require('silk-vibrator').default;
 * let vibrator = new Vibrator();
 * vibrator.pattern(100, 50, 100);
 */

/**
 * Silk vibrator class
 *
 * @class
 * @memberof silk-vibrator
 */
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

  /**
   * Test if the vibrator is active
   *
   * @memberof silk-vibrator.Vibrator
   * @instance
   */
  get active(): boolean {
    return this._active;
  }

  /**
   * Run the vibrator for the specified duration
   *
   * @memberof silk-vibrator.Vibrator
   * @instance
   */
  on(duration: number) {
    this._active = true;
    this._vib(duration);
  }

  /**
   * Turn off the vibrator
   *
   * @memberof silk-vibrator.Vibrator
   * @instance
   */
  off() {
    this._active = false;
    this._vib(0);
  }

  /**
   * Play a vibrator pattern
   *
   * @memberof silk-vibrator.Vibrator
   * @instance
   */
  pattern(onDuration: number, offDuration?: number, ...more: Array<number>) {
    if (onDuration) {
      this.on(onDuration);
      if (typeof offDuration === 'number' && more.length) {
        util.timeout(onDuration + offDuration).then(() => this.pattern(...more));
      }
    } else {
      this.off();
    }
  }
}
