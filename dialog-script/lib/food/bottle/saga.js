/**
 * @flow
 */

import createLog from 'silk-log/device';
import {call, put, take} from 'redux-saga/effects';
import invariant from 'assert';

import type {Environment} from '../../environment';

import {
  bottleType,
  bottleAmount,
} from './actions';

const log = createLog(`dialog-script-food-bottle-saga`);

// This saga asks for the bottle type and handles retries.
function* queryBottleType(
  environment: Environment,
): Generator<Object, ?string, any> {
  const {micChannel, speak} = environment;

  let type: ?string = null;

  for (let retryCount = 0; retryCount <= 2; retryCount++) {
    const intro = retryCount ? `Sorry, I didn't get that. ` : `Ok, `;
    const query = `Are you using breast milk or formula?`;

    yield call(speak, intro + query, `waiting`);

    const event = yield take(micChannel);
    invariant(event);

    const {intent, entities} = event;

    if (intent === `None` && entities.length === 1) {
      let entity = entities[0].entity;
      if (entity === `breast milk`) {
        type = `milk`;
      } else if (entity === `formula`) {
        type = `formula`;
      }
    }

    if (type) {
      break;
    }
  }

  if (!type) {
    yield call(speak,
               `Sorry, I'm having trouble. Please try again later.`,
               `idle`);
  }

  return type;
}

// This saga asks for the amount of food handles retries.
function* queryAmount(
  environment: Environment,
): Generator<Object, ?number, any> {
  const {micChannel, speak} = environment;

  let amount: ?number = null;

  for (let retryCount = 0; retryCount <= 2; retryCount++) {
    const intro = retryCount ? `Sorry, I didn't get that. ` : ``;
    const query = `How many milliliters?`;

    yield call(speak, intro + query, `waiting`);

    const event = yield take(micChannel);
    invariant(event);

    const {intent, entities} = event;

    if (intent === `None`) {
      for (const entity of entities) {
        if ((entity.type === 'builtin.number') && entity.entity && !isNaN(entity.entity)) {
          amount = parseInt(entity.entity);
          log.debug(`amount: ${amount}`);
          break;
        }
      }
    }

    if (amount) {
      break;
    }
  }

  if (!amount) {
    yield call(speak,
               `Sorry, I'm having trouble. Please try again later.`,
               `idle`);
  }

  return amount;
}

// This saga simply asks two questions and then updates our data store.
export default function*(
  environment: Environment
): Generator<Object, void, any> {
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  log.info(`Starting saga`);

  const type = yield call(queryBottleType, environment);
  if (!type) {
    return;
  }

  const amount = yield call(queryAmount, environment);
  if (!amount) {
    return;
  }

  yield put(bottleType(type));
  yield put(bottleAmount(amount));
  yield call(speak, `Ok, I'll record that.`, `idle`);
}
