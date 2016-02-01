/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

// Load the regnerator polyfill manually so we don't need to also load all the
// core-js pollyfills which we don't actually need...
import regeneratorRuntime from 'babel-runtime/regenerator';
global.regeneratorRuntime = global.regeneratorRuntime || regeneratorRuntime;

import Sonos from './sonos';
import Lifx from './lifx';
import fs from 'mz/fs';

const CONFIG_FILE = 'system/silk/media/welcome/config.json';

let log;

/**
 * Class that implements the welcome extension, which actuates connected home devices
 * when specific events are received on the timeline.
 *
 * @param welcome Instance of welcome class
 */
class Welcome {
  constructor(env) {
    this._env = env;
    log = env.log;

    this._faceSeenConfigs = {};
    this._noFaceDetectedConfig = {};
    this._modeConfigs = {};
    this.mode = '';

    this.onFace = (when, rects, source, name) => this._onFace(name);
    this._env.timeline.on('face', this.onFace);

    this.readConfig();

    this._sonos = new Sonos(env);
    this._lifx = new Lifx(env);

    log.info('welcome loaded \\o\/');
  }

  async readConfig() {
    try {
      let data = await fs.readFile(CONFIG_FILE);
      let config = JSON.parse(data);
      this._modeConfigs = config.modes;

      Object.keys(this._modeConfigs).forEach(mode => {
        let modeConfig = this._modeConfigs[mode];
        modeConfig.mode = mode;

        log.info(`loading new mode ${mode} ${modeConfig}`);

        if (modeConfig.type === 'faceSeen') {
          this._faceSeenConfigs[modeConfig.faceName] = modeConfig;
        }

        // TODO: only one noFaceDeteted type is supported, use last one
        if (modeConfig.type === 'noFaceDetected') {
          this._noFaceDetectedConfig = modeConfig;

          // Process fake face detect to kick off no face detection timer
          this._onFace();
        }
      });
    } catch (err) {
      log.error(`Error reading config file '${CONFIG_FILE}', err: ${err}`);
    }
  }

  _onFace(faceName) {
    faceName = faceName || 'unknown face';
    log.info(`Received 'face' event identified as '${faceName}'`);

    if (faceName in this._faceSeenConfigs) {
      this.changeMode(this._faceSeenConfigs[faceName].mode);
    }

    // Update timer for no face detected event
    clearTimeout(this._noFaceDetectedTimer);
    if (this._noFaceDetectedConfig) {
      let durationMs = this._noFaceDetectedConfig.durationMs || 30000;

      let noFaceTimerExpired = () => {
        log.info(`No face detected timer expired`);
        this.changeMode(this._noFaceDetectedConfig.mode);
      };

      this._noFaceDetectedTimer = setTimeout(noFaceTimerExpired, durationMs);
    }
  }

  changeSonos(sonosConfig) {
    switch (sonosConfig.action) {
    case 'play':
      if (sonosConfig.uri) {
        this._sonos.playUri(sonosConfig.uri);
      } else if (sonosConfig.queryType && sonosConfig.queryValue) {
        this._sonos.playQuery(sonosConfig.queryType, sonosConfig.queryValue);
      }
      break;
    case 'pause':
      this._sonos.pause();
      break;
    default:
      log.info(`Bad Sonos action: ${sonosConfig.action}`);
      break;
    }
  }

  changeLifx(lifxConfig) {
    this._lifx.setScene(lifxConfig.scene);
  }

  changeMode(newMode) {
    if (this.mode === newMode) {
      log.debug(`Already in '${newMode}' mode, not changing`);
      return;
    }
    log.info(`Changing to '${newMode}' mode`);

    let modeConfig = this._modeConfigs[newMode];

    if (modeConfig.sonos) {
      this.changeSonos(modeConfig.sonos);
    }

    if (modeConfig.lifx) {
      this.changeLifx(modeConfig.lifx);
    }

    this.mode = newMode;
  }

  willUnload() {
    this._env.timeline.removeListener('face', this.onFace);
    this._sonos.willUnload();
    this._lifx.willUnload();
  }
}

module.exports = env => new Welcome(env);
