/**
 * @no-flow
 */

import createLog from 'silk-log';
import {call, put, take} from 'redux-saga/effects';
import invariant from 'assert';

import {resetFood} from './actions';
import startBottleFeeding from './bottle/saga';
import startNursing from './nursing/saga';
import type {Environment} from '../environment';

const log = createLog(`dialog-script-food-saga`);

export default function* (
  environment: Environment,
  type: ?('nursing' | 'bottle'),
): Generator<any, any, any> {                    // eslint-disable-line no-undef
  invariant(environment);

  const {intentChannel, speak} = environment;
  invariant(intentChannel);
  invariant(speak);

  log.info(`Starting saga`, type);

  yield put(resetFood());

  if (!type) {
    for (let retryCount = 0; retryCount <= 2; retryCount++) {
      const intro = retryCount ? `Sorry, I didn't get that. ` : `Ok, `;
      const query = `Are you nursing or bottle feeding?`;

      yield call(speak, intro + query, false);

      const {intent, entities} = yield take(intentChannel);
      if ((intent === `startNursing`) ||
          (intent === `none` && entities.some((e) => e === `nursing`))) {
        type = 'nursing';
        break;
      }
      if (intent === `confirm` &&
          entities.some((e) => e === `bottle` || e === `formula`)) {
        type = `bottle`;
        break;
      }
    }
  }

  switch (type) {
  case `bottle`:
    yield call(startBottleFeeding, environment);
    break;
  case `nursing`:
    yield call(startNursing, environment);
    break;
  default:
    yield call(speak,
               `Sorry, I'm having trouble. Please try again later.`,
               true);
  }
}
