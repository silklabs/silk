/**
 * @flow
 */

import createLog from 'silk-log/device';
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
import type {Entity, Entities} from 'silk-dialog-engine';

type WakeConditions = {
  modify: Object,
  expire?: Object,
};

const log = createLog(`dialog-script-timers-saga`);

// Slice the timers array.
export function getTimers(state: Object): Array<TimerState> {
  return state.timers.timers.slice();
}

// Sort timers based on their expiration time.
export function sortTimers(a: TimerState, b: TimerState): number {
  return (a.expiresMs < b.expiresMs) ?
           -1 :
           (a.expiresMs > b.expiresMs) ?
             1 :
             0;
}

export function timerEntityToMs(entity: Entity): ?number {
  // `duration` encoding for builtin.datetime.duration
  //   PT1H     - 1 hour
  //   PT1M     - 1 minute
  //   PT1H30M  - 1 hour 30 min
  //   PT100S   - 100 seconds
  //   PT10M10S - 10 minute 10 seconds

  // Not supported for timers
  //   P1D - 1 day
  //   P1W - 1 week
  //   P1M - 1 month
  //   P1Y - 1 year

  if (entity.type !== 'builtin.datetime.duration' ||
      entity.resolution === undefined ||
      entity.resolution.duration === undefined ||
      entity.resolution.duration.substr(0, 2) !== 'PT') {
    return null;
  }

  let duration = entity.resolution.duration.substr(2);
  let durationMs = 0;
  let match;
  while (match = duration.match(/^(\d+)([SMH])/)) { // eslint-disable-line no-cond-assign
    log.debug(`duration: ${match[1]} ${match[2]}`);
    switch (match[2]) {
    case 'S':
      durationMs += match[1] * 1000;
      break;
    case 'M':
      durationMs += match[1] * 1000 * 60;
      break;
    case 'H':
      durationMs += match[1] * 1000 * 60 * 60;
      break;
    default:
      return null;
    }
    duration = duration.substring(match[0].length);
  }
  return (durationMs === 0 ? null : durationMs);
}

/**
 * This saga runs in the background for the lifetime of the app. It figures out
 * when the next timer will expire and goes to sleep until either that timer has
 * expired or the list of timer has changed via the |TYPE_ADD| and |TYPE_REMOVE|
 * actions.
 */
export function* timerMonitorSaga(
  environment: Environment,
): Generator<Object, void, any> {
  try {
    log.debug(`Starting timer monitor task`);

    const {dialogEngine, speak} = environment;
    invariant(speak);

    let now = Date.now();

    /**
     * When we first start up grab all the existing timers that were previously
     * running.
     */
    let timers = yield select(getTimers);
    invariant(timers);
    invariant(Array.isArray(timers));

    // The timers are not guaranteed to be in any order yet.
    timers.sort(sortTimers);

    log.debug(`Initial timers`, timers);

    // Remove timers that expired in the past.
    let index = 0;
    for ( ; index < timers.length; index++) {
      const timer = timers[index];
      if (timer.expiresMs < now) {
        yield put(removeTimer(timer.id));
      } else {
        break;
      }
    }

    if (index) {
      timers.splice(0, index);
    }

    log.debug(`Timers after culling`, timers);

    /**
     * This is the infinite loop that we'll stay in for the duration of the
     * app lifetime. We first calculate our next wake up time based on the
     * timers state. Then we wait on three possible conditions before looping
     * and sleeping again:
     *
     *   1. The next timer has expired, so we should alert the user.
     *   2. The user has added a new timer.
     *   3. The user has removed a timer.
     */
    while (true) {                  // eslint-disable-line no-constant-condition
      /**
       * This is an object that contains the conditions that we will |race| on.
       * We always want to wake for modifications to the timer array, but we may
       * not always have an active timer so we have to dynamically add the
       * |expire| property later if needed.
       */
      const wakeConditions: WakeConditions = {
        modify: take([TYPE_ADD, TYPE_REMOVE]),
      };

      // Reload the list of timers.
      timers = yield select(getTimers);
      invariant(Array.isArray(timers));

      // Make sure they are sorted.
      timers.sort(sortTimers);

      log.debug(`Recollected timers`, timers);

      /**
       * If there is an active timer then calculate the wake time and add the
       * |expire| property to the |wakeConditions| object.
       */
      if (timers.length) {
        const timer = timers[0];
        let sleepMs = Math.max(timer.expiresMs - Date.now(), 0);
        log.debug(`Sleeping for ${sleepMs}ms until timer ${timer.id} expires`);
        wakeConditions.expire = call(delay, sleepMs);
      } else {
        log.debug(`No outstanding timers`);
      }

      // Sleep until one of our wake conditions has been satisfied.
      const wakeResults = yield race(wakeConditions);
      invariant(wakeResults);

      /**
       * If the timer list was modified then we simply need to loop and
       * recalculate our sleep time.
       */
      if (!wakeResults.expire) {
        invariant(wakeResults.modify);
        log.debug(`Woke up for modified timers`);
        continue;
      }

      // We must have woken up because a timer expired.
      const timer = timers[0];
      log.debug(`Timer expired`, timer);

      // Take this timer out of the list via |put|.
      yield put(expireTimer(timer.id));

      if (dialogEngine.uiMode === 'normal') {
        // Alert the user.
        yield call(speak, `Timer ${timer.id} has expired`, 'idle');
      }
    }
  } finally {
    log.debug(`Timer monitor task exiting`);
  }
}

/**
 * This saga allows the user to start and stop timers. It does not interact with
 * |timerMonitorSaga| directly. Instead this saga merely updates the data store
 * via |put| and then |timerMonitorSaga| wakes up when it sees that state
 * change.
 */
export default function* modifyTimers(
  environment: Environment,
  type: 'start' | 'cancel',
  entities: Entities
): Generator<Object, void, any> {
  const {speak} = environment;

  // Attempt to understand the amount of time the user gave us.
  let durationMs: ?number = null;
  for (let entity of entities) {
    durationMs = timerEntityToMs(entity);
    if (durationMs !== null) {
      break;
    }
  }

  if (durationMs === null) {
    yield call(speak, `Sorry, I'm not understanding your timer request`, `idle`);
    return;
  }

  invariant(typeof durationMs === 'number');

  // Add a new timer via |put|.
  if (type === `start`) {
    log.info(`Adding timer for ${durationMs / 1000} seconds`);
    yield put(addTimer(durationMs, Date.now() + durationMs));
    yield call(speak, `Ok, I've started a timer`, `idle`);
    return;
  }

  invariant(type === `cancel`);
  const timers = yield select(getTimers);
  invariant(timers);

  if (!timers.length) {
    yield call(speak, `There are no timers running`, `idle`);
    return;
  }

  // Remove an existing timer via |put|.
  for (let timer of timers) {
    // TODO Something smarter here.
    if (timer.durationMs === durationMs) {
      yield put(removeTimer(timer.id));
      yield call(speak, `Ok, I've canceled that timer`, `idle`);
      return;
    }
  }

  yield call(speak, `Sorry, I couldn't figure out which timer to cancel`, `idle`);
}
