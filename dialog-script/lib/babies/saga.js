/**
 * @no-flow
 */

import createLog from 'silk-log';
import {call, put, select, take} from 'redux-saga/effects';
import invariant from 'assert';

import {
  addBaby,
  renameBaby,
} from './actions';
import type {Environment} from '../environment';

const log = createLog(`dialog-script-babies-saga`);

export const getNextBabyId = (state) => state.nextBabyId;
export const getBabies = (state) => state.babies.slice();

export function* queryBabyName(
  environment: Environment,
  customQuery?: string,
): Generator<any, any, any> {                     // eslint-disable-line no-undef
  const {textChannel, intentChannel, speak} = environment;
  const query = customQuery || `What is the baby's name?`;

  let name = ``;

  for (let retryCount = 0; retryCount <= 2; retryCount++) {
    const intro = retryCount ? `Sorry, I'll try again. ` : ``;

    yield call(speak, intro + query, false);
    const text = yield take(textChannel);
    if (!text) {
      continue;
    }

    yield call(speak, `I heard ${text}. Is that correct?`, false);
    const {intent} = yield take(intentChannel);

    if (intent === `confirm`) {
      name = text;
      break;
    }
  }

  if (!name) {
    yield call(speak,
               `Sorry I'm having trouble. Please try again later.`,
               true);
  }

  return name;
}

export function* add(environment: Environment): Generator<any, any, any> { // eslint-disable-line no-undef
  const {speak} = environment;

  const name = yield call(queryBabyName, environment);
  if (!name) {
    return;
  }

  const id = yield select(getNextBabyId);
  yield put(addBaby(id, name));

  yield call(speak, `Ok, ${name} is now registered`, true);
}

export function* rename(environment: Environment): Generator<any, any, any> { // eslint-disable-line no-undef
  const {speak} = environment;

  const babies = yield select(getBabies);
  if (!babies.length) {
    yield call(speak, `You haven't registered any babies yet.`, true);
    return;
  }

  let name = ``;
  let id: ?string = null;

  if (babies.length === 1) {
    name = yield call(queryBabyName, environment);
    id = babies[0].id;
  } else {
    for (let retryCount = 0; retryCount <= 2; retryCount++) {
      if (retryCount) {
        yield call(speak,
                   `Sorry, I don't have any baby registered with that name.`,
                   true);
      }

      const oldName = yield call(queryBabyName,
                                 environment,
                                 `What is the name you told me previously?`);
      if (!oldName) {
        return;
      }

      for (let baby of babies) {
        if (baby.name.toLowerCase() === oldName) {
          id = baby.id;
          break;
        }
      }

      if (id !== null) {
        break;
      }
    }

    if (id === null) {
      yield call(speak,
                 `Sorry I'm having trouble. Please try again later.`,
                 true);
      return;
    }

    name = yield call(queryBabyName, environment);
  }

  if (!name) {
    return;
  }
  invariant(id !== null);

  yield put(renameBaby(id, name));
  yield call(speak, `Ok, I've changed the baby's name to ${name}.`, true);
}

export default function* (
  environment: Environment,
  type: 'add' | 'rename',
): Generator<any, any, any> {                    // eslint-disable-line no-undef
  invariant(environment);

  const {intentChannel, speak} = environment;
  invariant(intentChannel);
  invariant(speak);

  log.info(`Starting saga`, type);

  switch (type) {
  case `add`:
    yield call(add, environment);
    break;
  case `rename`:
    yield call(rename, environment);
    break;
  default:
    throw new Error(`Unknown type '${type}'`);
  }
}
