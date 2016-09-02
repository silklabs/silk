/**
 * @flow
 */

import createLog from 'silk-log/device';
import {delay} from 'redux-saga';
import {call, put, race, select, take} from 'redux-saga/effects';
import invariant from 'assert';
import moment from 'moment';
import {parseIso8601, getDateTime} from '../utils';
import path from 'path';
import Player from 'silk-audioplayer';
import humanizeDuration from 'humanize-duration';

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
const ALARM_TONE = path.join(__dirname, '../media', 'funny_alarm.mp3');
const MAX_INT32 = 0x7FFFFFFF;
const player = new Player();

const dialogStartListener: (() => void) = () => {
  player.pause();
};

const dialogEndListener: (() => void) = () => {
  player.resume();
};

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

export function durationEntityToMs(entity: ?Entity): ?number {
  if (!entity) {
    return null;
  }
  let duration = moment.duration(entity.resolution.duration);
  let durationMs = duration.asMilliseconds();
  return (durationMs === 0 ? null : durationMs);
}

/**
 * Convert alarm date and time entities to unix timestamp.
 * In most cases LUIS returns the date in UTC timezone and time in
 * local timezone except where the time entity also has the date, in which case
 * the entire date-time string is in UTC timezone.
 *
 * @return {number} Absolute time at which timer is to expire
 */
function dateTimeEntitiesToMs(dateEntity: ?Entity,
    timeEntity: ?Entity): ?number {
  let expireAtMs = 0;

  if (!timeEntity) {
    return null;
  }

  // Time entity could have a resolution of type `duration` or `time`
  if ((timeEntity.resolution.resolution_type === 'builtin.datetime.duration') &&
      timeEntity.resolution.duration) {
    let duration = moment.duration(timeEntity.resolution.duration);
    expireAtMs = duration.asMilliseconds();
    log.debug(`Time string: ${timeEntity.resolution.duration}`);
  } else if ((timeEntity.resolution.resolution_type === 'builtin.datetime.time') &&
      timeEntity.resolution.time) {
    let time = timeEntity.resolution.time;
    let timeIso8601 = null;
    let useLocal = true; // Date is in UTC but time is in local timezone. Oh MSFT!

    // If time entity specifies the date then use the date from the time entity
    if (/^\d{4}-\d{2}-\d{2}/.exec(time)) {
      timeIso8601 = time;
      useLocal = false; // LUIS returns the entire date-time string in UTC
    } else if (dateEntity) {
      if ((dateEntity.resolution.resolution_type === 'builtin.datetime.date') &&
          dateEntity.resolution.date) {
        timeIso8601 = dateEntity.resolution.date + time;
      } else {
        log.warn(`${dateEntity.resolution.resolution_type} is not supported`);
      }
    } else { // Date entity not available
      // Assume that the user requested for an alarm for the same day
      timeIso8601 = moment.utc().format('YYYY-MM-DD') + time;
    }

    if (timeIso8601) {
      log.debug(`Time string: ${timeIso8601}`);
      let date = parseIso8601(timeIso8601, useLocal);
      expireAtMs = date ? date.getTime() : 0; // Convert to Unix timestamp
    }
  }
  return (expireAtMs === 0 ? null : expireAtMs);
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
        // Alert the user
        if (timer.type === 'alarm') {
          let [timeString] = getDateTime();
          try {
            dialogEngine.addListener(`dialog-start`, dialogStartListener);
            dialogEngine.addListener(`dialog-end`, dialogEndListener);
            yield call(() => player.play(ALARM_TONE));
            dialogEngine.removeListener(`dialog-start`, dialogStartListener);
            dialogEngine.removeListener(`dialog-end`, dialogEndListener);
          } catch (err) {
            log.error(`Failed to play alarm: `, err);
          }

          if (timer.title) {
            yield call(speak, `It is ${timeString}. You asked me to remind you to ${timer.title}`, 'idle');
          } else {
            yield call(speak, `It is ${timeString}. Alarm ${timer.id} has expired`, 'idle');
          }
        } else {
          yield call(speak, `Timer ${timer.id} has expired`, 'idle');
        }
      }
    }
  } finally {
    log.debug(`Timer monitor task exiting`);
  }
}

