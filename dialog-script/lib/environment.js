/**
 * @flow
 */

/**
 * This file sets up a lot of internal glue to make channels work with the
 * dialog engine, and also starts some long-running sagas that handle system
 * notifications.
 */

import createLog from 'silk-log';
import {buffers, channel, eventChannel} from 'redux-saga';
import {call, cancel, fork, put, take} from 'redux-saga/effects';
import invariant from 'assert';

import {
  speakBegin,
  speakEnd,
  interpretBegin,
  interpretEnd,
} from './actions';
import {timerMonitorSaga} from './timers/saga';

import type {DialogEngine} from 'silk-dialog-engine';

// Really a Task object...
export type Saga = {
  isRunning(): boolean;
  isCancelled(): boolean;
  result(): any;
  error(): any;
  done: Promise<any>;
  cancel(): void;
};

export type SagaData = {
  saga: Saga;
  textChannel: Object;
  intentChannel: Object;
};

export type SagasInProgress = {
  independent: ?SagaData;
  concurrent: ?SagaData;
};

export type SagaFunction =
  (...args: Array<any>) => Generator<Object, any, any>; // eslint-disable-line no-undef

export type Environment = {
  textChannel: Object;
  intentChannel: Object;
  speak: (text: string, finished: boolean) => Promise<void>;
};

const log = createLog(`dialog-script-environment`);

export function createAudioEventChannel(dialogEngine: DialogEngine): Object {
  return eventChannel((push) => {
    const speakBeginListener: ((text: string) => void) = (text) => {
      log.debug(`speak-begin`, text);
      push(speakBegin(text));
    };
    const speakEndListener: (() => void) = () => {
      log.debug(`speak-end`);
      push(speakEnd());
    };
    const interpretBeginListener: (() => void) = () => {
      log.debug(`interpret-begin`);
      push(interpretBegin());
    };
    const interpretEndListener: (() => void) = () => {
      log.debug(`interpret-end`);
      push(interpretEnd());
    };

    dialogEngine.addListener(`speak-begin`, speakBeginListener);
    dialogEngine.addListener(`speak-end`, speakEndListener);
    dialogEngine.addListener(`interpret-begin`, interpretBeginListener);
    dialogEngine.addListener(`interpret-end`, interpretEndListener);

    return () => {
      dialogEngine.removeListener(`speak-begin`, speakBeginListener);
      dialogEngine.removeListener(`speak-end`, speakEndListener);
      dialogEngine.removeListener(`interpret-begin`, interpretBeginListener);
      dialogEngine.removeListener(`interpret-end`, interpretEndListener);
    };
  });
}

export function* audioEventSaga(
  dialogEngine: DialogEngine,
): Generator<Object | Array<Object>, void, any> { // eslint-disable-line no-undef
  try {
    log.debug(`Starting audio event saga`);

    const audioChannel = yield call(createAudioEventChannel, dialogEngine);
    invariant(audioChannel);

    while (true) {                  // eslint-disable-line no-constant-condition
      const action = yield take(audioChannel);
      invariant(action);

      log.debug(`Audio action`, action);
      yield put(action);
    }
  } finally {
    // Clean up if we get canceled.
    log.debug(`Audio event saga exiting`);
    yield [put(speakEnd()), put(interpretEnd())];
  }
}

export function createTextEventChannel(dialogEngine: DialogEngine): Object {
  return eventChannel((push) => {
    const textListener: ((text: string) => void) = (text) => {
      log.debug(`'text' event`, text);
      push(text);
    };

    dialogEngine.addListener(`text`, textListener);

    return () => {
      dialogEngine.removeListener(`text`, textListener);
    };
  });
}

export function createIntentEventChannel(dialogEngine: DialogEngine): Object {
  return eventChannel((push) => {
    const intentListener: ((intent: string, entities: Array<string>) => void) = (intent, entities) => {
      log.debug(`'intent' event`, intent, entities);
      push({
        intent,
        entities,
      });
    };

    dialogEngine.addListener(`intent`, intentListener);

    return () => {
      dialogEngine.removeListener(`intent`, intentListener);
    };
  }, buffers.fixed());
}

