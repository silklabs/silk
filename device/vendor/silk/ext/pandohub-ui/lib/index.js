/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import invariant from 'assert';

import createLog from 'silk-log/device';
import Input from 'silk-input';
import type {Light} from 'silk-lights';
import lights from 'silk-lights';
import volume from 'silk-volume';
import type { Env } from 'silk-exttest';
import type { UiState } from 'silk-device-ui';
import { genDialogEngine } from 'silk-dialog-engine';
import type { DialogEngine, DialogUiModeEventCallback } from 'silk-dialog-engine';
import { Nightlight, Ring } from './leds';
import { FactoryResetUi } from './factoryReset';
import * as sysutil from 'silk-sysutils';

const log = createLog('silkext-pandohubui');

const VOLUME_STEPS = 12;
const VOLUME_STEP_INC = 8;
const VOLUME_MAX = VOLUME_STEPS * VOLUME_STEP_INC;
invariant(VOLUME_MAX <= 100);

const CONNECTING_TIMEOUT__LITTLE_SLOW = 30 * 1000;           // 30 seconds
const CONNECTING_TIMEOUT__SOMETHINGS_WRONG = 10 * 60 * 1000; // 10 minutes

type InputEventCallback = (event: { keyId: string }) => void;
type UiStateEventCallback = (state: string) => void;
type ConnectingSubstate = 'ok' | 'littleSlow' | 'somethingsWrong';

type Alert = 'configStarted' |
             'volumeChanged' |
             'dialogDone';

type DialogState = 'idle' |
                   'listening' |
                   'processing_speech' |
                   'speaking' |
                   'speaking_network_error';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(v)));
}

class PandoHubUi {
  input: Input;
  deviceUiState: UiState;
  dialogEngine: DialogEngine;
  dialogState: DialogState;
  connectingSubstate: ConnectingSubstate;
  connectingTimer: ?number;
  alertTimer: ?number;
  nightlight: ?Nightlight;
  ring: ?Ring;
  rendering: bool;
  renderReentered: bool;
  renderReenteredAlert: ?Alert;
  factoryResetUi: FactoryResetUi;

  nightlightWhite: ?Light;
  nightlightRgb: ?Light;

  constructor(env: Env) {
    this.input = new Input();
    this.deviceUiState = 'bootanimation';
    this.dialogState = 'idle';
    this.connectingTimer = null;
    this.alertTimer = null;
    this.rendering = false;
    this.renderReentered = false;
    this.factoryResetUi = new FactoryResetUi(() => {
      this.render('configStarted');
    });
    this.input.on('down', this.onKeyPress);
    this.input.on('up', this.onKeyRelease);
    this.onDeviceUiState(env.ui.getState());

    env.ui.on('state', this.onDeviceUiState);
    env.timeline.on('listening', this.onDialogListening);
    env.timeline.on('processing_speech', this.onDialogProcessingSpeech);
    env.timeline.on('speaking', this.onDialogSpeaking);
    env.timeline.on('speaking_network_error', this.onDialogNetworkError);
    env.timeline.on('finished_processing_speech', this.onDialogFinished);

    volume.on('level', this.onVolumeLevel);
    this._init();
  }

  async _init() {
    this.rendering = true; // Halt rendering until async init is complete

    const dialogEngine = await genDialogEngine();
    this.dialogEngine = dialogEngine;
    dialogEngine.on('ui-mode', this.onDialogUiMode);
    volume.mute = dialogEngine.uiMode === 'mute';

    const pcbver = sysutil.getintprop('ro.boot.pcb_ver', -1);
    if (pcbver === 0) {
      const [nightlight, ring] = await Promise.all([
        Nightlight.create(),
        Ring.create(),
      ]);
      this.nightlight = nightlight;
      this.ring = ring;
      this.nightlightWhite = lights.get('nightlightWhite');
      if (this.nightlightWhite) {
        this.nightlightWhite.on('change', this.onNightlightChange);
      }
      this.nightlightRgb = lights.get('nightlightRgb');
      if (this.nightlightRgb) {
        this.nightlightRgb.on('change', this.onNightlightChange);
      }
    }

    this.rendering = false;
    this.render();
  }

  onNightlightChange: ((event: string) => void) = () => {
    this.render();
  }

  onDialogUiMode: DialogUiModeEventCallback = uiMode => {
    this.render();
  }

  onDialogListening: (() => void) = () => {
    this.dialogState = 'listening';
    this.render();
  };

  onDialogProcessingSpeech: (() => void) = () => {
    this.dialogState = 'processing_speech';
    this.render();
  };

