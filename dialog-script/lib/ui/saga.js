/**
 * @flow
 */

import createLog from 'silk-log/device';
import {call, take} from 'redux-saga/effects';
import invariant from 'assert';
import volume from 'silk-volume';
import lights from 'silk-lights';
import factoryReset from 'silk-factory-reset';
import type {Environment} from '../environment';
import type {Entities} from 'silk-dialog-engine';

const log = createLog(`dialog-script-ui-saga`);

export function* requestFactoryReset(
  environment: Environment,
): Generator<Object, void, any> {
  const {micChannel, speak} = environment;

  yield call(speak, `Are you sure you want to factory reset this device?`, 'waiting');

  let event = yield take(micChannel);
  invariant(event);

  const {text} = event;
  if (!text) {
    return;
  }

  if (event.intent === `confirm`) {
    yield call(speak, 'ok', 'idle');
    factoryReset.start();
  } else {
    yield call(speak, 'cancelled', 'idle');
  }
}

export function* setUiMode(
  environment: Environment,
  entities: Entities
): Generator<Object, void, any> {
  const {dialogEngine, speak} = environment;

  invariant(entities.length === 1);
  let entity = entities[0].entity;

  switch (entity) {
  case 'normal':
  case 'mute':
  case 'dnd':
    dialogEngine.uiMode = entity;
    break;
  default:
    invariant(false, `Invalid mode: ${entity}`);
  }
  yield call(speak, 'ok', 'idle');
}

export function* setNightlightColor(
  environment: Environment,
  entities: Entities
): Generator<Object, void, any> {
  const {speak} = environment;

  invariant(entities.length === 1);
  let entity = entities[0].entity;

  const nightlightRgb = lights.get('nightlightRgb');
  const nightlightWhite = lights.get('nightlightWhite');
  if (!nightlightRgb || !nightlightWhite) {
    yield call(speak, `Unable to set Nightlight color`);
    return;
  }

  switch (entity) {
  case 'red':
    nightlightRgb.set(lights.RED);
    nightlightWhite.set(63);  // 25% brightness
    break;
  case 'white':
    nightlightRgb.set(lights.WHITE);
    nightlightWhite.set(127); // 50% brightness
    break;
  case 'blue':
    nightlightRgb.set(lights.BLUE);
    nightlightWhite.set(255); // 100% brightness
    break;
  default:
    yield call(speak, `Unsupported nightlight color: ${entity}`, 'idle');
    return;
  }
  yield call(speak, 'ok', 'idle');
}

export function* setVolume(
  environment: Environment,
  entities: Entities
): Generator<Object, void, any> {
  const {speak} = environment;

  invariant(entities.length === 1);
  let entity = entities[0].entity;

  log.error('SETVOL', entity);
  if (entity === 'up') {
    volume.level = Math.min(volume.level + 10, 100);
  } else {
    volume.level = Math.max(volume.level - 10, 0);
  }

  yield call(speak, `Volume set to ${volume.level} percent`, 'idle');
}
