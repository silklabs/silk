/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import type { Env, Log, Timeline, Sensors } from 'silk-exttest';
type AccelerometerType = (x: number, y: number, z: number) => void;

let log: Log;
let timeline: Timeline;
let sensors: Sensors;

// Minimum acceleration to trigger a "device movement" event in any direction.
// (units are m/s^2).
const MOTION_THRESHOLD = 0.03;

class DeviceMotion {
  constructor() {
    sensors.on('accel', this.onAccelerometer);
  }

  onAccelerometer: AccelerometerType = (x, y, z) => {
    const motion = Math.abs(x - this.lastx) +
                   Math.abs(y - this.lasty) +
                   Math.abs(z - this.lastz);
    this.lastx = x;
    this.lasty = y;
    this.lastz = z;

    if (motion > MOTION_THRESHOLD) {
      log.info(`device moved ~${motion} m/s^2`);
      timeline.addObjects([{
        source: 'devicemotion',
        tag: 'device moved',
        persist: true,
        when: Date.now(),
        durationMs: 250,
      }]);
    }
  };

  willUnload() {
    sensors.removeListener('accel', this.onAccelerometer);
  }
}

module.exports = (env: Env) => {
  log = env.log;
  sensors = env.sensors;
  timeline = env.timeline;
  return new DeviceMotion();
};
