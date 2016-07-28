/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

import LifxApi from 'node-lifx';

import createLog from 'silk-log/device';
const log = createLog(`lifx`);

// Scenes in this format:
// {
//   states: [state, ...],
//   iterations (optional)
// }
//
// Scene will cycle through each states for 'iterations' number of times.
// Will not repeat if iterations is undefined.
//
// state is in this format:
// {
//   color: {hue, saturation, brightness, kelvin},
//   durationMs (optional)
// }
//
// Scene will stay at state for durationMs before progressing to the next state
// state. If durationMs is 0 or undefined, scene will stay current state.
//
const scenes = {
  blue: {states: [{color: [190, 88, 100, 3500] }] },
  red: {states: [{color: [329, 44, 57, 3500]}] },
  green: {states: [{color: [109, 94, 100, 3500] }] },
  purple: {states: [{color: [295, 93, 100, 3500] }] },
  smoke: {
    states: [
      {color: [16, 100, 89, 3500], durationMs: 500},  /* red */
      {color: [194, 19, 100, 3500], durationMs: 500}, /* white */
    ],
  },
  police: {
    states: [
      {color: [214, 100, 98, 3500], durationMs: 500}, /* blue */
      {color: [16, 100, 89, 3500], durationMs: 500},  /* red */
    ],
  },
};

class Lifx {
  constructor() {
    this._lights = {};
    this._scene = undefined;
    this._sceneStateIndex = undefined;
    this._sceneStateTimer = undefined;
    this._sceneIterationCnt = undefined;

    log.info('initializing Lifx');

    this._lifx = new LifxApi.Client();
    this._lifx.init();

    this._lifx.on('light-new', this._onLightNew);
  }

  _onLightNew = light => {
    log.info(`Found Lifx light ${light.id}`);
    this._lights[light.id] = light;
  };

  _onError(cmd, err) {
    log.info(`Lifx cmd ${cmd} ${err ? 'error: ' + err : 'success'}`);
  }

  _updateLights(lightsOn, color) {
    for (const lightId in this._lights) {
      let light = this._lights[lightId];
      log.info(`... changing Lifx bulb ${light.id}`);

      if (lightsOn) {
        light.color(color[0], color[1], color[2], color[3], 0,
            err => this._onError('color', err));
        light.on(0, err => this._onError('on', err));
      } else {
        light.off(0, err => this._onError('off', err));
      }
    }
  }

  _onSceneStateTimerExpired() {
    this._sceneStateIndex++;
    if (this._sceneStateIndex === this._scene.states.length) {
      this._sceneIterationCnt++;
      this._sceneStateIndex = 0;
    }

    if ('iterations' in this._scene &&
        this._sceneIterationCnt === this._scene.iterations) {
      // finished with iterations. Turn eveyrthing off
      this._updateLights(false);
    } else {
      // go to next scene state
      this._updateSceneState();
    }
  }

  _updateSceneState() {
    let sceneState = this._scene.states[this._sceneStateIndex];
    let color = sceneState.color;
    this._updateLights(true, color);

    // set timer to update to next sceneState if needed
    if (sceneState.durationMs) {
      this._sceneStateTimer = setTimeout(() => this._onSceneStateTimerExpired(),
        sceneState.durationMs);
    }
  }

  setScene(sceneName) {
    log.info(`Changing Lifx to ${sceneName}`);

    clearTimeout(this._sceneStateTimer);

    if (sceneName === 'off') {
      this._updateLights(false);
    } else if (sceneName in scenes) {
      this._scene = scenes[sceneName];
      this._sceneStateIndex = 0;
      this._sceneIterationCnt = 0;
      this._updateSceneState();
    } else {
      log.error(`Lifx sceneName unknown: ${sceneName}`);
    }
  }

  willUnload() {
    clearTimeout(this._sceneStateTimer);
    this._lifx.removeListener('on', this._onLightNew);
    this._lifx.stopDiscovery();
    this._lifx.stopSendingProcess();
    this._lifx.destroy();
    this._lifx = undefined;
  }
}

export default new Lifx();
