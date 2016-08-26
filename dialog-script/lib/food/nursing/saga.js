/**
 * @flow
 */

import createLog from 'silk-log/device';
import {delay} from 'redux-saga';
import {
  call,
  put,
  race,
  select,
  take,
} from 'redux-saga/effects';
import invariant from 'assert';

import {
  switchSides,
  updateTimeRemaining,
} from './actions';

import type {Environment} from '../../environment';

const log = createLog(`dialog-script-food-nursing-saga`);

const getNursing = (state) => Object.assign({}, state.food.nursing);

/**
 * This is a helper function that asks the user if they would like to be alerted
 * when the timer expire. It will retry if it can't understand the intent.
 */
function* queryAlert(
  environment: Environment,
): Generator<Object, ?boolean, any> {
  const {micChannel, speak} = environment;

  let useTimer: ?boolean = null;

  for (let retryCount = 0; retryCount <= 2; retryCount++) {
    const intro = retryCount ? `Sorry, I didn't get that. ` : ``;
    const query =
      `Would you like me to tell you when it's time to switch sides?`;

    yield call(speak, intro + query, `waiting`);

    const event = yield take(micChannel);
    invariant(event);

    const {intent} = event;

    if (intent === `confirm`) {
      useTimer = true;
      break;
    }
    if (intent === `reject`) {
      useTimer = false;
      break;
    }
  }

  return useTimer;
}

/**
 * This saga runs as part of a |race|, see below.
 */
function* nursing(
  environment: Environment,
  alert: boolean,
  timePerSideSec: number,
): Generator<Object, boolean, any> {
  const {speak} = environment;

  let timeRemainingSec = timePerSideSec;

  // |put| these actions to modify our state.
  yield put(switchSides());
  yield put(updateTimeRemaining(timeRemainingSec));

  while (timeRemainingSec) {
    /**
     * |delay| puts the saga to sleep for the requested number of milliseconds.
     * During this time the saga will not respond to any other events (unless
     * the saga is being run as part of a |race|, as is the case here). See
     * below.
     *
     * Here we aren't waiting for the full amount of time but instead are waking
     * up once per second to update the remaining time in our state.
     */
    yield delay(1000);
    timeRemainingSec--;
    yield put(updateTimeRemaining(timeRemainingSec));
  }

  // The first side is complete. Update state and start on the second side.
  timeRemainingSec = timePerSideSec;

  // |put| these actions to modify our state.
  yield put(switchSides());
  yield put(updateTimeRemaining(timeRemainingSec));

  // If the user requested an alert then we should issue one now.
  if (alert) {
    yield speak(`${timePerSideSec} seconds have passed. It's now time to ` +
                `switch to the other side.`);
  }

  while (timeRemainingSec) {
    // See similar loop above.
    yield delay(1000);
    timeRemainingSec--;
    yield put(updateTimeRemaining(timeRemainingSec));
  }

  if (alert) {
    yield call(speak,
               `${timePerSideSec} seconds have passed. You're all finished.`,
               `idle`);
  } else {
    // TODO Actually send some data to the network.
    yield call(speak, `Nursing entry recorded.`, `idle`);
  }

  return true;
}

/**
 * This saga runs "forever" as part of a |race|. See below.
 */
function* listenForCancel(
  environment: Environment,
): Generator<Object, boolean, any> {
  const {micChannel} = environment;

  /**
   * Inspect every event in the |micChannel|. If the user wishes to cancel then
   * exit the loop. Otherwise start over.
   */
  while (true) {                    // eslint-disable-line no-constant-condition
    const event = yield take(micChannel);
    invariant(event);

    if (event.intent === `cancel`) {
      return true;
    }
  }

  // Should never get here but this makes Flow happy.
  // eslint-disable-next-line no-unreachable
  return true;
}

/**
 * This saga asks a preliminary question and then launches a |race| between the
 * |nursing| and |listenForCancel| sagas. Both run at the same time and we are
 * able to know which finished first.
 */
export default function*(
  environment: Environment,
): Generator<Object, void, any> {
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  log.info(`Starting saga`);

  /**
   * |select| reads state from our store and returns a copy of whatever we ask
   * for based on the "selector" function we pass. Here we want to see several
   * pieces of data.
   */
  const state = yield select(getNursing);
  invariant(state);

  yield call(speak,
             `Based on your previous session, you should start nursing on ` +
             `the ${state.side} side.`);

  const alert = yield call(queryAlert, environment);
  if (alert) {
    yield call(speak,
               `OK, setting the alert for ${state.timePerSideSec} seconds.`,
               `idle`);
  } else if (alert === null) {
    yield call(speak,
               `Sorry, I'm not understanding. I won't set a timer.`,
               `idle`);
  } else {
    yield call(speak, `OK, I won't remind you when to switch sides.`, `idle`);
  }

  /**
   * Start the |race| between |nursing| and |listenForCancel|. This saga will
   * sleep until one of them finishes.
   */
  const winner = yield race({
    nursing: call(nursing, environment, alert, state.timePerSideSec),
    cancel: call(listenForCancel, environment),
  });
  invariant(winner);

  // If we were canceled be sure to clean up this temporary state.
  if (winner.cancel) {
    log.warn(`Canceled`);
    yield put(updateTimeRemaining(0));
    yield call(speak, `Nursing session canceled.`, `idle`);
  }
}
