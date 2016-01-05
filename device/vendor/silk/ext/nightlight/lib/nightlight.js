/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

// Load the regnerator polyfill manually so we don't need to also load all the
// core-js pollyfills which we don't actually need...
import regeneratorRuntime from 'babel-runtime/regenerator';
global.regeneratorRuntime = regeneratorRuntime;

// Example nightlight behaviour
//
// 1. When the light sensor drops below a fixed value, turn on the torch. Turn
//    off the torch when the light level increases.
// 2. If a face is detected while the torch is enabled, turn on the Hue lights.
//    Turn off the Hue lights if a face is then not observed for an amount of
//    time.
//
export default function init(env) {
  const log = env.log;

  const NIGHT_LIGHT_SI_LUX = 3; // light sensor value in SI lux units
  const DAY_LIGHT_SI_LUX = 5;   // light sensor value in SI lux units
  const LIGHT_SENSOR_POLL_INTERVAL_MS = 10 * 1000;
  const LIGHTS_OFF_TIMEOUT_MS = 15 * 1000;

  let nightModeOn = false;

  env.ranger.on('entered', (uuid, rssi) => {
    log.debug(`Entrance of new user ${uuid} rssi ${rssi}`);
  });
  env.ranger.on('range', (uuid, rssi) => {
    log.debug(`Existing user ${uuid} now with rssi ${rssi}`);
  });
  env.ranger.on('exited', uuid => {
    log.debug(`Exit of user ${uuid}`);
  });

  env.sensors.light(LIGHT_SENSOR_POLL_INTERVAL_MS);
  env.sensors.on('light', level => {
    log.debug(`Light sensor level: ${level}`);

    // Turn on flash when the sensors detect low light
    if (level <= NIGHT_LIGHT_SI_LUX) {
      if (!nightModeOn) {
        log.info(`It's dark out. Turning on night mode`);
        nightModeOn = true;
        env.camera.torch(true);
        env.infrared.setMode(env.infrared.MODE.NIGHT);
      }
    } else if (level >= DAY_LIGHT_SI_LUX) {
      if (nightModeOn) {
        log.info(`It's light out. Turning off night mode`);
        nightModeOn = false;
        env.camera.torch(false);
        env.infrared.setMode(env.infrared.MODE.DAY);
      }
    }
  });

  let lightsOn = false;
  let faceLostTimeout;
  env.timeline.on('face', (when, faces) => {
    if ((faces.length <= 0) || (!nightModeOn)) {
      return;
    }

    if (!lightsOn) {
      log.info(`Lights on. Face detected`);
      lightsOn = true;
      // TODO: Add integration to turn on the lights
    }

    // Turn off light if no face is detected within {@code LIGHTS_OFF_TIMEOUT_MS}
    if (faceLostTimeout) {
      clearTimeout(faceLostTimeout);
    }
    faceLostTimeout = setTimeout(() => {
      log.info(`Lights out. No face observed for ${LIGHTS_OFF_TIMEOUT_MS / 1000} seconds`);
      // TODO: Add integration to turn off the lights
      lightsOn = false;
      faceLostTimeout = null;
    }, LIGHTS_OFF_TIMEOUT_MS);
  });
  log.info(`initialized`);
}
