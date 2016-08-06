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

  const nightlight = lights.get('nightlight');
  if (!nightlight) {
    yield call(speak, `Unable to set Nightlight color`);
    return;
  }

  switch (entity) {
  case 'red':
    nightlight.set(lights.RED);
    break;
  case 'white':
    nightlight.set(lights.WHITE);
    break;
  case 'blue':
    nightlight.set(lights.BLUE);
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
