/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import invariant from 'assert';
import createLog from 'silk-log/device';
import * as sysutil from 'silk-sysutils';
import factoryReset from 'silk-factory-reset';

const log = createLog('silkext-pandohubui-ftr');

type InputEventCallback = (event: { keyId: string }) => void;
type FactoryResetUiState = 'idle' |
                           'mute_down' |
                           'mute_held' |
                           'mute_released' |
                           'volumekeys_held';

export class FactoryResetUi {
  _volumeKeysPressed: number;
  _armedWarningCallback: (() => void)
  _cancelFactoryReset: (() => void);
  _state: FactoryResetUiState;

  constructor(armedWarningCallback: (() => void)) {
    this._volumeKeysPressed = 0;
    this._armedWarningCallback = armedWarningCallback;
    this._cancelFactoryReset = () => {};
    this._state = 'idle';
  }

  _goto(newstate: FactoryResetUiState) {
    if (this._state === newstate) {
      return;
    }
    if (newstate === 'idle') {
      this._cancelFactoryReset();
    } else {
      switch (this._state) {
      case 'idle':
        invariant(newstate === 'mute_down');
        break;
      case 'mute_down':
        invariant(newstate === 'mute_held');
        break;
      case 'mute_held':
        invariant(newstate === 'mute_released');
        break;
      case 'mute_released':
        invariant(newstate === 'volumekeys_held');
        break;
      case 'volumekeys_held':
      default:
        invariant(false);
      }
    }

    log.verbose(newstate);
    this._state = newstate;
  }

  _idle() {
    this._goto('idle');
  }

  _timeout(durationMs: number): Promise<void> {
    this._cancelFactoryReset();
    return Promise.race([
      sysutil.timeout(durationMs),
      new Promise((resolve, reject) => {
        this._cancelFactoryReset = reject;
      }),
    ]);
  }

  _maybeThrowError(e: any) {
    if (e !== undefined) {
      throw e;
    }
  }

  onKeyPress: InputEventCallback = event => {
    switch (event.keyId) {
    case 'volumedown':
    case 'volumeup':
      this._volumeKeysPressed = Math.min(2, this._volumeKeysPressed + 1);
      if (this._state === 'mute_released') {
        if (this._volumeKeysPressed === 2) {
          this._goto('volumekeys_held');
        }
      } else {
        this._idle();
      }
      break;

    case 'mute':
      log.info('mute', this._volumeKeysPressed);
      if (this._volumeKeysPressed === 0 && this._state === 'idle') {
        this._goto('mute_down');
        this._timeout(10 * 1000)
        .then(() => {
          if (this._state === 'mute_down') {
            this._goto('mute_held');
            this._armedWarningCallback();
          }
        })
        .catch(this._maybeThrowError);
      } else {
        this._idle();
      }
      break;

    default:
      this._idle();
      break;
    }
  };

  onKeyRelease: InputEventCallback = event => {
    switch (event.keyId) {
    case 'mute':
      if (this._volumeKeysPressed === 0 && this._state === 'mute_held') {
        this._goto('mute_released');
        this._timeout(2 * 1000)
        .then(() => {
          if (this._state === 'volumekeys_held') {
            log.warn('!! Factory reset !!');
            factoryReset.start();
          } else {
            this._idle();
          }
        })
        .catch(this._maybeThrowError);
      } else {
        this._idle();
      }
      break;

    case 'volumedown':
    case 'volumeup':
      this._volumeKeysPressed = Math.max(0, this._volumeKeysPressed - 1);
      this._idle();
      break;

    default:
      this._idle();
      break;
    }
  };
}
