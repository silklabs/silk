/**
 * @flow
 */

import createLog from 'silk-log';
import {buffers, eventChannel} from 'redux-saga';
import {call, put, fork, take} from 'redux-saga/effects';
import invariant from 'assert';

import {
  speakBegin,
  speakEnd,
  interpretBegin,
  interpretEnd,
} from './actions';

import type {DialogEngine} from 'silk-dialog-engine';

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

export function* audioEventTask(
  dialogEngine: DialogEngine,
): Generator<Object | Array<Object>, void, any> { // eslint-disable-line no-undef
  try {
    log.debug(`Starting audio event task`);

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
    log.debug(`Audio event task exiting`);
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

export default function*(
  dialogEngine: DialogEngine,
): Generator<Object | Array<Object>, Environment, any> { // eslint-disable-line no-undef
  invariant(dialogEngine);

  log.debug(`Creating environment`);

  log.debug(`Creating text event channel`);
  const textChannel = yield call(createTextEventChannel, dialogEngine);
  invariant(textChannel);

  log.debug(`Creating intent event channel`);
  const intentChannel = yield call(createIntentEventChannel, dialogEngine);
  invariant(intentChannel);

  log.debug(`Forking audio event task`);
  const taskAudio = yield fork(audioEventTask, dialogEngine);
  invariant(taskAudio);

  const env: Environment = {
    textChannel,
    intentChannel,
    speak: speak.bind(null, dialogEngine),
  };

  log.debug(`Finished`);

  return env;
}
