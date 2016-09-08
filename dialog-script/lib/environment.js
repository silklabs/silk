/**
 * @flow
 */

/**
 * This file sets up a lot of internal glue to make channels work with the
 * dialog engine, and also starts some long-running sagas that handle system
 * notifications.
 */

import createLog from 'silk-log/device';
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

import type {DialogEngine, DialogState} from 'silk-dialog-engine';

const errorText = `Sorry, something went wrong.`;

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
  micChannel: Object;
};

export type SagasInProgress = {
  independent: ?SagaData;
  concurrent: ?SagaData;
};

export type SagaFunction =
  (...args: Array<any>) => Generator<Object, any, any>;

export type Environment = {
  dialogEngine: DialogEngine;
  micChannel: Object;
  speak: (text: string, nextState?: DialogState) => Promise<void>;
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
): Generator<Object | Array<Object>, void, any> {
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

export function createMicEventChannel(dialogEngine: DialogEngine): Object {
  const textEventName = `text`;
  const intentEventName = `intent`;

  return eventChannel((push) => {
    /**
     * Keep track of outstanding listeners so that we can clean them all up if
     * the channel is closed.
     */
    const intentListeners: Set<Function> = new Set();

    const textListener: ((text: string, utterance: Buffer) => void) = (text, utterance) => {
      log.debug(`'${textEventName}' event`, text);

      const intentListener: (
        (intent: string, entities: Array<string>) => void
      ) = (intent, entities) => {
        log.debug(`'${intentEventName}' event`, intent, entities);

        dialogEngine.removeListener(`intent`, intentListener);
        intentListeners.delete(intentListener);

        push({
          text,
          intent,
          entities,
          utterance,
        });
      };

      dialogEngine.addListener(intentEventName, intentListener);
      intentListeners.add(intentListener);
    };

    dialogEngine.addListener(textEventName, textListener);

    return () => {
      dialogEngine.removeListener(textEventName, textListener);

      intentListeners.forEach((intentListener) => {
        dialogEngine.removeListener(intentEventName, intentListener);
      });
    };
  });
}

export function speak(
  dialogEngine: DialogEngine,
  text: string,
  nextState: ?DialogState,
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
    dialogEngine.speak(text, nextState);
  });
}

/**
 * Wrap the fork call with a `call` API to be able to catch
 * the errors from a saga. Redux-saga doesn't have a way otherwise
 * to report an exception to the parent of a forked saga
 */
export function* wrapFork(
    factory: SagaFunction,
    sagaEnvironment: Environment,
    ...args: Array<any>
): Generator<Object | Array<Object>, void, any> {
  try {
    yield call(factory, sagaEnvironment, ...args);
  } catch (err) {
    // Throw error to generate a tombstone to monitor the exceptions
    process.nextTick(() => {
      throw err;
    });
    yield call(speak, sagaEnvironment.dialogEngine, errorText, `idle`);
  }
}

export function* startSaga(
  factory: SagaFunction,
  environment: Environment,
  ...args: Array<any>
): Generator<Object | Array<Object>, SagaData, any> {
  const micChannel = yield call(channel, buffers.none());
  invariant(micChannel);

  const sagaEnvironment: Environment = {
    ...environment,
    micChannel,
  };

  const saga = yield fork(wrapFork, factory, sagaEnvironment, ...args);
  invariant(saga);

  return {
    saga,
    micChannel,
  };
}

export function* cleanupFinishedSagas(
  sagas: SagasInProgress,
): Generator<Object | Array<Object>, void, any> {
  const independent = sagas.independent;
  if (independent && !independent.saga.isRunning()) {
    independent.micChannel.close();
    yield cancel(independent.saga);

    sagas.independent = null;
  }

  const concurrent = sagas.concurrent;
  if (concurrent && !concurrent.saga.isRunning()) {
    concurrent.micChannel.close();
    yield cancel(concurrent.saga);

    sagas.concurrent = null;
  }
}

export default function*(
  dialogEngine: DialogEngine,
): Generator<Object | Array<Object>, Environment, any> {
  invariant(dialogEngine);

  log.info(`Creating environment`);

  log.debug(`Creating mic event channel`);
  const micChannel = yield call(createMicEventChannel, dialogEngine);
  invariant(micChannel);

  log.debug(`Forking audio event saga`);
  const sagaAudio = yield fork(audioEventSaga, dialogEngine);
  invariant(sagaAudio);

  const env: Environment = {
    dialogEngine,
    micChannel,
    speak: speak.bind(null, dialogEngine),
  };

  log.debug(`Forking timer saga`);
  const sagaTimer = yield fork(timerMonitorSaga, env);
  invariant(sagaTimer);

  log.debug(`Finished`);

  return env;
}
