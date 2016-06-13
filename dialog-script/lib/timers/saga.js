/**
 * @flow
 */

import createLog from 'silk-log';
import {delay} from 'redux-saga';
import {call, put, race, select, take} from 'redux-saga/effects';
import invariant from 'assert';

import {
  addTimer,
  expireTimer,
  removeTimer,
  TYPE_ADD,
  TYPE_REMOVE,
} from './actions';

import type {TimerState} from './reducers';
import type {Environment} from '../environment';

type WakeConditions = {
  modify: Object,
  expire?: Object,
};

const log = createLog(`dialog-script-timers-saga`);

export function getTimers(state: Object): Array<TimerState> {
  return state.timers.timers.slice();
}

export function sortTimers(a: TimerState, b: TimerState): number {
  return (a.expiresMs < b.expiresMs) ?
           -1 :
           (a.expiresMs > b.expiresMs) ?
             1 :
             0;
}

export function timerEntityToMs(entities: string): ?number {
  const tokens = entities.split(` `);
  if (!tokens.length) {
    return null;
  }

  let [value, unit] = tokens;
  value = parseInt(value);
  if (isNaN(value)) {
    return null;
  }

  switch (unit) {
  case `second`:
  case `seconds`:
    return value * 1000;
  case `minute`:
  case `minutes`:
    return value * 1000 * 60;
  case `hour`:
  case `hours`:
    return value * 1000 * 60 * 60;
  case `day`:
  case `days`:
    return value * 1000 * 60 * 60 * 24;
  default:
    return null;
  }
}

export function* timerMonitorTask(
  environment: Environment,
): Generator<Object, void, any> {                // eslint-disable-line no-undef
  try {
    log.debug(`Starting timer monitor task`);

    const {intentChannel, speak} = environment;
    invariant(intentChannel);
    invariant(speak);

    let now = Date.now();

    let timers = yield select(getTimers);
    invariant(timers);
    invariant(Array.isArray(timers));

    timers.sort(sortTimers);

    log.debug(`Initial timers`, timers);

    // Remove timers that expired in the past.
    let index = 0;
    for ( ; index < timers.length; index++) {
      const timer = timers[index];
      if (timer.expiresMs < now) {
        yield call(removeTimer, timer.id);
      } else {
        break;
      }
    }

    if (index) {
      timers.splice(0, index);
    }

    log.debug(`Timers after culling`, timers);

    while (true) {                  // eslint-disable-line no-constant-condition
      const wakeConditions: WakeConditions = {
        modify: take([TYPE_ADD, TYPE_REMOVE]),
      };

      timers = yield select(getTimers);
      invariant(timers);
      invariant(Array.isArray(timers));

      timers.sort(sortTimers);

      log.debug(`Recollected timers`, timers);

      if (timers.length) {
        const timer = timers[0];
        let sleepMs = Math.max(timer.expiresMs - Date.now(), 0);
        log.debug(`Sleeping for ${sleepMs}ms until timer ${timer.id} expires`);
        wakeConditions.expire = call(delay, sleepMs);
      } else {
        log.debug(`No outstanding timers`);
      }

      const wakeResults = yield race(wakeConditions);
      invariant(wakeResults);

      if (!wakeResults.expire) {
        invariant(wakeResults.modify);
        log.debug(`Woke up for modified timers`);
        // Don't need to do anything here, just loop and recalculate delay.
        continue;
      }

      const timer = timers[0];
      log.debug(`Timer expired`, timer);

      yield put(expireTimer(timer.id));
      yield call(speak, `Timer ${timer.id} has expired`, true);
    }
  } finally {
    log.debug(`Timer monitor task exiting`);
  }
}

export function* modifyTimers(
  environment: Environment,
  type: 'start' | 'cancel',
  entities: Array<string>
): Generator<Object, void, any> {                // eslint-disable-line no-undef
  const {speak} = environment;

  let durationMs: ?number = null;
  for (let entity of entities) {
    durationMs = timerEntityToMs(entity);
    if (durationMs !== null) {
      break;
    }
  }

  if (durationMs === null) {
    yield call(speak, `Sorry, I didn't understand your request`, true);
    return;
  }

  invariant(typeof durationMs === 'number');

  if (type === `start`) {
    yield put(addTimer(durationMs, Date.now() + durationMs));
    yield call(speak, `Ok, I've started a timer`, true);
    return;
  }

  invariant(type === `cancel`);
  const timers = yield select(getTimers);
  invariant(timers);

  if (!timers.length) {
    yield call(speak, `There are no timers running`, true);
    return;
  }

  // TODO Something smarter here.
  for (let timer of timers) {
    if (timer.durationMs === durationMs) {
      yield put(removeTimer(timer.id));
      yield call(speak, `Ok, I've canceled that timer`, timer);
      return;
    }
  }

  yield call(speak, `Sorry, I couldn't figure out which timer to cancel`, true);
}
