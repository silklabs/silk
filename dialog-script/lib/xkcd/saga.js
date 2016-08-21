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

  invariant(entities.length === 1);
  invariant(entities[0].type === 'number');
  switch (entities[0].entity) {
  case '149': // https://xkcd.com/149/
    yield call(speak, 'Make it yourself', 'idle');
    break;
  case '149-sudo':
    yield call(speak, 'Okay', 'idle');
    break;
  default:
    invariant(false);
  }
}

