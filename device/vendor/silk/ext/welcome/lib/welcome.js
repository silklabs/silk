/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

import fs from 'mz/fs';
import lifx from 'silk-lifx';
import sonos from 'silk-sonos';

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
    this._soundConfigs = {};
    this._noFaceDetectedConfig = {};
    this._triggerConfigs = {};
    this._modeConfigs = {};
    this.mode = '';

    this._env.timeline.on('face', this._onFace);
    this._env.timeline.on('sound', this._onSound);

    this.readConfig();

    this._sonos = sonos;
    this._lifx = lifx;

    log.info('welcome loaded \\o\/');
  }

  async readConfig() {
    try {
      let data = await fs.readFile(CONFIG_FILE);
      let config = JSON.parse(data);

      this._modeConfigs = config.modes;
      Object.keys(this._modeConfigs).forEach(modeName => {
        let modeConfig = this._modeConfigs[modeName];
        log.info(`loading new mode ${modeName} ${modeConfig}`);
      });

      this._triggerConfigs = config.triggers;
      Object.keys(this._triggerConfigs).forEach(triggerName => {
        let triggerConfig = this._triggerConfigs[triggerName];

        log.info(`loading new trigger ${triggerName} ${triggerConfig}`);

        if (triggerConfig.type === 'faceSeen') {
          this._faceSeenConfigs[triggerConfig.faceName] = triggerConfig;
        } else if (triggerConfig.type === 'sound') {
          this._soundConfigs[triggerConfig.name] = triggerConfig;
        }

        // TODO: only one noFaceDeteted type is supported, use last one
        if (triggerConfig.type === 'noFaceDetected') {
          this._noFaceDetectedConfig = triggerConfig;

          // Process fake face detect to kick off no face detection timer
          this._onFace();
        }
      });
    } catch (err) {
      log.error(`Error reading config file '${CONFIG_FILE}', err: ${err}`);
    }
  }

  _onSound = (when, rects, source, name) => {
    log.info(`Received ${name} 'sound' event`);

    if (name in this._soundConfigs) {
      this.changeMode(this._soundConfigs[name].mode);
    }
  };

  _onFace = (when, rects, source, faceName) => {
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
  };

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
    if (!(newMode in this._modeConfigs)) {
      log.error(`'${newMode}' mode not defined`);
      return;
    }

    let modeConfig = this._modeConfigs[newMode];

    if ('durationMs' in modeConfig && 'nextMode' in modeConfig) {
      clearTimeout(this._nextModeTimer);
      this._nextModeTimer = setTimeout(() => {
        this.changeMode(modeConfig.nextMode);
      }, modeConfig.durationMs);
    }

    if (this.mode === newMode) {
      log.debug(`Already in '${newMode}' mode, not changing`);
      return;
    }
    log.info(`Changing to '${newMode}' mode`);

    if (modeConfig.sonos) {
      this.changeSonos(modeConfig.sonos);
    }

    if (modeConfig.lifx) {
      this.changeLifx(modeConfig.lifx);
    }

    this.mode = newMode;
  }

  willUnload() {
    clearTimeout(this._noFaceDetectedTimer);
    clearTimeout(this._nextModeTimer);
    this._env.timeline.removeListener('face', this._onFace);
    this._env.timeline.removeListener('sound', this._onSound);
    this._sonos.willUnload();
    this._lifx.willUnload();
  }
}

module.exports = env => new Welcome(env);
