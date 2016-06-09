/**
 * @no-flow
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

import type {State} from './reducers';
import type {SagaArgs} from '../../saga';

const log = createLog(`dialog-fuhu-food-nursing-saga`);

function* queryAlert(sagaArgs: SagaArgs): Generator<any, any, any> { // eslint-disable-line no-undef
  const {intentChannel, speak} = sagaArgs;

  let useTimer: ?boolean = null;

  for (let retryCount = 0; retryCount <= 2; retryCount++) {
    const intro = retryCount ? `Sorry, I didn't get that. ` : ``;
    const query =
      `Would you like me to tell you when it's time to switch sides?`;

    yield call(speak, intro + query, false);

    const {intent} = yield take(intentChannel);
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
  sagaArgs: SagaArgs,
  alert: boolean,
  timePerSideSec: number,
): Generator<any, any, any> {                    // eslint-disable-line no-undef
  const {speak} = sagaArgs;

  let timeRemainingSec = timePerSideSec;
  yield [
    put(switchSides()),
    put(updateTimeRemaining(timeRemainingSec)),
  ];

  while (timeRemainingSec) {
    yield delay(1000);
    timeRemainingSec--;
    yield put(updateTimeRemaining(timeRemainingSec));
  }

  timeRemainingSec = timePerSideSec;

  const tasks = [
    put(switchSides()),
    put(updateTimeRemaining(timeRemainingSec)),
  ];

  if (alert) {
    tasks.push(speak(`${timePerSideSec} seconds have passed. It's now time ` +
                     `to switch to the other side.`,
                     true));
  }

  yield tasks;

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

function* listenForCancel(sagaArgs: SagaArgs): Generator<any, any, any> { // eslint-disable-line no-undef
  const {intentChannel} = sagaArgs;
  for (;;) {
    const {intent} = yield take(intentChannel);
    if (intent === `cancel`) {
      return true;
    }
  }
}

export default function* (sagaArgs: SagaArgs): Generator<any, any, any> { // eslint-disable-line no-undef
  invariant(sagaArgs);

  const {intentChannel, speak} = sagaArgs;
  invariant(intentChannel);
  invariant(speak);

  log.info(`Starting saga`);

  const state: State = yield select((state) => state.food.nursing);

  yield call(speak,
             `Based on your previous session, you should start nursing on ` +
             `the ${state.side} side.`,
             true);

  const alert = yield call(queryAlert, sagaArgs);
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
    nursing: call(nursing, sagaArgs, alert, state.timePerSideSec),
    cancel: call(listenForCancel, sagaArgs),
  });

  if (winner.cancel) {
    log.warn(`Canceled`);
    yield put(updateTimeRemaining(0));
  }
}
