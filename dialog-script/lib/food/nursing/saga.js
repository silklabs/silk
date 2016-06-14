/**
 * @flow
 */

import createLog from 'silk-log';
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

function* queryAlert(
  environment: Environment,
): Generator<Object, ?boolean, any> {            // eslint-disable-line no-undef
  const {micChannel, speak} = environment;

  let useTimer: ?boolean = null;

  for (let retryCount = 0; retryCount <= 2; retryCount++) {
    const intro = retryCount ? `Sorry, I didn't get that. ` : ``;
    const query =
      `Would you like me to tell you when it's time to switch sides?`;

    yield call(speak, intro + query, false);

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

function* nursing(
  environment: Environment,
  alert: boolean,
  timePerSideSec: number,
): Generator<Object, boolean, any> {             // eslint-disable-line no-undef
  const {speak} = environment;

  let timeRemainingSec = timePerSideSec;

  yield put(switchSides());
  yield put(updateTimeRemaining(timeRemainingSec));

  while (timeRemainingSec) {
    yield delay(1000);
    timeRemainingSec--;
    yield put(updateTimeRemaining(timeRemainingSec));
  }

  timeRemainingSec = timePerSideSec;

  yield put(switchSides());
  yield put(updateTimeRemaining(timeRemainingSec));

  if (alert) {
    yield speak(`${timePerSideSec} seconds have passed. It's now time to ` +
                `switch to the other side.`,
                true);
  }

  while (timeRemainingSec) {
    yield delay(1000);
    timeRemainingSec--;
    yield put(updateTimeRemaining(timeRemainingSec));
  }

  if (alert) {
    yield call(speak,
               `${timePerSideSec} seconds have passed. You're all finished.`,
               true);
  } else {
    yield call(speak, `Nursing entry recorded.`, true);
  }

  return true;
}

function* listenForCancel(
  environment: Environment,
): Generator<Object, boolean, any> {             // eslint-disable-line no-undef
  const {micChannel} = environment;
  for (;;) {
    const event = yield take(micChannel);
    invariant(event);

    if (event.intent === `cancel`) {
      return true;
    }
  }
  // Should never get here but this makes Flow happy.
  return true;
}

export default function*(
  environment: Environment,
): Generator<Object, void, any> {                // eslint-disable-line no-undef
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  log.info(`Starting saga`);

  const state = yield select((state) => state.food.nursing);
  invariant(state);

  yield call(speak,
             `Based on your previous session, you should start nursing on ` +
             `the ${state.side} side.`,
             false);

  const alert = yield call(queryAlert, environment);
  if (alert) {
    yield call(speak,
               `OK, setting the alert for ${state.timePerSideSec} seconds.`,
               true);
  } else if (alert === null) {
    yield call(speak,
               `Sorry, I'm not understanding. I won't set a timer.`,
               true);
  } else {
    yield call(speak, `OK, I won't remind you when to switch sides.`, true);
  }

  const winner = yield race({
    nursing: call(nursing, environment, alert, state.timePerSideSec),
    cancel: call(listenForCancel, environment),
  });
  invariant(winner);

  if (winner.cancel) {
    log.warn(`Canceled`);
    yield put(updateTimeRemaining(0));
  }
}
