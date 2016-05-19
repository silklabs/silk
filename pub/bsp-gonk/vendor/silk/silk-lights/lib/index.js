/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

import events from 'events';
import { exec } from 'silk-sysutils';
import createLog from 'silk-log/device';

const log = createLog('lights');

// From hardware/libhardware/include/hardware/lights.h
const LIGHT_ID_BACKLIGHT = 'backlight';
const LIGHT_ID_KEYBOARD = 'keyboard';
const LIGHT_ID_BUTTONS = 'buttons';
const LIGHT_ID_BATTERY = 'battery';
const LIGHT_ID_NOTIFICATIONS = 'notifications';
const LIGHT_ID_ATTENTION = 'attention';
const LIGHT_ID_BLUETOOTH = 'bluetooth';
const LIGHT_ID_WIFI = 'wifi';
const LIGHT_FLASH_NONE = 0;
const LIGHT_FLASH_TIMED = 1;
const LIGHT_FLASH_HARDWARE = 2;
const BRIGHTNESS_MODE_USER = 0;
const BRIGHTNESS_MODE_SENSOR = 1;

class Light extends events.EventEmitter {
  constructor(id) {
    super();

    this._id = id;
    this._color = 0;
    this._flashMode = LIGHT_FLASH_NONE;
    this._flashOnMS = 0;
    this._flashOffMS = 0;
    this._brightnessMode = BRIGHTNESS_MODE_USER;

    log.debug(`Created Light for '${id}'`);
  }

  _update() {
    const state = {
      color: this._color,
      flashMode: this._flashMode,
      flashOnMS: this._flashOnMS,
      flashOffMS: this._flashOffMS,
      brightnessMode: this._brightnessMode
    };

    log.info('Setting \'%s\': %s', this._id, JSON.stringify(state));

    const binary = 'lights';
    const args = [
      this._id,
      state.color,
      state.flashMode,
      state.flashOnMS,
      state.flashOffMS,
      state.brightnessMode
    ];

    return exec(binary, args)
    .catch(err => {
      let msg = `Failed to exec '${binary}': ${err}`;
      log.error(msg);
      throw new Error(msg);
    })
    .then(result => {
      if (result.code !== 0) {
        let msg = `'${binary}' returned error code ${result.code}: ` +
                  result.stderr;
        log.error(msg);
      }
      this.emit('change', state);
    });
  }

  get RED() {
    return 0xFFFF0000;
  }

  get GREEN() {
    return 0xFF00FF00;
  }

  get BLUE() {
    return 0xFF0000FF;
  }

  get MAGENTA() {
    return 0xFFFF00FF;
  }

  get CYAN() {
    return 0xFF00FFFF;
  }

  get YELLOW() {
    return 0xFFFFFF00;
  }

  get BLACK() {
    return 0xFF000000;
  }

  get WHITE() {
    return 0xFFFFFFFF;
  }

  get FLASH_NONE() {
    return LIGHT_FLASH_NONE;
  }

  get FLASH_TIMED() {
    return LIGHT_FLASH_TIMED;
  }

  get FLASH_HARDWARE() {
    return LIGHT_FLASH_HARDWARE;
  }

  get BRIGHTNESS_USER() {
    return BRIGHTNESS_MODE_USER;
  }

  get BRIGHTNESS_SENSOR() {
    return BRIGHTNESS_MODE_SENSOR;
  }

  get color() {
    return this._color;
  }

  set color(val) {
    if (val < 0 || val > 0xFFFFFFFF) {
      throw new Error('Invalid color: ' + val);
    }
    if (this._color !== val) {
      this._color = val;
      this._update();
    }
  }

  get flashMode() {
    return this._flashMode;
  }

  set flashMode(val) {
    if (val !== LIGHT_FLASH_NONE &&
        val !== LIGHT_FLASH_TIMED &&
        val !== LIGHT_FLASH_HARDWARE) {
      throw new Error('Invalid flashMode: ' + val);
    }
    if (this._flashMode !== val) {
      this._flashMode = val;
      this._update();
    }
  }

  get flashOnMS() {
    return this._flashOnMS;
  }

  set flashOnMS(val) {
    if (val < 0 || val > 0xFFFFFFFF) {
      throw new Error('Invalid flashOnMS: ' + val);
    }
    if (this._flashOnMS !== val) {
      this._flashOnMS = val;
      this._update();
    }
  }

  get flashOffMS() {
    return this._flashOffMS;
  }

  set flashOffMS(val) {
    if (val < 0 || val > 0xFFFFFFFF) {
      throw new Error('Invalid flashOffMS: ' + val);
    }
    if (this._flashOffMS !== val) {
      this._flashOffMS = val;
      this._update();
    }
  }

  get brightnessMode() {
    return this._brightnessMode;
  }

  set brightnessMode(val) {
    if (val !== BRIGHTNESS_MODE_USER &&
        val !== BRIGHTNESS_MODE_SENSOR) {
      throw new Error('Invalid brightnessMode: ' + val);
    }
    if (this._brightnessMode !== val) {
      this._brightnessMode = val;
      this._update();
    }
  }

  set(color = 0,
      flashMode = LIGHT_FLASH_NONE,
      flashOnMS = 0,
      flashOffMS = 0,
      brightnessMode = BRIGHTNESS_MODE_USER) {
    if (this._color === color &&
        this._flashMode === flashMode &&
        this._flashOnMS === flashOnMS &&
        this._flashOffMS === flashOffMS &&
        this._brightnessMode === brightnessMode) {
      return Promise.resolve();
    }
    this._color = color;
    this._flashMode = flashMode;
    this._flashOnMS = flashOnMS;
    this._flashOffMS = flashOffMS;
    this._brightnessMode = brightnessMode;
    return this._update();
  }
}

function makeExports() {
  const lightIds = [
    LIGHT_ID_BACKLIGHT,
    LIGHT_ID_KEYBOARD,
    LIGHT_ID_BUTTONS,
    LIGHT_ID_BATTERY,
    LIGHT_ID_NOTIFICATIONS,
    LIGHT_ID_ATTENTION,
    LIGHT_ID_BLUETOOTH,
    LIGHT_ID_WIFI
  ];

  let lightCache = { };
  let exports = { };

  // Define a getter for each kind of light that we know about.
  lightIds.forEach(lightId => {
    // Make a lazy getter that will look up the correct light in a global cache
    // so that all other importers use the same instance and can therefore be
    // notified when the light changes.
    Object.defineProperty(exports, lightId, {
      get: function() {
        // Delete lazy getter.
        delete exports[lightId];

        let light = lightCache[lightId];
        if (!light) {
          light = new Light(lightId);
          lightCache[lightId] = light;
        }

        Object.defineProperty(exports, lightId, {
          value: light,
          writable: true,
          configurable: true,
          enumerable: true
        });

        return light;
      },
      configurable: true,
      enumerable: true
    });
  });

  return exports;
}

module.exports = makeExports();