/**
 * Convert the duration into a human readable string
 */
function humanize(duration: number): string {
  return humanizeDuration(duration, {
    round: true,
    conjunction: ' and ',
    serialComma: false,
    units: ['d', 'h', 'm', 's'],
  });
}

type TimerEntities = {
  durationEntity: ?Entity;
  dateEntity: ?Entity;
  timeEntity: ?Entity;
  title: string;
};

function parseEntities(entities: Entities): TimerEntities {
  let durationEntity: ?Entity = null;
  let dateEntity: ?Entity = null;
  let timeEntity: ?Entity = null;
  let title: string = '';

  for (let entity of entities) {
    if ((entity.type === 'builtin.datetime.duration') &&
        entity.resolution && (entity.resolution.duration !== undefined)) {
      durationEntity = entity;
    } else if ((entity.type === 'builtin.alarm.start_date') &&
        (entity.resolution !== undefined)) {
      dateEntity = entity;
    } else if ((entity.type === 'builtin.alarm.start_time') &&
        (entity.resolution !== undefined)) {
      timeEntity = entity;
    } else if ((entity.type === 'builtin.alarm.title') &&
        (entity.entity !== undefined)) {
      title = entity.entity;
    }
  }
  return {durationEntity, dateEntity, timeEntity, title};
}

/**
 * This saga allows the user to start and stop timers. It does not interact with
 * |timerMonitorSaga| directly. Instead this saga merely updates the data store
 * via |put| and then |timerMonitorSaga| wakes up when it sees that state
 * change.
 */
export function* modifyTimers(
  environment: Environment,
  type: 'startTimer' | 'cancelTimer' | 'startAlarm' | 'cancelAlarm',
  entities: Entities
): Generator<Object, void, any> {
  const {speak} = environment;

  // Attempt to understand the amount of time the user gave us.
  let {durationEntity, dateEntity, timeEntity, title} = parseEntities(entities);

  let durationMs: ?number = null;
  if ((type === `startTimer`) || (type === `cancelTimer`)) {
    durationMs = durationEntityToMs(durationEntity);
  } else {
    durationMs = dateTimeEntitiesToMs(dateEntity, timeEntity);
  }

  // Add a new timer via |put|.
  if (type === `startTimer`) {
    if (durationMs === null) {
      yield call(speak, `Sorry, I'm not understanding your timer request`, `idle`);
      return;
    }

    invariant(typeof durationMs === 'number');
    log.info(`Adding timer for ${durationMs / 1000} seconds`);
    yield put(addTimer(durationMs, Date.now() + durationMs, title));
    yield call(speak, `Ok, I've started a timer for ${humanize(durationMs)}`, `idle`);
    return;
  }

  if (type === `startAlarm`) {
    if (durationMs === null) {
      yield call(speak, `Sorry, I'm not understanding your alarm request`, `idle`);
      return;
    }

    invariant(typeof durationMs === 'number');
    log.info(`Adding an alarm`);
    let durationStr;
    if (timeEntity &&
        (timeEntity.resolution.resolution_type === 'builtin.datetime.duration') &&
        timeEntity.resolution.duration) {
      if (durationMs > MAX_INT32) {
        yield call(speak, `Sorry, you can not set an alarm for that far in future`, `idle`);
        return;
      }

      // Relative time is provided so add the current time
      yield put(addTimer(durationMs, Date.now() + durationMs, title, 'alarm'));
      durationStr = humanize(durationMs);
    } else {
      if ((durationMs - Date.now()) < 0) {
        let [timeString] = getDateTime();
        yield call(speak, `Sorry, it is ${timeString}, you can not set an alarm that is past due`, `idle`);
        return;
      } else if ((durationMs - Date.now()) > MAX_INT32) {
        yield call(speak, `Sorry, you can not set an alarm for that far in future`, `idle`);
        return;
      }
      yield put(addTimer(durationMs, durationMs, title, 'alarm'));
      durationStr = humanize(durationMs - Date.now());
    }
    yield call(speak, `Ok, I've started` +
        (title ? ` the ` + title : ` an`) + ` alarm to expire in ${durationStr}`,
        `idle`);
    return;
  }

  invariant((type === `cancelTimer`) || (type === `cancelAlarm`));
  const timers = yield select(getTimers);
  invariant(timers);

  if (!timers.length) {
    yield call(speak, `There are no timers running`, `idle`);
    return;
  }

  let timerType = (type === `cancelTimer`) ? 'timer' : 'alarm';

  // Remove an existing timer via |put|.
  for (let timer of timers) {
    if ((timerType === timer.type) &&
        ((title && (timer.title === title)) || (timer.durationMs === durationMs))) {
      yield put(removeTimer(timer.id));
      if (type === `cancelTimer`) {
        yield call(speak, `Ok, I've canceled that timer`, `idle`);
      } else {
        yield call(speak, `Ok, I've canceled` +
            (title ? ` the ` + title : ` that`) + ` alarm`, `idle`);
      }
      return;
    }
  }

  yield call(speak, `Sorry, I couldn't figure out which timer to cancel`, `idle`);
}

