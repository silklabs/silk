/**
 * @flow
 */

import createLog from 'silk-log/device';
import {call} from 'redux-saga/effects';
import invariant from 'assert';
import lifx from 'silk-lifx';

import type {Environment} from '../environment';

const log = createLog(`script-generic-light-saga`);

export function* turnOnLight(
  environment: Environment,
): Generator<Object, void, any> {
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  log.info(`Starting light on saga`);
  lifx.setScene('blue');

  yield call(speak, 'Turning on', `idle`);
}

export function* turnOffLight(
  environment: Environment,
): Generator<Object, void, any> {
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  log.info(`Starting light off saga`);
  lifx.setScene('off');

  yield call(speak, 'Turning off', `idle`);
}
