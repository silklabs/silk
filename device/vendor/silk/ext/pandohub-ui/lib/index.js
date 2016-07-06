/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

/*
  LEDs
  ----

  The pando hub has seven LP55321 controllers to manage its LEDs.  For more details on
  this controller, see http://www.ti.com/lit/ds/symlink/lp55231.pdf

  The nightlight driven by three controllers: 1-0032, 1-0033, 1-0034:

    1-0032
      1: D3002 (W)
      2: D3004 (W)
      3: -
      4: -
      5: D509 (W)
      6: D510 (W)
      7: D3011 (R)
      8: D3012 (R)

    1-0033:
      1: D3001 (W)
      2: D3010 (W)
      3: D3003 (G)
      4: D3005 (G)
      5: D3013 (B)
      6: D3014 (B)
      7: -
      8: -

    1-0034:
      1: D501 (W)
      2: D502 (W)
      3: D504 (G)
      4: D505 (B)
      5: D507 (G)
      6: D508 (B)
      7: -
      8: D503 (R)
      9: D506 (R)


  The light ring is driven by four controllers, 5-0032..5-0034, which all
  have the same LED mapping:
      1: G
      2: B
      3: G
      4: B
      5: G
      6: B
      7: R
      8: R
      9: R

  The light right controller orientation is as follows, where 12 o'clock points to the
  power button:
      5-0032: 5 o'clock
      5-0033: 7 o'clock
      5-0034: 2 o'clock
      5-0035: 11 o'clock
*/

import path from 'path';
import fs from 'fs';
import invariant from 'assert';

import createLog from 'silk-log/device';
import Input from 'silk-input';
import * as sysutil from 'silk-sysutils';
import volume from 'silk-volume';
import type { Env, UiState } from 'silk-exttest';
import { genDialogEngine } from 'silk-dialog-engine';
import type { DialogEngine, DialogUiModeEventCallback } from 'silk-dialog-engine';

const log = createLog('silkext-pandohubui');

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

type RGB = {
  r: number; // 0..255
  g: number; // 0..255
  b: number; // 0..255
};


function clamp(v, min, max) {
  return Math.max(min, Math.min(max, Math.floor(v)));
}

class PandoHubUi {
  input: Input;
  deviceUiState: UiState;
  dialogEngine: ?DialogEngine;
  dialogState: DialogState;
  connectingSubstate: ConnectingSubstate;
  brightness: number; // 0 .. 255
  nightlightRGB: RGB;
  connectingTimer: ?number;
  alertTimer: ?number;
  ledsPresent: bool;