  onDialogSpeaking: (() => void) = () => {
    this.dialogState = 'speaking';
    this.render();
  };

  onDialogNetworkError: (() => void) = () => {
    this.dialogState = 'speaking_network_error';
    this.render();
  };

  onDialogFinished: (() => void) = () => {
    log.info('finished_processing_speech');
    this.dialogState = 'idle';

    if (this.connectingSubstate === 'somethingsWrong') {
      // Move back to 'littleSlow' to give the user some feedback about the
      // error they just likely encountered
      this.onNotConnectedYet();
    }
    this.render('dialogDone');
  };

  onVolumeLevel: (() => void) = () => {
    this.render('volumeChanged');
  }

  onKeyPress: InputEventCallback = event => {
    log.verbose('key press:', event.keyId);
    if (!this.dialogEngine) {
      return;
    }
    this.factoryResetUi.onKeyPress(event);
    switch (event.keyId) {
    case 'volumedown':
      volume.level = Math.max(0, volume.level - VOLUME_STEP_INC);
      break;
    case 'volumeup':
      volume.level = Math.min(VOLUME_MAX, volume.level + VOLUME_STEP_INC);
      break;
    case 'mute':
      if (this.dialogEngine.uiMode === 'mute') {
        this.dialogEngine.uiMode = 'normal';
        volume.mute = false;
      } else {
        this.dialogEngine.uiMode = 'mute';
        volume.mute = true;
      }
      break;
    case 'brightnessdown':
      if (this.nightlightWhite) {
        this.nightlightWhite.color = Math.max(0, this.nightlightWhite.color - 32);
      }
      break;
    case 'brightnessup':
      this.nightlightWhite.color = Math.min(255, this.nightlightWhite.color + 32);
      break;
    default:
      break;
    }
  };

  onKeyRelease: InputEventCallback = event => {
    log.verbose('key release:', event.keyId);
    this.factoryResetUi.onKeyRelease(event);
  }

  async render(alert: ?Alert): Promise<void> {
    if (this.rendering) {
      this.renderReentered = true;
      if (alert) {
        this.renderReenteredAlert = alert;
      }
      return;
    }
    this.rendering = true;
    try {
      await this.renderInternal(alert);
    } finally {
      this.rendering = false;
    }

    if (this.renderReentered) {
      alert = this.renderReenteredAlert;
      this.renderReentered = false;
      this.renderReenteredAlert = null;
      this.render(alert);
    }
  }