/**
 * Find an alarm given the title or find the next alarm
 */
function* findAlarm(durationMs: number, title: string): Generator<Object, ?TimerState, any> {
  // Get the list of timers
  let timers = yield select(getTimers);
  invariant(Array.isArray(timers));

  if (!timers.length) {
    return null;
  }

  let alarm;
  if (title || durationMs) {
    // Find the alarm that matches the title or the duration
    for (let i = 0; i < timers.length; i++) {
      if (timers[i].type !== 'alarm') {
        continue;
      }

      if (title && (timers[i].title === title)) {
        alarm = timers[i];
        break;
      }

      if (durationMs && (timers[i].durationMs === durationMs)) {
        alarm = timers[i];
        break;
      }
    }
  } else { // Assume user is asking about the first alarm to expire
    timers.sort(sortTimers); // Make sure they are sorted
    for (let i = 0; i < timers.length; i++) {
      if (timers[i].type === 'alarm') {
        alarm = timers[i];
        break;
      }
    }
  }
  return alarm;
}

export function* getAlarmInfo(
    environment: Environment,
    entities: Entities
): Generator<Object, void, any> {
  const {speak} = environment;

  let {dateEntity, timeEntity, title} = parseEntities(entities);
  let durationMs = dateTimeEntitiesToMs(dateEntity, timeEntity);

  let alarm = yield call(findAlarm, durationMs, title);
  if (!alarm) {
    yield call(speak, `Sorry, I couldn't figure out which alarm you are talking about`,
        `idle`);
    return;
  }

  let duration = Math.max(alarm.expiresMs - Date.now(), 0);
  yield call(speak, `Alarm ${alarm.title ? alarm.title : alarm.id} would expire in ${humanize(duration)}`, `idle`);
}

export function* findAlarmInfo(
    environment: Environment,
    entities: Entities
): Generator<Object, void, any> {
  const {speak} = environment;

  // Attempt to understand the amount of time the user gave us.
  let {dateEntity, timeEntity, title} = parseEntities(entities);
  let durationMs = dateTimeEntitiesToMs(dateEntity, timeEntity);

  let alarm = yield call(findAlarm, durationMs, title);
  if (!alarm) {
    yield call(speak, `Sorry, I couldn't figure out which alarm you are talking about`,
        `idle`);
    return;
  }

  let when = Math.max(alarm.expiresMs, 0);
  let [timeString, dateString] = getDateTime(when);
  yield call(speak, `Alarm ${alarm.title ? alarm.title : alarm.id} is currently set for ${timeString} on ${dateString}`, `idle`);
}
