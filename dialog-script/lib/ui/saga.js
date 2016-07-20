/**
 * @flow
 */

import createLog from 'silk-log/device';
import {call, take} from 'redux-saga/effects';
import invariant from 'assert';
import volume from 'silk-volume';
import factoryReset from 'silk-factory-reset';
import type {Environment} from '../environment';

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
  entities: Array<string>
): Generator<Object, void, any> {
  const {dialogEngine, speak} = environment;

  invariant(entities.length === 1);
  switch (entities[0]) {
  case 'normal':
  case 'mute':
  case 'dnd':
    dialogEngine.uiMode = entities[0];
    break;
  default:
    invariant(false, `Invalid mode: ${entities[0]}`);
  }
  yield call(speak, 'ok', 'idle');
}

export function* setVolume(
  environment: Environment,
  entities: Array<string>
): Generator<Object, void, any> {
  const {speak} = environment;

  invariant(entities.length === 1);
  log.error('SETVOL', entities[0]);
  if (entities[0] === 'up') {
    volume.level = Math.min(volume.level + 10, 100);
  } else {
    volume.level = Math.max(volume.level - 10, 0);
  }

  yield call(speak, `Volume set to ${volume.level} percent`, 'idle');
}
