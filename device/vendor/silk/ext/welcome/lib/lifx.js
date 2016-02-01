/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import LifxApi from 'node-lifx';

let log;

// Scenes in this format:
// {
//   states: [state, ...],
//   iterations
// }
//
// Scene will cycle through each states for 'interations' number of times.
// Will not repeat if iterations is 0.
//
// state is in this format:
// {
//   color: {hue, saturation, brightness, kelvin},
//   durationMs
// }
//
// Scene will stay at state for durationMs before progressing to the next state
// state. durationMs of 0 means to stay at current state.
//
const scenes = {
  blue: {states: [{color: [190, 88, 100, 3500], durationMs: 0}], iterations: 0},
  red: {states: [{color: [329, 44, 57, 3500], durationMs: 0}], iterations: 0},
  green: {states: [{color: [109, 94, 100, 3500], durationMs: 0}], iterations: 0},
  purple: {states: [{color: [295, 93, 100, 3500], durationMs: 0}], iterations: 0},
  smoke: {
    states: [
      {color: [16, 100, 89, 3500], durationMs: 500},  /* red */
      {color: [194, 19, 100, 3500], durationMs: 500}, /* white */
    ],
    iterations: 8
  },
  police: {
    states: [
      {color: [214, 100, 98, 3500], durationMs: 500}, /* blue */
      {color: [16, 100, 89, 3500], durationMs: 500},  /* red */
    ],
    iterations: 8
  },
};

export default class Lifx {
  constructor(env) {
    this._env = env;
    this._lights = {};
    this._scene = undefined;
    this._sceneStateIndex = undefined;
    this._sceneStateTimer = undefined;
    this._sceneIterationCnt = undefined;
    log = env.log;

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

    if (this._sceneIterationCnt === this._scene.iterations) {
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
    this._lifx.removeListener('on', this._onLightNew);
    this._lifx = undefined;
  }
}