  constructor(env: Env) {
    this.input = new Input();
    this.deviceUiState = 'bootanimation';
    this.dialogState = 'idle';
    this.dialogEngine = null;
    this.brightness = clamp(0, 255, sysutil.getintprop('persist.pandohubui.brightness', 128));
    this.nightlightRGB = {r: 0, b: 255, g: 200};
    this.connectingTimer = null;
    this.alertTimer = null;
    this.ledsPresent = false;
    fs.access('/sys/bus/i2c/drivers/lp5523x', err => {
      this.ledsPresent = !err;
    });

    this.input.on('down', this.onKeyPress);
    this.onDeviceUiState(env.ui.getState());

    env.ui.on('state', this.onDeviceUiState);
    env.timeline.on('listening', this.onDialogListening);
    env.timeline.on('processing_speech', this.onDialogProcessingSpeech);
    env.timeline.on('speaking', this.onDialogSpeaking);
    env.timeline.on('speaking_network_error', this.onDialogNetworkError);
    env.timeline.on('finished_processing_speech', this.onDialogFinished);

    volume.on('changed', this.onVolumeChanged);

    genDialogEngine()
    .then(dialogEngine => {
      this.dialogEngine = dialogEngine;
      this.dialogEngine.on('ui-mode', this.onDialogUiMode);
      this.render();
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
    this.startAlert('dialogDone');
    this.render();
  };

  onVolumeChanged: (() => void) = () => {
    this.startAlert('volumeChanged');
    this.render();
  }

  onKeyPress: InputEventCallback = event => {

    log.info('key event:', event);
    switch (event.keyId) {
    case 'volumedown':
      volume.level = Math.max(0, volume.level - 10);
      this.startAlert('volumeChanged');
      break;
    case 'volumeup':
      volume.level = Math.min(100, volume.level + 10);
      this.startAlert('volumeChanged');
      break;
    case 'mute':
      volume.mute = !volume.mute;
      break;
    case 'brightnessdown':
      this.brightness = Math.max(0, this.brightness - 32);
      sysutil.setprop('persist.pandohubui.brightness', this.brightness);
      break;
    case 'brightnessup':
      this.brightness = Math.min(255, this.brightness + 32);
      sysutil.setprop('persist.pandohubui.brightness', this.brightness);
      break;
    default:
      log.verbose('Unhandled key', event.keyId);
      break;
    }
    this.render();
  };

  startAlert(alert: Alert) {
    if (this.alertTimer) {
      clearTimeout(this.alertTimer);
      this.alertTimer = null;
    }
    let alertTimeMs;
    switch (alert) {
    case 'configStarted':
      alertTimeMs = 2000;
      // TODO: Start LED pattern
      break;
    case 'volumeChanged':
      alertTimeMs = 1000;
      // TODO: Start LED pattern
      break;
    case 'dialogDone':
      alertTimeMs = 500;
      // TODO: Start LED pattern
      break;
    default:
      invariant(false, 'Unknown alert:', alert);
    }
    log.info('alert started:', alert);
    this.alertTimer = setTimeout(
      () => {
        log.info('alert complete:', alert);
        this.alertTimer = null;
        this.render();
      },
      alertTimeMs
    );
  }

  render(): void {
    if (!this.dialogEngine) {
      return;
    }

    log.info('deviceUiState:', this.deviceUiState);
    log.info('connectingSubstate:', this.connectingSubstate);
    log.info('dialogState:', this.dialogState);
    log.info('dialogUiMode:', this.dialogEngine.uiMode);
    log.info('alert:', this.alertTimer !== null);
    log.info('volume:', volume.level);
    log.info('volume mute:', volume.mute);
    log.info('brightness:', this.brightness);

    if (this.alertTimer !== null) {
      return;
    }
    if (volume.mute) {
      this.renderRing({r: 255, g: 0, b: 255});
    } else {
      switch (this.deviceUiState) {
      case 'bootanimation':
        this.renderRing({r: 192, g: 192, b: 192});
        break;
      case 'charging':
        this.renderRing({r: 64, g: 64, b: 64});
        break;
      case 'unconfigured':
        this.renderRing({r: 255, g: 0, b: 0});
        break;
      case 'configStarted':
      case 'configRegistering':
        this.renderRing({r: 0, g: 255, b: 255});
        break;
      case 'connecting':
        switch (this.connectingSubstate) {
        case 'ok':
          this.renderRing({r: 255, g: 255, b: 0});
          break;
        case 'littleSlow':
          this.renderRing({r: 255, g: 255, b: 128});
          break;
        case 'somethingsWrong':
          this.renderRing({r: 255, g: 255, b: 255});
          break;
        default:
          invariant(false, 'Unknown substate: ' + this.connectingSubstate);
        }
        break;
      case 'online':
        // TODO: check this.dialogEngine.uiMode...
        this.renderRing({r: 0, g: 255, b: 0});
        break;
      case 'powerdown':
        this.renderRing({r: 128, g: 128, b: 128});
        break;
      default:
        invariant(false, 'Unknown UI state', this.deviceUiState);
      }
    }
    this.renderNightlight();
  }

  writeLED(ledId: string, brightness: number) {
    if (!this.ledsPresent) {
      return;
    }
    const filepath = path.join('/sys/bus/i2c/drivers/lp5523x', ledId, 'brightness');
    log.verbose('Writing to', filepath, 'with', brightness.toString());
    try {
      fs.writeFileSync(filepath, brightness.toString());
    } catch (e) {
      log.warn(e.stack || e);
    }
  }

  renderNightlight() {
    const nightlightBrightness = this.brightness;
    const brightnessPercent = this.brightness / 255;
    const r = clamp(this.nightlightRGB.r * brightnessPercent, 0, 255);
    const g = clamp(this.nightlightRGB.g * brightnessPercent, 0, 255);
    const b = clamp(this.nightlightRGB.b * brightnessPercent, 0, 255);

    // Top
    this.writeLED('1-0034/leds/d501:W', nightlightBrightness);
    this.writeLED('1-0034/leds/d502:W', nightlightBrightness);
    this.writeLED('1-0032/leds/d509:W', nightlightBrightness);
    this.writeLED('1-0032/leds/d510:W', nightlightBrightness);
    this.writeLED('1-0034/leds/d503:R', r);
    this.writeLED('1-0034/leds/d506:R', r);
    this.writeLED('1-0034/leds/d504:G', g);
    this.writeLED('1-0034/leds/d507:G', g);
    this.writeLED('1-0034/leds/d505:B', b);
    this.writeLED('1-0034/leds/d508:B', b);

    // Bottom
    this.writeLED('1-0033/leds/d3001:W', nightlightBrightness);
    this.writeLED('1-0032/leds/d3002:W', nightlightBrightness);
    this.writeLED('1-0032/leds/d3004:W', nightlightBrightness);
    this.writeLED('1-0033/leds/d3010:W', nightlightBrightness);
    this.writeLED('1-0032/leds/d3011:R', r);
    this.writeLED('1-0032/leds/d3012:R', r);
    this.writeLED('1-0033/leds/d3003:G', g);
    this.writeLED('1-0033/leds/d3005:G', g);
    this.writeLED('1-0033/leds/d3013:B', b);
    this.writeLED('1-0033/leds/d3014:B', b);
  }

  renderRing(rgb: RGB) {
    const brightnessPercent = this.brightness / 255;
    const r = clamp(rgb.r * brightnessPercent, 0, 255);
    const g = clamp(rgb.g * brightnessPercent, 0, 255);
    const b = clamp(rgb.b * brightnessPercent, 0, 255);

    this.writeLED('5-0032/leds/d601:R', r);
    this.writeLED('5-0032/leds/d601:G', g);
    this.writeLED('5-0032/leds/d601:B', b);
    this.writeLED('5-0032/leds/d602:R', r);
    this.writeLED('5-0032/leds/d602:G', g);
    this.writeLED('5-0032/leds/d602:B', b);
    this.writeLED('5-0032/leds/d603:R', r);
    this.writeLED('5-0032/leds/d603:G', g);
    this.writeLED('5-0032/leds/d603:B', b);

    this.writeLED('5-0033/leds/d604:R', r);
    this.writeLED('5-0033/leds/d604:G', g);
    this.writeLED('5-0033/leds/d604:B', b);
    this.writeLED('5-0033/leds/d605:R', r);
    this.writeLED('5-0033/leds/d605:G', g);
    this.writeLED('5-0033/leds/d605:B', b);
    this.writeLED('5-0033/leds/d606:R', r);
    this.writeLED('5-0033/leds/d606:G', g);
    this.writeLED('5-0033/leds/d606:B', b);

    this.writeLED('5-0035/leds/d610:R', r);
    this.writeLED('5-0035/leds/d610:G', g);
    this.writeLED('5-0035/leds/d610:B', b);
    this.writeLED('5-0035/leds/d611:R', r);
    this.writeLED('5-0035/leds/d611:G', g);
    this.writeLED('5-0035/leds/d611:B', b);
    this.writeLED('5-0035/leds/d612:R', r);
    this.writeLED('5-0035/leds/d612:G', g);
    this.writeLED('5-0035/leds/d612:B', b);

    this.writeLED('5-0034/leds/d607:R', r);
    this.writeLED('5-0034/leds/d607:G', g);
    this.writeLED('5-0034/leds/d607:B', b);
    this.writeLED('5-0034/leds/d608:R', r);
    this.writeLED('5-0034/leds/d608:G', g);
    this.writeLED('5-0034/leds/d608:B', b);
    this.writeLED('5-0034/leds/d609:R', r);
    this.writeLED('5-0034/leds/d609:G', g);
    this.writeLED('5-0034/leds/d609:B', b);
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
    case 'config started':
      this.startAlert('configStarted');
      break;
    case 'connecting':
      this.connectingTimer = setTimeout(this.onNotConnectedYet,
        CONNECTING_TIMEOUT__LITTLE_SLOW);
      break;
    default:
      break;
    }
    this.render();
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
    volume.removeListener('changed', this.onVolumeChanged);
  }
}

module.exports = (env: Env) => new PandoHubUi(env);
