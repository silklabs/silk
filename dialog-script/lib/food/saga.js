/**
 * @flow
 */

import createLog from 'silk-log';
import {call, put, take} from 'redux-saga/effects';
import invariant from 'assert';

import {resetFood} from './actions';
import startBottleFeeding from './bottle/saga';
import startNursing from './nursing/saga';
import type {Environment} from '../environment';

const log = createLog(`dialog-script-food-saga`);

/**
 * This is a very simple saga that asks a question (with retries if something
 * goes wrong) before calling more specialized sagas. The division of sagas is
 * entirely arbitrary; |startBottleFeeding| and |startNursing| could be moved
 * into this saga if desired.
 */
export default function*(
  environment: Environment,
  type: ?('nursing' | 'bottle'),
): Generator<Object, void, any> {
  // Extract the things we need from the environment.
  const {micChannel, speak} = environment;

  log.info(`Starting saga`, type);

  /**
   * The |put| effect modifies the data store. In this case we are resetting
   * any previously stored stated surrounding food (probably not desirable once
   * we start storing feeding history!).
   */
  yield put(resetFood());

  /**
   * The type passed in could be 'nursing', 'bottle', or |null| (indicated by
   * the |?| Flow annotation) to signify that we need to query the feeding type
   * before proceeding.
   */
  if (!type) {
    for (let retryCount = 0; retryCount <= 2; retryCount++) {
      const intro = retryCount ? `Sorry, I didn't get that. ` : `Ok, `;
      const query = `Are you nursing or bottle feeding?`;

      /**
       * |call| will simply call the function specified (though in a manner that
       * is easy to test).
       */
      yield call(speak, intro + query, `waiting`);

      /**
       * |take| will let us sleep until the user has responded (and an event
       * will then get placed onto the |micChannel|, waking us up).
       */
      const event = yield take(micChannel);
      invariant(event);

      const {intent, entities} = event;

      if ((intent === `startNursing`) ||
          (intent === `None` && entities.some((e) => e === `nursing`))) {
        type = 'nursing';
        break;
      }
      if (intent === `None` &&
          entities.some((e) => e === `bottle` || e === `formula`)) {
        type = 'bottle';
        break;
      }
    }
  }

  /**
   * Either we now know the correct feeding type or we have retried too many
   * times and must now give up. We either call more specialized sagas or
   * return without doing anything further.
   */
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
               `idle`);
  }
}
