/**
 * @flow
 */

import createLog from 'silk-log';
import {call} from 'redux-saga/effects';
import invariant from 'assert';
import sonos from 'silk-sonos';

import type {Environment} from '../environment';

const log = createLog(`script-generic-music-saga`);

export function* playMusic(
  environment: Environment,
): Generator<Object, void, any> {                // eslint-disable-line no-undef
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  log.info(`Starting play music saga`);
  sonos.play();

  yield call(speak, 'Playing', `idle`);
}

export function* pauseMusic(
  environment: Environment,
): Generator<Object, void, any> {                // eslint-disable-line no-undef
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  log.info(`Starting play music saga`);
  sonos.pause();

  yield call(speak, 'Pausing', `idle`);
}
