'use strict';

let camera;
let hue;
let log;
let sensors;

// Example nightlight behaviour
//
// 1. When the light sensor drops below a fixed value, turn on the torch. Turn
//    off the torch when the light level increases.
// 2. If a face is detected while the torch is enabled, turn on the Hue lights.
//    Turn off the Hue lights if a face is then not observed for an amount of
//    time.
//
function init() {

  const NIGHT_LIGHT_SI_LUX = 3; // light sensor value in SI lux units
  const DAY_LIGHT_SI_LUX = 5;   // light sensor value in SI lux units
  const LIGHT_SENSOR_POLL_INTERVAL_MS = 10 * 1000;
  const HUE_LIGHTS_OFF_TIMEOUT_MS = 15 * 1000;

  let nightModeOn = false;

  sensors.on('data', sensorEvent => {
    if (sensorEvent.sensorType !== sensors.SENSOR_TYPE.LIGHT) {
      return;
    }
    log.debug(`Light sensor level: ${sensorEvent.values[0]}`);

    // Turn on flash when the sensors detect low light
    if (sensorEvent.values[0] <= NIGHT_LIGHT_SI_LUX) {
      if (!nightModeOn) {
        log.info("It's dark out. Turning on night mode");
        nightModeOn = true;
        camera.flash(camera.FLASH_MODE.TORCH);
      }
    } else if (sensorEvent.values[0] >= DAY_LIGHT_SI_LUX) {
      if (nightModeOn) {
        log.info("It's light out. Turning off night mode");
        nightModeOn = false;
        camera.flash(camera.FLASH_MODE.OFF);
      }
    }
  });

  camera.on('start', () => sensors.activate(sensors.SENSOR_TYPE.LIGHT,
                                            LIGHT_SENSOR_POLL_INTERVAL_MS));
  camera.on('stop', () => sensors.deactivate(sensors.SENSOR_TYPE.LIGHT));

  let hueLightsOn = false;
  let faceLostTimeout;
  camera.on('face', faces => {
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
        hue.setState({on: true, intensity: 1.0});
      }
    } else {
      faceLostTimeout = setTimeout(() => {
        log.info(`Lights out. No face observed for ${HUE_LIGHTS_OFF_TIMEOUT_MS / 1000} seconds`);
        hue.setState({on: false});
        hueLightsOn = false;
        faceLostTimeout = null;
      }, HUE_LIGHTS_OFF_TIMEOUT_MS);
    }
  });
  log.info('initialized');
}

module.exports = env => {
  log = env.log;

  camera = env.extraObjects.camera;
  hue = env.extraObjects.hue;
  sensors = env.extraObjects.sensors;
  init();
};


