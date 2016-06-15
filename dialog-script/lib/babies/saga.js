/**
 * @flow
 */

import createLog from 'silk-log';
import {call, put, select, take} from 'redux-saga/effects';
import invariant from 'assert';
import * as uuid from 'uuid';

import {
  addBaby,
  renameBaby,
} from './actions';
import type {Environment} from '../environment';

const log = createLog(`dialog-script-babies-saga`);

export const getBabies: ((state: Object) => Object) =
  (state) => state.babies.slice();

/**
 * This is a helper function that queries for a baby name, speaks the name back
 * to ensure that we heard it correctly, and then retries if a mistake was made.
 */
export function* queryBabyName(
  environment: Environment,
  customQuery?: string,
): Generator<Object, string, any> {              // eslint-disable-line no-undef
  const {micChannel, speak} = environment;
  const query = customQuery || `What is the baby's name?`;

  let name = ``;

  for (let retryCount = 0; retryCount <= 2; retryCount++) {
    const intro = retryCount ? `Sorry, I'll try again. ` : ``;

    yield call(speak, intro + query, false);

    let event = yield take(micChannel);
    invariant(event);

    const {text} = event;
    if (!text) {
      continue;
    }

    yield call(speak, `I heard ${text}. Is that correct?`, false);

    event = yield take(micChannel);
    invariant(event);

    if (event.intent === `confirm`) {
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

// This saga adds a new baby to our data store after asking its name.
export function* add(
  environment: Environment,
): Generator<Object, void, any> {                // eslint-disable-line no-undef
  const {speak} = environment;

  const name = yield call(queryBabyName, environment);
  if (!name) {
    return;
  }

  const id = yield call(uuid.v4);
  invariant(id);

  // |put| will actually update the data store.
  yield put(addBaby(id, name));

  yield call(speak, `Ok, ${name} is now registered`, true);
}

/**
 * This saga is rather contrived (how often do we expect that babies need to be
 * renamed?) but shows how to make saga decisions based on the current state.
 * We have to match a spoken name with one of the babies in the data store. If
 * there is only one baby we can skip that step, but if there is more than one
 * baby we have to do extra work.
 */
export function* rename(
  environment: Environment,
): Generator<Object, void, any> {                // eslint-disable-line no-undef
  const {speak} = environment;

  // First |select| to find all the current babies we know about.
  const babies = yield select(getBabies);
  invariant(Array.isArray(babies));

  // Now we can change our actions based on this information.
  if (!babies.length) {
    yield call(speak, `You haven't registered any babies yet.`, true);
    return;
  }

  let name = ``;
  let id = ``;

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

      if (id) {
        break;
      }
    }

    if (!id) {
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

  // Update the data store by using |put|.
  yield put(renameBaby(id, name));
  yield call(speak, `Ok, I've changed the baby's name to ${name}.`, true);
}

/**
 * This saga simply |call|'s one of the other sagas above based on the value of
 * the |type| argument.
 */
export default function* (
  environment: Environment,
  type: 'add' | 'rename',
): Generator<Object, void, any> {                // eslint-disable-line no-undef
  invariant(environment);

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
