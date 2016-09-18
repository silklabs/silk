/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import assert from 'assert';
import events from 'events';
import Input from 'silk-input';
import lights from 'silk-lights';
import {Movie} from 'silk-movie';
import Vibrator from 'silk-vibrator';
import factoryReset from 'silk-factory-reset';

import createLog from 'silk-log/device';
import * as util from 'silk-sysutils';

const log = createLog('ui');

const RESET_KEY_ENABLED = util.getboolprop('ro.silk.ui.key.reset', true);
const POWER_KEY_ENABLED = util.getboolprop('ro.silk.ui.key.power', true);
const DISPLAY_ENABLED = util.getboolprop('ro.silk.ui.display', true);
const LIGHT_ENABLED = util.getboolprop('ro.silk.ui.light', false);

// The device is considered idle if no user-facing activity has occurred for
// this duration
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export type UiState = 'bootanimation' |
                      'unconfigured' |
                      'configStarted' |
                      'configRegistering' |
                      'connecting' |
                      'online' |
                      'charging' |
                      'powerdown';

export class Ui extends events.EventEmitter {
  movie: ?Movie;
  vib: Vibrator;
  currentState: UiState;
  currentMovieName: string;
  backlightTimer: ?number = null;
  idleTimer: ?number = null;
  idle: boolean = true;

  constructor() {
    super();

    this.movie = DISPLAY_ENABLED ? new Movie() : null;
    this.vib = new Vibrator();

    // Only monitor the input devices used for the power and volume keys for these
    // devices (determined by running |adb shell getevent -l| and pressing each
    // key)
    let input = new Input();

    let cancelPowerDown = () => {};
    let cancelVolumeKeys = () => {};
    let volumeKeysPressed = 0;
    input.on('up', e => {
      this.userActivity();
      this._pokeBacklight();
      switch (e.keyId) {
      case 'volumedown':
        this._throwyEmit('key', 'volumedown', 'up');
        //fallthrough
      case 'volumeup':
        if (volumeKeysPressed > 0) {
          volumeKeysPressed--;
          cancelVolumeKeys();
        }
        log.info(`up - volumeKeysPressed: ${volumeKeysPressed}`);
        break;
      case 'power':
        cancelPowerDown();
        break;
      default:
        break;
      }
    });

    input.on('down', e => {
      this.userActivity();
      this.vib.pattern(50);
      if (this._pokeBacklight()) {
        // The first key event with the backlight off does nothing but enable
        // the backlight
        return;
      }
      switch (e.keyId) {
      case 'volumedown':
        this._throwyEmit('key', 'volumedown', 'down');
        //fallthrough
      case 'volumeup':
        volumeKeysPressed++;
        log.info(`down - volumeKeysPressed: ${volumeKeysPressed}`);
        if (volumeKeysPressed === 2) {
          if (RESET_KEY_ENABLED) {
            Promise.race([
              util.timeout(1000),
              new Promise((resolve, reject) => {
                cancelVolumeKeys = reject;
              }),
            ])
            .then(() => factoryReset.start())
            .catch(() => null);
          }
        }
        break;
      case 'power':
        if (POWER_KEY_ENABLED) {
          Promise.race([
            util.timeout(1000),
            new Promise((resolve, reject) => {
              cancelPowerDown = reject;
            }),
          ])
          .then(() => this._throwyEmit('key:powerdown'))
          .catch(() => null);
        }
        break;
      default:
        break;
      }
    });
  }

  /**
   * Emit an event, and re-throw any exceptions to the process once the current
   * call stack is unwound.
   *
   * @private
   */
  _throwyEmit(eventName: string, ...args: any) {
    try {
      this.emit(eventName, ...args);
    } catch (err) {
      process.nextTick(() => {
        util.processthrow(err.stack || err);
      });
    }
  }

  _pokeBacklight() {
    if (!DISPLAY_ENABLED) {
      return false;
    }
    let off = true;
    let backlight = lights.get('backlight');

    if (this.backlightTimer) {
      off = false;
      clearTimeout(this.backlightTimer);
    }


    let timeout = 60 * 1000;
    if (this.currentState === 'charging') {
      timeout = 3 * 1000;
    }

    this.backlightTimer = setTimeout(() => {
      log.debug('Backlight timeout');
      backlight.set(lights.BLACK);
      this.backlightTimer = null;
    }, timeout);
    backlight.set(lights.WHITE);

    return off; // return true if the backlight was just enabled
  }

  getState(): UiState {
    return this.currentState;
  }

  goto(state: UiState) {
    if (state === this.currentState || this.currentState === 'powerdown') {
      return false;
    }
    this.currentState = state;
    log.info(`ui state: ${this.currentState}`);
    this._throwyEmit('state', this.currentState);

    if (LIGHT_ENABLED) {
      let light = lights.get('notifications');

      switch (this.currentState) {
      case 'bootanimation':
        light.set(lights.BLUE, 'timed', 500, 500);
        break;
      case 'unconfigured':
      case 'configStarted':
      case 'configRegistering':
        light.set(lights.YELLOW, 'timed', 500, 500);
        break;
      case 'connecting':
        light.set(lights.GREEN, 'timed', 2000, 1000);
        break;
      case 'online':
        light.set(lights.GREEN);
        break;
      case 'powerdown':
        light.set(lights.BLUE, 'timed', 500, 500);
        break;
      case 'charging':
        light.set(lights.BLACK);
        break;
      default:
        assert(false, `Unknown state: ${this.currentState}`);
        break;
      }
    }

    let movieName;
    switch (this.currentState) {
    case 'unconfigured':
    case 'configStarted':
    case 'configRegistering':
      movieName = 'setup';
      break;
    default:
      movieName = this.currentState;
      break;
    }

    if (movieName !== this.currentMovieName) {
      this.currentMovieName = movieName;
      try {
        if (this.movie) {
          this.movie.run(`/system/silk/media/${movieName}.zip`, () => undefined);
        }
      } catch (e) {
        log.warn(e);
      }

      switch (this.currentState) {
      case 'online':
        this.vib.pattern(500, 250, 500);
        break;
      case 'charging':
        // Don't waste more battery vibrating when in the charging state
        break;
      default:
        this.vib.pattern(500);
        break;
      }
    }
    this._pokeBacklight();
    return true;
  }

  isIdle(): boolean {
    return this.idle;
  }

  /**
   * Indicate that the user was just active.
   */
  userActivity() {
    log.verbose('user activity');
    this.idle = false;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      log.verbose('user idle');
      this.idleTimer = null;
      this.idle = true;
      this._throwyEmit('idle');
    }, IDLE_TIMEOUT_MS);
  }

}

let ui = new Ui();
export default ui;