export function speak(
  dialogEngine: DialogEngine,
  text: string,
  finished: boolean,
): Promise<void> {
  return new Promise((resolve) => {
    const endListener = (speakingText) => {
      dialogEngine.removeListener(`speak-end`, endListener);
      resolve();
    };

    const beginListener = (speakingText) => {
      if (speakingText === text) {
        dialogEngine.removeListener(`speak-begin`, beginListener);
        dialogEngine.addListener(`speak-end`, endListener);
      }
    };

    dialogEngine.addListener(`speak-begin`, beginListener);
    dialogEngine.speak(text, finished);
  });
}

export function* startSaga(
  factory: SagaFunction,
  environment: Environment,
  ...args: Array<any>
): Generator<Object | Array<Object>, SagaData, any> { // eslint-disable-line no-undef
  const textChannel = yield call(channel, buffers.none());
  invariant(textChannel);

  const intentChannel = yield call(channel, buffers.none());
  invariant(intentChannel);

  const sagaEnvironment: Environment = {
    ...environment,
    textChannel,
    intentChannel,
  };

  const saga = yield fork(factory, sagaEnvironment, ...args);
  invariant(saga);

  return {
    saga,
    textChannel,
    intentChannel,
  };
}

export function* forwardTextEventsSaga(
  textChannel: Object,
  sagas: SagasInProgress,
): Generator<Object | Array<Object>, void, any> { // eslint-disable-line no-undef
  try {
    log.debug(`Starting text event forwarding saga`, sagas);

    while (true) {                  // eslint-disable-line no-constant-condition
      const text = yield take(textChannel);
      log.debug(`Got text event`, text, sagas);

      const {concurrent, independent} = sagas;

      if (concurrent && concurrent.saga.isRunning()) {
        log.debug(`Forwarding to concurrent saga`);
        yield put(concurrent.textChannel, text);
      }

      if (independent && independent.saga.isRunning()) {
        log.debug(`Forwarding to independent saga`);
        yield put(independent.textChannel, text);
      }
    }
  } finally {
    log.debug(`Text event forwarding saga exiting`);
  }
}

export function* cleanupFinishedSagas(
  sagas: SagasInProgress,
): Generator<Object | Array<Object>, void, any> { // eslint-disable-line no-undef
  const independent = sagas.independent;
  if (independent && !independent.saga.isRunning()) {
    independent.textChannel.close();
    independent.textChannel.close();
    yield cancel(independent.saga);

    sagas.independent = null;
  }

  const concurrent = sagas.concurrent;
  if (concurrent && !concurrent.saga.isRunning()) {
    concurrent.textChannel.close();
    concurrent.textChannel.close();
    yield cancel(concurrent.saga);

    sagas.concurrent = null;
  }
}

export default function*(
  dialogEngine: DialogEngine,
  sagas: SagasInProgress,
): Generator<Object | Array<Object>, Environment, any> { // eslint-disable-line no-undef
  invariant(dialogEngine);

  log.info(`Creating environment`);

  log.debug(`Creating text event channel`);
  const textChannel = yield call(createTextEventChannel, dialogEngine);
  invariant(textChannel);

  log.debug(`Creating intent event channel`);
  const intentChannel = yield call(createIntentEventChannel, dialogEngine);
  invariant(intentChannel);

  log.debug(`Forking audio event saga`);
  const sagaAudio = yield fork(audioEventSaga, dialogEngine);
  invariant(sagaAudio);

  log.debug(`Forking text event forwarding saga`);
  const sagaForwardTextEvents = yield fork(forwardTextEventsSaga,
                                           textChannel,
                                           sagas);
  invariant(sagaForwardTextEvents);

  const env: Environment = {
    textChannel,
    intentChannel,
    speak: speak.bind(null, dialogEngine),
  };

  log.debug(`Forking timer saga`);
  const sagaTimer = yield fork(timerMonitorSaga, env);
  invariant(sagaTimer);

  log.debug(`Finished`);

  return env;
}
