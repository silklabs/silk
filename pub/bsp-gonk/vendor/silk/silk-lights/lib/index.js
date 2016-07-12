/**
 * @private
 */

import events from 'events';
import { exec } from 'silk-sysutils';
import createLog from 'silk-log/device';

const log = createLog('lights');

/**
 * Silk lights module to provide controls for the backlight and
 * other LEDs on the board
 * @module silk-lights
 *
 * @example
 * 'use strict';
 * const lights = require('silk-lights');
 *
 * // Keep the backlight on
 * let backlight = lights.backlight;
 * backlight.set(backlight.WHITE);
 */

// From hardware/libhardware/include/hardware/lights.h
/**
 * @name backlight
 * @property
 * @memberof silk-lights
 */
const LIGHT_ID_BACKLIGHT = 'backlight';
/**
 * @name keyboard
 * @property
 * @memberof silk-lights
 */
const LIGHT_ID_KEYBOARD = 'keyboard';
/**
 * @name buttons
 * @property
 * @memberof silk-lights
 */
const LIGHT_ID_BUTTONS = 'buttons';
/**
 * @name battery
 * @property
 * @memberof silk-lights
 */
const LIGHT_ID_BATTERY = 'battery';
/**
 * @name notifications
 * @property
 * @memberof silk-lights
 */
const LIGHT_ID_NOTIFICATIONS = 'notifications';
/**
 * @name attention
 * @property
 * @memberof silk-lights
 */
const LIGHT_ID_ATTENTION = 'attention';
/**
 * @name bluetooth
 * @property
 * @memberof silk-lights
 */
const LIGHT_ID_BLUETOOTH = 'bluetooth';
/**
 * @name wifi
 * @property
 * @memberof silk-lights
 */
const LIGHT_ID_WIFI = 'wifi';

/**
 * Flash mode types
 *
 * @name FlashMode
 * @typedef {Object} FlashMode
 *
 * @property {number} LIGHT_FLASH_NONE No light to flash
 * @property {number} LIGHT_FLASH_TIMED  To flash the light at a given rate,
 *                    set flashMode to LIGHT_FLASH_TIMED, and then flashOnMS
 *                    should be set to the number of milliseconds to turn the
 *                    light on, followed by the number of milliseconds to turn
 *                    the light off.
 * @property {number} LIGHT_FLASH_HARDWARE To flash the light using hardware
 *                    assist, set flashMode to the hardware mode.
 * @memberof silk-lights
 */
const LIGHT_FLASH_NONE = 0;
const LIGHT_FLASH_TIMED = 1;
const LIGHT_FLASH_HARDWARE = 2;

/**
 * @name BrightnessMode
 * @typedef {Object} BrightnessMode
 *
 * @property {number} BRIGHTNESS_MODE_USER Light brightness is managed by a
 *                    user setting
 * @property {number} BRIGHTNESS_MODE_USER Light brightness is managed by a
 *                    light sensor
 * @memberof silk-lights
 */
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
      brightnessMode: this._brightnessMode,
    };

    log.info('Setting \'%s\': %s', this._id, JSON.stringify(state));

    const binary = 'lights';
    const args = [
      this._id,
      state.color,
      state.flashMode,
      state.flashOnMS,
      state.flashOffMS,
      state.brightnessMode,
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

  /**
   * Set the color of the light
   * @instance
   *
   * @param {number} val color to set
   * @return {Promise}
   * @memberof silk-lights
   */
  set color(val) {
    if (val < 0 || val > 0xFFFFFFFF) {
      throw new Error('Invalid color: ' + val);
    }
    if (this._color !== val) {
      this._color = val;
      this._update();
    }
  }

  /**
   * Get the current flash mode
   * @instance
   *
   * @return {FlashMode} current flash mode
   * @memberof silk-lights
   */
  get flashMode() {
    return this._flashMode;
  }

  /**
   * Set the new flash mode
   * @instance
   *
   * @param {FlashMode} val flash mode to set
   * @return {Promise}
   * @memberof silk-lights
   */
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

  /**
   * Get the current flash on timer value
   * @instance
   *
   * @return {number} current flash on timer value
   * @memberof silk-lights
   */
  get flashOnMS() {
    return this._flashOnMS;
  }

  /**
   * Set the new flash on timer value. This is only applicable if the flash
   * mode is set to LIGHT_FLASH_TIMED
   * @instance
   *
   * @param {number} val flash on timer to set
   * @return {Promise}
   * @memberof silk-lights
   */
  set flashOnMS(val) {
    if (val < 0 || val > 0xFFFFFFFF) {
      throw new Error('Invalid flashOnMS: ' + val);
    }
    if (this._flashOnMS !== val) {
      this._flashOnMS = val;
      this._update();
    }
  }

  /**
   * Get the current flash off timer value
   * @instance
   *
   * @return {number} current flash off timer value
   * @memberof silk-lights
   */
  get flashOffMS() {
    return this._flashOffMS;
  }

  /**
   * Set the new flash off timer value. This is only applicable if the flash
   * mode is set to LIGHT_FLASH_TIMED
   * @instance
   *
   * @param {number} val flash off timer to set
   * @return {Promise}
   * @memberof silk-lights
   */
  set flashOffMS(val) {
    if (val < 0 || val > 0xFFFFFFFF) {
      throw new Error('Invalid flashOffMS: ' + val);
    }
    if (this._flashOffMS !== val) {
      this._flashOffMS = val;
      this._update();
    }
  }

  /**
   * Get the current brightness mode
   * @instance
   *
   * @return {BrightnessMode} Current brightness mode
   * @memberof silk-lights
   */
  get brightnessMode() {
    return this._brightnessMode;
  }

  /**
   * Set the new brightness mode
   * @instance
   *
   * @param {BrightnessMode} val brighness mode to se
   * @return {Promise}
   * @memberof silk-lights
   */
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

  /**
   * Set color, flash mode, flash mode timers and brightness mode
   *
   * @instance
   *
   * @param {number} [color=0] color to set
   * @param {FlashMode} [flashMode=LIGHT_FLASH_NONE] flash mode to set
   * @param {number} [flashOnMS=0] flash on timer to set
   * @param {number} [flashOffMS=0] flash off timer to set
   * @param {BrightnessMode} [brightnessMode=BRIGHTNESS_MODE_USER] brightness mode to set
   * @return {Promise}
   * @memberof silk-lights
   */
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
    LIGHT_ID_WIFI,
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
          enumerable: true,
        });

        return light;
      },
      configurable: true,
      enumerable: true,
    });
  });

  return exports;
}

module.exports = makeExports();
