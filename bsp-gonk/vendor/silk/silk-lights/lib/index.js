/**
 * @private
 * @flow
 */

/**
 * Silk lights module to provide controls for the backlight and
 * other LEDs on the board
 *
 * @module silk-lights
 * @example
 * 'use strict';
 * const lights = require('silk-lights').default;
 *
 * // Keep the backlight on
 * let backlight = lights.get('backlight');
 * backlight.set(lights.WHITE);
 */

import events from 'events';
import invariant from 'assert';
import { exec } from 'silk-sysutils';
import createLog from 'silk-log/device';

const log = createLog('lights');

export type LightColor = number; // 0x<AA><RR><GG><BB>

type FlashMode = 'none' |     // No flash.
                 'timed' |    // To flash the light at a given rate, set
                              // flashMode to LIGHT_FLASH_TIMED, and then
                              // flashOnMS should be set to the number of
                              // milliseconds to turn the light on, followed by
                              // the number of milliseconds to turn the light
                              // off.
                 'hardware';  // To flash the light using hardware assist, set
                              // flashMode to the hardware mode.

type BrightnessMode = 'user' |  // brightness is managed by user setting
                      'sensor'; // brightness is managed by light sensor


/**
 * A light source
 * @class
 * @memberof silk-lights
 */
export class Light extends events.EventEmitter {
  _id: LightId;
  _color: LightColor = 0;
  _colorMax: LightColor = 0xFFFFFF;
  _flashMode: FlashMode = 'none';
  _flashOnMS: number = 0;
  _flashOffMS: number = 0;
  _brightnessMode: BrightnessMode = 'user';

  constructor(id: LightId) {
    super();
    this._id = id;
  }

  //eslint-disable-next-line consistent-return
  _flashModeToNumber(flashMode: FlashMode): number {
    switch (flashMode) {
    case 'none':
      return 0;
    case 'timed':
      return 1;
    case 'hardware':
      return 2;
    default:
      invariant(false);
    }
  }

  //eslint-disable-next-line consistent-return
  _brightnessModeToNumber(brightnessMode: BrightnessMode): number {
    switch (brightnessMode) {
    case 'user':
      return 0;
    case 'sensor':
      return 1;
    default:
      invariant(false);
    }
  }

