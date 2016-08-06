/**
 * @flow
 */

import {call} from 'redux-saga/effects';
import invariant from 'assert';
import type {Environment} from '../environment';
import type {Entities} from 'silk-dialog-engine';

export function* xkcd(
  environment: Environment,
  entities: Entities
): Generator<Object, void, any> {
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  invariant(entities.length === 2);
  let cmd = entities[0].entity;
  let arg = entities[1].entity;

  switch (cmd) {
  case '149': // https://xkcd.com/149/
    yield call(speak, arg === 'sudo' ? 'Okay' : 'Make it yourself', 'idle');
    break;
  default:
    invariant(false);
  }
}

