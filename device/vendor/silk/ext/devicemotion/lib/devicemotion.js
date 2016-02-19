/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

// Load the regnerator polyfill manually so we don't need to also load all the
// core-js polyfills which we don't actually need...
import regeneratorRuntime from 'babel-runtime/regenerator';
global.regeneratorRuntime = global.regeneratorRuntime || regeneratorRuntime;

let log;
let timeline;
let sensors;

// Minimum acceleration to trigger a "device movement" event in any direction.
// (units are m/s^2).
const MOTION_THRESHOLD = 0.03;

class DeviceMotion {
  constructor() {
    sensors.on('accel', this.onAccelerometer);
  }

  onAccelerometer = (x, y, z) => {
    const motion = Math.abs(x - this.lastx) +
                   Math.abs(y - this.lasty) +
                   Math.abs(z - this.lastz);
    this.lastx = x;
    this.lasty = y;
    this.lastz = z;

    if (motion > MOTION_THRESHOLD) {
      log.info(`device moved ~${motion} m/s^2`);
      timeline.addObject('device moved', Date.now());
    }
  };

  willUnload() {
    sensors.removeListener('accel', this.onAccelerometer);
  }
}

module.exports = (env) => {
  log = env.log;
  sensors = env.sensors;
  timeline = env.timeline;
  return new DeviceMotion();
};
