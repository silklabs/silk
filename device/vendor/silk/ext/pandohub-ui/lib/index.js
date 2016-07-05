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
import assert from 'assert';

import createLog from 'silk-log/device';
import Input from 'silk-input';
import * as sysutil from 'silk-sysutils';
import volume from 'silk-volume';
import type { Env, UiState } from 'silk-exttest';

const log = createLog('silkext-pandohubui');

type InputEventCallback = (event: { keyId: string }) => void;
type UiStateEventCallback = (state: string) => void;

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
  uiState: UiState;
  brightness: number; // 0 .. 1
  nightlightRGB: RGB;

  constructor(env: Env) {
    this.uiState = 'bootanimation';
    this.brightness = Math.max(0, Math.min(100, sysutil.getintprop('persist.pandohubui.brightness', 50))) / 255;

    this.nightlightRGB = {r: 0, b: 255, g: 200};

    this.input = new Input();
    this.input.on('down', this.onKeyPress);
    this.uiState = env.ui.getState();
    env.ui.on('state', this.onUiState);
    this.render();
  }

  onKeyPress: InputEventCallback = event => {

    log.info('key event:', event);
    switch (event.keyId) {
    case 'volumedown':
      volume.level = Math.max(0, volume.level - 10);
      break;
    case 'volumeup':
      volume.level = Math.min(100, volume.level + 10);
      break;
    case 'mute':
      volume.mute = !volume.mute;
      break;
    case 'brightnessdown':
      this.brightness = Math.max(0, this.brightness - 0.1);
      break;
    case 'brightnessup':
      this.brightness = Math.min(1, this.brightness + 0.1);
      break;
    default:
      log.verbose('Unhandled key', event.keyId);
      break;
    }
    sysutil.setprop('persist.pandohubui.brightness', clamp(this.brightness * 255, 0, 255));
    log.info('volume:', volume.level);
    log.info('volume mute:', volume.mute);
    log.info('brightness:', this.brightness);
    this.render();
  };

  render(): void {
    if (volume.mute) {
      this.renderRing({r: 255, g: 0, b: 255});
    } else {
      switch (this.uiState) {
      case 'bootanimation':
        this.renderRing({r: 192, g: 192, b: 192});
        break;
      case 'charging':
        this.renderRing({r: 64, g: 64, b: 64});
        break;
      case 'unconfigured':
        this.renderRing({r: 255, g: 0, b: 0});
        break;
      case 'configuring':
        this.renderRing({r: 0, g: 255, b: 255});
        break;
      case 'connecting':
        this.renderRing({r: 255, g: 255, b: 0});
        break;
      case 'online':
        this.renderRing({r: 0, g: 255, b: 0});
        break;
      case 'powerdown':
        this.renderRing({r: 128, g: 128, b: 128});
        break;
      default:
        assert('Unknown UI state', this.uiState);
        break;
      }
    }
    this.renderNightlight();
  }

  writeLED(ledId: string, brightness: number) {
    const filepath = path.join('/sys/bus/i2c/drivers/lp5523x', ledId, 'brightness');
    log.verbose('Writing to', filepath, 'with', brightness.toString());
    try {
      fs.writeFileSync(filepath, brightness.toString());
    } catch (e) {
      log.warn(e.stack || e);
    }
  }

  renderNightlight() {
    const nightlightBrightness = clamp(this.brightness * 255, 0, 255);
    const r = clamp(this.nightlightRGB.r * this.brightness, 0, 255);
    const g = clamp(this.nightlightRGB.g * this.brightness, 0, 255);
    const b = clamp(this.nightlightRGB.b * this.brightness, 0, 255);

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
    const r = clamp(rgb.r * this.brightness, 0, 255);
    const g = clamp(rgb.g * this.brightness, 0, 255);
    const b = clamp(rgb.b * this.brightness, 0, 255);

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

  onUiState: UiStateEventCallback = uiState => {
    log.info('Ui State', uiState);
    this.uiState = uiState;
    this.render();
  };

  willUnload(): void {
    this.input.removeListener('down', this.onKeyPress);
  }
}

module.exports = (env: Env) => new PandoHubUi(env);
