/**
 * @flow
 */

import createLog from 'silk-log';
import {buffers, channel} from 'redux-saga';
import {call, cancel, fork, put, take} from 'redux-saga/effects';
import invariant from 'assert';

import createEnvironment from './environment';
import modifyBabies from './babies/saga';
import startFeeding from './food/saga';
import {
  timerMonitorTask,
  modifyTimers,
} from './timers/saga';

import type {DialogEngine} from 'silk-dialog-engine';

import type {Environment} from './environment';
import type {Task} from './index';

type TaskData = {
  task: Task;
  textChannel: Object;
  intentChannel: Object;
};

type TasksInProgress = {
  independent: ?TaskData;
  concurrent: ?TaskData;
};

type GeneratorFactory =
  (...args: Array<any>) => Generator<Object, any, any>; // eslint-disable-line no-undef

const log = createLog(`dialog-script-saga`);

export const unknownText =
  `Sorry, I'm not understanding you. Please check out the app for example ` +
  `requests and questions and try again.`;

const independentIntents: Set<string> = new Set([
  `startFeeding`,
  `startNursing`,
  `startBottleFeeding`,
  `register`,
  `rename`,
]);

const concurrentIntents: Set<string> = new Set([
  `currentTime`,
  `startTimer`,
  `cancelTimer`,
]);

function* forkTask(
  factory: GeneratorFactory,
  environment: Environment,
  ...args: Array<any>
): Generator<Object | Array<Object>, TaskData, any> { // eslint-disable-line no-undef
  const textChannel = yield call(channel, buffers.none());
  invariant(textChannel);

  const intentChannel = yield call(channel, buffers.none());
  invariant(intentChannel);

  const taskEnvironment: Environment = {
    ...environment,
    textChannel,
    intentChannel,
  };

  const task = yield fork(factory, taskEnvironment, ...args);
  invariant(task);

  return {
    task,
    textChannel,
    intentChannel,
  };
}

export function* forwardTextEventsTask(
  textChannel: Object,
  tasks: TasksInProgress,
): Generator<Object | Array<Object>, void, any> { // eslint-disable-line no-undef
  try {
    log.debug(`Starting text event forwarding task`);

    while (true) {                  // eslint-disable-line no-constant-condition
      const text = yield take(textChannel);
      log.debug(`Got text event`, text);

      if (tasks.concurrent && tasks.concurrent.task.isRunning()) {
        yield put(tasks.concurrent.textChannel, text);
      }

      if (tasks.independent && tasks.independent.task.isRunning()) {
        yield put(tasks.independent.textChannel, text);
      }
    }
  } finally {
    log.debug(`Text event forwarding task exiting`);
  }
}

function* closeTask(
  taskData: TaskData,
): Generator<Object | Array<Object>, void, any> { // eslint-disable-line no-undef
  taskData.textChannel.close();
  taskData.intentChannel.close();
  yield cancel(taskData.task);
}

export function* sayCurrentTime(
  environment: Environment,
): Generator<Object, void, any> {                // eslint-disable-line no-undef
  const {speak} = environment;

  const now = new Date();
  const hour = now.getHours() % 12;
  const minutes = now.getMinutes();
  const am = now.getHours() < 12;

  const timeString = `${hour} ${((minutes > 0 && minutes < 10) ? 'oh ' : '')}` +
                     `${(minutes > 0 ? minutes : 'o\'clock')} ` +
                     `${(am ? 'AM' : 'PM')}`;

  yield call(speak, `The time is ${timeString}`, true);
}

export default function*(
  dialogEngine: DialogEngine,
): Generator<Object | Array<Object>, void, any> { // eslint-disable-line no-undef
  log.info(`Starting saga`);

  const environment = yield* createEnvironment(dialogEngine);
  invariant(environment);

  const {intentChannel, speak} = environment;

  const tasks: TasksInProgress = {
    independent: null,
    concurrent: null,
  };

  log.debug(`Forking text event forwarding task`);
  const taskForwardTextEvents = yield fork(forwardTextEventsTask,
                                           environment.textChannel,
                                           tasks);
  invariant(taskForwardTextEvents);

  log.debug(`Forking timer task`);
  const taskTimer = yield fork(timerMonitorTask, environment);
  invariant(taskTimer);

  log.debug(`Starting dialog loop`);

  while (true) {                    // eslint-disable-line no-constant-condition
    log.debug(`Waiting for next intent`);

    const event = yield take(intentChannel);
    invariant(event);

    const {intent, entities} = event;

    log.debug(`Got intent`, intent, entities);

    if (tasks.independent && !tasks.independent.task.isRunning()) {
      yield* closeTask(tasks.independent);
      tasks.independent = null;
    }

    if (tasks.concurrent && !tasks.concurrent.task.isRunning()) {
      yield* closeTask(tasks.concurrent);
      tasks.concurrent = null;
    }

    // Handle independent tasks first.
    if (!tasks.independent && independentIntents.has(intent)) {
      let factory: ?GeneratorFactory = null;
      let args: Array<any> = [];

      switch (intent) {
      case `startFeeding`:
        factory = startFeeding;
        args.push(null);
        break;
      case `startNursing`:
        factory = startFeeding;
        args.push(`nursing`);
        break;
      case `startBottleFeeding`:
        factory = startFeeding;
        args.push(`bottle`);
        break;
      case `register`:
        factory = modifyBabies;
        args.push(`add`);
        break;
      case `rename`:
        factory = modifyBabies;
        args.push(`rename`);
        break;
      default:
        throw new Error(`All intents in independentIntents must be handled!`);
      }

      invariant(factory);

      tasks.independent = yield* forkTask(factory, environment, ...args);
      invariant(tasks.independent);
      invariant(tasks.independent.task);
      invariant(tasks.independent.intentChannel);

      log.debug(`looping`);
      continue;
    }

    // Handle concurrent tasks.
    if (!tasks.concurrent && concurrentIntents.has(intent)) {
      let factory: ?GeneratorFactory = null;
      let args: Array<any> = [];

      switch (intent) {
      case `currentTime`:
        factory = sayCurrentTime;
        break;
      case `startTimer`:
        factory = modifyTimers;
        args.push(`start`, entities);
        break;
      case `cancelTimer`:
        factory = modifyTimers;
        args.push(`cancel`, entities);
        break;
      default:
        throw new Error(`All intents in concurrentIntents must be handled!`);
      }

      invariant(factory);

      tasks.concurrent = yield* forkTask(factory, environment, ...args);
      invariant(tasks.concurrent);
      invariant(tasks.concurrent.task);
      invariant(tasks.concurrent.intentChannel);

      continue;
    }

    invariant(!tasks.concurrent || tasks.independent);

    if (tasks.concurrent) {
      yield put(tasks.concurrent.intentChannel, event);
    }

    if (tasks.independent) {
      yield put(tasks.independent.intentChannel, event);
    }

    if (!tasks.independent && !tasks.concurrent) {
      log.warn(`Unknown intent`, intent, entities);
      yield call(speak, unknownText, true);
    }
  }
}
