/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */


// Example nightlight behaviour
//
// 1. When the light sensor drops below a fixed value, turn on the torch. Turn
//    off the torch when the light level increases.
// 2. If a face is detected while the torch is enabled, turn on the Hue lights.
//    Turn off the Hue lights if a face is then not observed for an amount of
//    time.
//
export default function init(env) {
  let log = env.log;

  const NIGHT_LIGHT_SI_LUX = 3; // light sensor value in SI lux units
  const DAY_LIGHT_SI_LUX = 5;   // light sensor value in SI lux units
  const LIGHT_SENSOR_POLL_INTERVAL_MS = 10 * 1000;
  const HUE_LIGHTS_OFF_TIMEOUT_MS = 15 * 1000;

  let nightModeOn = false;

  env.sensors.light(LIGHT_SENSOR_POLL_INTERVAL_MS);
  env.sensors.on('light', level => {
    log.verbose(`Light sensor level: ${level}`);

    // Turn on flash when the sensors detect low light
    if (level <= NIGHT_LIGHT_SI_LUX) {
      if (!nightModeOn) {
        log.info("It's dark out. Turning on night mode");
        nightModeOn = true;
        env.camera.torch(true);
      }
    } else if (level >= DAY_LIGHT_SI_LUX) {
      if (nightModeOn) {
        log.info("It's light out. Turning off night mode");
        nightModeOn = false;
        env.camera.torch(false);
      }
    }
  });

  let hueLightsOn = false;
  let faceLostTimeout;
  env.timeline.on('face', faces => {
    log.info('Face detected.');
    if (faceLostTimeout) {
      clearTimeout(faceLostTimeout);
    }
    if (!nightModeOn) {
      return;
    }
    if (faces.length >= 1) {
      if (!hueLightsOn) {
        log.info('Lights on. Face detected.');
        hueLightsOn = true;
        env.hue.setState({on: true, intensity: 1.0});
      }
    } else {
      faceLostTimeout = setTimeout(() => {
        log.info(`Lights out. No face observed for ${HUE_LIGHTS_OFF_TIMEOUT_MS / 1000} seconds`);
        env.hue.setState({on: false});
        hueLightsOn = false;
        faceLostTimeout = null;
      }, HUE_LIGHTS_OFF_TIMEOUT_MS);
    }
  });
  log.info('initialized');
}
