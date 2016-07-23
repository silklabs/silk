/**
 * @flow
 */

import {call} from 'redux-saga/effects';
import invariant from 'assert';
import type {Environment} from '../environment';

export function* xkcd(
  environment: Environment,
  cmd: string,
  arg: string
): Generator<Object, void, any> {
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  switch (cmd) {
  case '149': // https://xkcd.com/149/
    yield call(speak, arg === 'sudo' ? 'Okay' : 'Make it yourself', 'idle');
    break;
  default:
    invariant(false);
  }
}

