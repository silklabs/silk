/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import createLog from 'silk-log';
import {eventChannel} from 'redux-saga';
import {call} from 'redux-saga/effects';
import invariant from 'assert';

import type {DialogEngine} from 'silk-dialog-engine';

// TODO: Better flow
export type SagaArgs = {
  dialogEngine: DialogEngine;
  textChannel: any;
  intentChannel: any;
  speak: Function;
};

const log = createLog(`dialog-fuhu-sagaArgs`);

export function createTextChannel(dialogEngine: DialogEngine) {
  return eventChannel((push) => {
    const listener = (text) => {
      push(text);
    };
    dialogEngine.addListener(`text`, listener);
    return () => {
      dialogEngine.removeListener(`text`, listener);
    };
  });
}

export function createIntentChannel(dialogEngine: DialogEngine) {
  return eventChannel((push) => {
    const listener = (intent: string, entities: Array<string>) => {
      push({
        intent,
        entities,
      });
    };
    dialogEngine.addListener(`intent`, listener);
    return () => {
      dialogEngine.removeListener(`intent`, listener);
    };
  });
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

export default function* (
  dialogEngine: DialogEngine,
): Generator<any, SagaArgs, any> {               // eslint-disable-line no-undef
  invariant(dialogEngine);

  log.debug(`Creating channels`);

  const textChannel = yield call(createTextChannel, dialogEngine);
  log.debug(`Got text channel`);

  const intentChannel = yield call(createIntentChannel, dialogEngine);
  log.debug(`Got intent channel`);

  const boundSpeak =
    (text: string, finished: boolean) => speak(dialogEngine, text, finished);

  const sagaArgs: SagaArgs = {
    dialogEngine,
    textChannel,
    intentChannel,
    speak: boundSpeak,
  };

  return sagaArgs;
}
