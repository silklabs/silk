/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @no-flow
 */

import createLog from 'silk-log';
import {call, put, take} from 'redux-saga/effects';
import invariant from 'assert';

import type {SagaArgs} from '../../saga';

import {
  bottleType,
  bottleAmount,
} from './actions';

const log = createLog(`dialog-fuhu-food-bottle-saga`);

function* queryBottleType(sagaArgs: SagaArgs): Generator<any, any, any> { // eslint-disable-line no-undef
  const {intentChannel, speak} = sagaArgs;

  let type: ?string = null;

  for (let retryCount = 0; retryCount <= 2; retryCount++) {
    const intro = retryCount ? `Sorry, I didn't get that. ` : `Ok, `;
    const query = `Are you using breast milk or formula?`;

    yield call(speak, intro + query, false);

    const {intent, entities} = yield take(intentChannel);
    if (intent === `confirm`) {
      for (const entity of entities) {
        if (entity === `breast milk`) {
          type = `milk`;
          break;
        }
        if (entity === `formula`) {
          type = `formula`;
          break;
        }
      }
    }

    if (type) {
      break;
    }
  }

  if (!type) {
    yield call(speak,
               `Sorry, I'm having trouble. Please try again later.`,
               true);
  }

  return type;
}

function* queryAmount(sagaArgs: SagaArgs): Generator<any, any, any> { // eslint-disable-line no-undef
  const {intentChannel, speak} = sagaArgs;

  let amount: ?number = null;

  for (let retryCount = 0; retryCount <= 2; retryCount++) {
    const intro = retryCount ? `Sorry, I didn't get that. ` : ``;
    const query = `How many milliliters?`;

    yield call(speak, intro + query, false);

    const {intent, entities} = yield take(intentChannel);
    if (intent === `confirm`) {
      for (const entity of entities) {
        const tokens = entity.split(` `);
        const num = parseInt(tokens[0]);
        if (!isNaN(num)) {
          amount = num;
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
               true);
  }

  return amount;
}

export default function* (sagaArgs: SagaArgs): Generator<any, any, any> { // eslint-disable-line no-undef
  invariant(sagaArgs);

  const {intentChannel, speak} = sagaArgs;
  invariant(intentChannel);
  invariant(speak);

  log.info(`Starting saga`);

  const type = yield call(queryBottleType, sagaArgs);
  if (!type) {
    return;
  }

  const amount = yield call(queryAmount, sagaArgs);
  if (!amount) {
    return;
  }

  yield put(bottleType(type));
  yield put(bottleAmount(amount));
  yield call(speak, `Ok, I'll record that.`, true);
}
