/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import fs from 'fs';
import invariant from 'assert';

import createLog from 'silk-log/device';
import Input from 'silk-input';
import * as sysutil from 'silk-sysutils';
import volume from 'silk-volume';
import type { Env } from 'silk-exttest';
import type { UiState } from 'silk-device-ui';
import { genDialogEngine } from 'silk-dialog-engine';
import type { DialogEngine, DialogUiModeEventCallback } from 'silk-dialog-engine';
import { Nightlight, Ring } from './leds';
import { FactoryResetUi } from './factoryReset';

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
  brightness: number; // 0 .. 255
  connectingTimer: ?number;
  alertTimer: ?number;
  ledsPresent: bool;
  nightlight: Nightlight;
  ring: Ring;
  rendering: bool;
  renderReentered: bool;
  renderReenteredAlert: ?Alert;
  factoryResetUi: FactoryResetUi;

  constructor(env: Env) {
    this.input = new Input();
    this.deviceUiState = 'bootanimation';
    this.dialogState = 'idle';
    this.brightness = clamp(0, 255, sysutil.getintprop('persist.pandohubui.brightness', 128));
    this.connectingTimer = null;
    this.alertTimer = null;
    this.ledsPresent = false;
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

    this.rendering = true; // Halt rendering until async init is complete
    genDialogEngine()
    .then(dialogEngine => {
      this.dialogEngine = dialogEngine;
      dialogEngine.on('ui-mode', this.onDialogUiMode);
      volume.mute = dialogEngine.uiMode === 'mute';
      fs.access('/sys/bus/i2c/drivers/lp5523x', async (err) => {
        if (!err) {
          const [nightlight, ring] = await Promise.all([
            Nightlight.create(),
            Ring.create(),
          ]);
          this.nightlight = nightlight;
          this.ring = ring;

          this.ledsPresent = true;
        }
        this.rendering = false;
        this.render();
      });
    });
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
      this.brightness = Math.max(0, this.brightness - 32);
      sysutil.setprop('persist.pandohubui.brightness', this.brightness);
      this.render();
      break;
    case 'brightnessup':
      this.brightness = Math.min(255, this.brightness + 32);
      sysutil.setprop('persist.pandohubui.brightness', this.brightness);
      this.render();
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
    if (!this.dialogEngine || !this.ledsPresent) {
      return;
    }

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
        await this.ring.unconfiguredPing();
        break;
      case 'volumeChanged':
        {
          alertTimeMs = 2000;
          const volumeIndex = clamp(volume.level / VOLUME_STEP_INC, 0, VOLUME_STEPS);
          log.info(`volume is ${volume.level} (${volumeIndex}/${VOLUME_STEPS})`);
          await this.ring.volume(volumeIndex);
          break;
        }
      case 'dialogDone':
        alertTimeMs = 1000;
        await Promise.all([
          this.ring.finishedDialog(),
          this.nightlight.blue(),
        ]);
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
    log.debug('brightness:', this.brightness);

    if (this.alertTimer !== null) {
      // Alert is still pending, don't disturb it
      return;
    }
    switch (this.deviceUiState) {
    case 'bootanimation':
    case 'charging':
      await Promise.all([
        this.ring.initializing(),
        this.nightlight.blue(),
      ]);
      break;
    case 'unconfigured':
    case 'configStarted':
      await Promise.all([
        this.ring.unconfigured(),
        this.nightlight.orange(),
      ]);
      break;
    case 'configRegistering':
      await Promise.all([
        this.ring.configuring(),
        this.nightlight.orange(),
      ]);
      break;
    case 'connecting':
      switch (this.connectingSubstate) {
      case 'ok':
        await Promise.all([
          this.ring.processing(),
          this.nightlight.blueWithGlow(),
        ]);
        break;
      case 'littleSlow':
        await Promise.all([
          this.ring.speakingError(),
          this.nightlight.orange(),
        ]);
        break;
      case 'somethingsWrong':
        await Promise.all([
          this.ring.online(),
          this.nightlight.white(this.brightness),
        ]);
        break;
      default:
        invariant(false, 'Unknown substate: ' + this.connectingSubstate);
      }
      break;
    case 'online':
      if (this.dialogEngine.uiMode === 'mute') {
        await Promise.all([
          this.ring.mute(),
          this.nightlight.red(),
        ]);
        break;
      }

      switch (this.dialogState) {
      case 'idle':
        switch (this.dialogEngine.uiMode) {
        case 'normal':
          await Promise.all([
            this.ring.online(),
            this.nightlight.white(this.brightness),
          ]);
          break;
        case 'dnd':
          await Promise.all([
            this.ring.silent(),
            this.nightlight.blue(),
          ]);
          break;
        default:
          invariant(false);
        }
        break;
      case 'listening':
        await Promise.all([
          this.ring.listening(),
          this.nightlight.blue(),
        ]);
        break;
      case 'processing_speech':
        await Promise.all([
          this.ring.processing(),
          this.nightlight.blueWithGlow(),
        ]);
        break;
      case 'speaking':
        await Promise.all([
          this.ring.speaking(),
          this.nightlight.blue(),
        ]);
        break;
      case 'speaking_network_error':
        await Promise.all([
          this.ring.speakingError(),
          this.nightlight.orange(),
        ]);
        break;
      default:
        invariant(false, 'Unknown state: ' + this.dialogState);
      }
      break;
    case 'powerdown':
      await Promise.all([
        this.ring.online(),
        this.nightlight.white(0),
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
    this.connectingSubstate = 'littleSlow';
    this.connectingTimer = setTimeout(this.onStillNotConnectedYet,
      CONNECTING_TIMEOUT__SOMETHINGS_WRONG);
    this.render();
  };

  onStillNotConnectedYet: (() => void) = () => {
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
  }
}

module.exports = (env: Env) => new PandoHubUi(env);