  _update(): Promise<void> {
    const state = {
      color: this._color + 0xFF000000 /* HAL wants an alpha of 0xFF */,
      flashMode: this._flashModeToNumber(this._flashMode),
      flashOnMS: this._flashOnMS,
      flashOffMS: this._flashOffMS,
      brightnessMode: this._brightnessModeToNumber(this._brightnessMode),
    };

    log.info('Setting \'%s\': %s', this._id, JSON.stringify(state));

    const binary = 'lights';
    const args = [
      this._id,
      state.color.toString(),
      state.flashMode.toString(),
      state.flashOnMS.toString(),
      state.flashOffMS.toString(),
      state.brightnessMode.toString(),
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
      /**
       * Emitted when the Light state changes in some way
       *
       * @event change
       * @memberof silk-lights.Light
       * @instance
       */
      this.emit('change');
    });
  }

  /**
  * @memberof silk-lights.Light
  * @instance
  */
  get color(): LightColor {
    return this._color;
  }

  /**
   * Set the color of the light
   *
   * @param {number} val color to set
   * @memberof silk-lights.Light
   * @instance
   */
  set color(val: LightColor) {
    if (val < 0 || val > this._colorMax) {
      throw new Error('Invalid color: ' + val);
    }
    if (this._color !== val) {
      this._color = val;
      this._update();
    }
  }

  /**
   * Get the current flash mode
   *
   * @return {FlashMode} current flash mode
   * @memberof silk-lights.Light
   * @instance
   */
  get flashMode(): FlashMode {
    return this._flashMode;
  }

  /**
   * Set the new flash mode
   *
   * @param {FlashMode} val flash mode to set
   * @memberof silk-lights.Light
   * @instance
   */
  set flashMode(val: FlashMode) {
    if (this._flashMode !== val) {
      this._flashMode = val;
      this._update();
    }
  }

  /**
   * Get the current flash on timer value
   *
   * @return {number} current flash on timer value
   * @memberof silk-lights.Light
   * @instance
   */
  get flashOnMS(): number {
    return this._flashOnMS;
  }

  /**
   * Set the new flash on timer value. This is only applicable if the flash
   * mode is set to LIGHT_FLASH_TIMED
   *
   * @param {number} val flash on timer to set
   * @memberof silk-lights.Light
   * @instance
   */
  set flashOnMS(val: number) {
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
   *
   * @return {number} current flash off timer value
   * @memberof silk-lights.Light
   * @instance
   */
  get flashOffMS(): number {
    return this._flashOffMS;
  }

  /**
   * Set the new flash off timer value. This is only applicable if the flash
   * mode is set to LIGHT_FLASH_TIMED
   *
   * @param {number} val flash off timer to set
   * @memberof silk-lights.Light
   * @instance
   */
  set flashOffMS(val: number) {
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
   *
   * @return Current brightness mode
   * @memberof silk-lights.Light
   * @instance
   */
  get brightnessMode(): BrightnessMode {
    return this._brightnessMode;
  }

  /**
   * Set the new brightness mode
   *
   * @param val brightness mode to set
   * @memberof silk-lights.Light
   * @instance
   */
  set brightnessMode(val: BrightnessMode) {
    if (this._brightnessMode !== val) {
      this._brightnessMode = val;
      this._update();
    }
  }

  /**
   * Set color, flash mode, flash mode timers and brightness mode
   *
   * @param [color=0] color to set
   * @param [flashMode='none'] flash mode to set
   * @param [flashOnMS=0] flash on timer to set
   * @param [flashOffMS=0] flash off timer to set
   * @param [brightnessMode='user'] brightness mode to set
   * @memberof silk-lights.Light
   * @instance
   */
  set(
    color: LightColor = 0,
    flashMode: FlashMode = 'none',
    flashOnMS: number = 0,
    flashOffMS: number = 0,
    brightnessMode: BrightnessMode = 'user'
  ): Promise<void> {
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

// Light Ids from hardware/libhardware/include/hardware/lights.h
type HalLightId = 'backlight' |
                  'keyboard' |
                  'buttons' |
                  'battery' |
                  'notifications' |
                  'attention' |
                  'bluetooth' |
                  'wifi';
type CustomLightId = string;
type LightId = HalLightId | CustomLightId;


class Lights {
  RED: LightColor = 0xFF0000;
  GREEN: LightColor = 0x00FF00;
  BLUE: LightColor = 0x0000FF;
  MAGENTA: LightColor = 0xFF00FF;
  CYAN: LightColor = 0x00FFFF;
  YELLOW: LightColor = 0xFFFF00;
  BLACK: LightColor = 0x000000;
  WHITE: LightColor = 0xFFFFFF;

  _lights: {[key: LightId]: Light} = {};

  /**
   * Adds a custom light source.
   *
   * @param light the Light object for this custom light
   * @memberof silk-lights
   * @instance
   */
  addCustomLight(light: Light) {
    const lightId = light._id;
    if (this._lights[lightId]) {
      throw new Error(lightId, 'already exists');
    }
    this._lights[lightId] = light;
  }

  _get(lightId: LightId): ?Light {
    if (this._lights[lightId]) {
      return this._lights[lightId];
    }

    switch (lightId) {
    case 'backlight':
    case 'keyboard':
    case 'buttons':
    case 'battery':
    case 'notifications':
    case 'attention':
    case 'bluetooth':
    case 'wifi':
      {
        let light = new Light(lightId);
        this._lights[lightId] = light;
        return light;
      }
    default:
      return null;
    }
  }

  /**
   * Checks if a light source exists
   *
   * @memberof silk-lights
   * @instance
   */
  exists(lightId: LightId): boolean {
    let light = this._get(lightId);
    return !!light;
  }

  /**
   * Get a light source
   *
   * @return light object
   * @memberof silk-lights
   * @instance
   */
  get(lightId: LightId): Light {
    let light = this._get(lightId);
    if (!light) {
      throw new Error(lightId, 'unknown');
    }
    return light;
  }
}

const lights = new Lights();
export default lights;