  async renderInternal(alert: ?Alert): Promise<void> {
    if (!this.dialogEngine) {
      return;
    }

    const ring = this.ring;
    const nightlight = this.nightlight;

    // Alerts are temporary notifications that are rendered over the normal UI
    // state
    if (alert) {
      log.verbose('New alert:', alert);
      if (this.alertTimer) {
        clearTimeout(this.alertTimer);
        this.alertTimer = null;
      }

      let alertTimeMs;
      switch (alert) {
      case 'configStarted':
        alertTimeMs = 2250;
        if (ring) {
          await ring.unconfiguredPing();
        }
        break;
      case 'volumeChanged':
        {
          alertTimeMs = 2000;
          const volumeIndex = clamp(volume.level / VOLUME_STEP_INC, 0, VOLUME_STEPS);
          log.info(`volume is ${volume.level} (${volumeIndex}/${VOLUME_STEPS})`);
          if (ring) {
            await ring.volume(volumeIndex);
          }
          break;
        }
      case 'dialogDone':
        alertTimeMs = 1000;
        if (ring && nightlight) {
          await Promise.all([
            ring.finishedDialog(),
            nightlight.blue(),
          ]);
        }
        break;
      default:
        invariant(false, 'Unknown alert:', alert);
      }

      this.alertTimer = setTimeout(
        () => {
          log.verbose('Alert complete:', alert);
          this.alertTimer = null;
          this.render();
        },
        alertTimeMs
      );
      return;
    }

    log.debug('deviceUiState:', this.deviceUiState);
    log.debug('connectingSubstate:', this.connectingSubstate);
    log.debug('dialogState:', this.dialogState);
    log.debug('dialogUiMode:', this.dialogEngine.uiMode);
    log.debug('alert:', this.alertTimer !== null);
    log.debug('volume:', volume.level);
    log.debug('volume mute:', volume.mute);
    if (this.nightlightWhite) {
      log.debug('nightlight brightness:', this.nightlightWhite.color);
    }
    if (this.nightlightRgb) {
      log.debug('nightlight color:', this.nightlightRgb.color);
    }

    if (this.alertTimer !== null) {
      // Alert is still pending, don't disturb it
      return;
    }

    if (!ring || !nightlight) {
      return;
    }

    switch (this.deviceUiState) {
    case 'bootanimation':
    case 'charging':
      await Promise.all([
        ring.initializing(),
        nightlight.blue(),
      ]);
      break;
    case 'unconfigured':
    case 'configStarted':
      await Promise.all([
        ring.unconfigured(),
        nightlight.orange(),
      ]);
      break;
    case 'configRegistering':
      await Promise.all([
        ring.configuring(),
        nightlight.orange(),
      ]);
      break;
    case 'connecting':
      switch (this.connectingSubstate) {
      case 'ok':
        await Promise.all([
          ring.processing(),
          nightlight.blueWithGlow(),
        ]);
        break;
      case 'littleSlow':
        await Promise.all([
          ring.speakingError(),
          nightlight.orange(),
        ]);
        break;
      case 'somethingsWrong':
        await Promise.all([
          ring.online(),
          nightlight.userColor(),
        ]);
        break;
      default:
        invariant(false, 'Unknown substate: ' + this.connectingSubstate);
      }
      break;
    case 'online':
      if (this.dialogEngine.uiMode === 'mute') {
        await Promise.all([
          ring.mute(),
          nightlight.red(),
        ]);
        break;
      }

      switch (this.dialogState) {
      case 'idle':
        switch (this.dialogEngine.uiMode) {
        case 'normal':
          await Promise.all([
            ring.online(),
            nightlight.userColor(),
          ]);
          break;
        case 'dnd':
          await Promise.all([
            ring.silent(),
            nightlight.blue(),
          ]);
          break;
        default:
          invariant(false);
        }
        break;
      case 'listening':
        await Promise.all([
          ring.listening(),
          nightlight.blue(),
        ]);
        break;
      case 'processing_speech':
        await Promise.all([
          ring.processing(),
          nightlight.blueWithGlow(),
        ]);
        break;
      case 'speaking':
        await Promise.all([
          ring.speaking(),
          nightlight.blue(),
        ]);
        break;
      case 'speaking_network_error':
        await Promise.all([
          ring.speakingError(),
          nightlight.orange(),
        ]);
        break;
      default:
        invariant(false, 'Unknown state: ' + this.dialogState);
      }
      break;
    case 'powerdown':
      await Promise.all([
        ring.online(),
        nightlight.userColor(),
      ]);
      break;
    default:
      invariant(false, 'Unknown UI state', this.deviceUiState);
    }
  }

  onDeviceUiState: UiStateEventCallback = deviceUiState => {
    log.info('Ui State', deviceUiState);
    if (this.connectingTimer) {
      clearTimeout(this.connectingTimer);
      this.connectingTimer = null;
    }
    this.deviceUiState = deviceUiState;
    this.connectingSubstate = 'ok';

    switch (this.deviceUiState) {
    case 'configStarted':
      this.render('configStarted');
      break;
    case 'connecting':
      this.connectingTimer = setTimeout(this.onNotConnectedYet,
        CONNECTING_TIMEOUT__LITTLE_SLOW);
      //fallthrough
    default:
      this.render();
      break;
    }
  };

  onNotConnectedYet: (() => void) = () => {
    invariant(this.deviceUiState === 'connecting');
    this.connectingSubstate = 'littleSlow';
    this.connectingTimer = setTimeout(this.onStillNotConnectedYet,
      CONNECTING_TIMEOUT__SOMETHINGS_WRONG);
    this.render();
  };

  onStillNotConnectedYet: (() => void) = () => {
    invariant(this.deviceUiState === 'connecting');
    this.connectingSubstate = 'somethingsWrong';
    this.render();
  };

  willUnload(): void {
    if (this.connectingTimer) {
      clearTimeout(this.connectingTimer);
      this.connectingTimer = null;
    }
    if (this.dialogEngine) {
      this.dialogEngine.removeListener('ui-mode', this.onDialogUiMode);
    }
    this.input.removeListener('down', this.onKeyPress);
    this.input.removeListener('up', this.onKeyRelease);
    volume.removeListener('level', this.onVolumeLevel);
    if (this.nightlightWhite) {
      this.nightlightWhite.removeListener('change', this.onNightlightChange);
    }
    if (this.nightlightRgb) {
      this.nightlightRgb.removeListener('change', this.onNightlightChange);
    }
  }
}

module.exports = (env: Env) => new PandoHubUi(env);
