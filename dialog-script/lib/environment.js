/**
 * @flow
 */

import createLog from 'silk-log';
import {eventChannel} from 'redux-saga';
import invariant from 'assert';

import type {DialogEngine} from 'silk-dialog-engine';

// TODO: Better flow
export type Environment = {
  dialogEngine: DialogEngine;
  textChannel: Object;
  intentChannel: Object;
  speak: Function;
};

const log = createLog(`dialog-script-environment`);

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

export default function(
  dialogEngine: DialogEngine,
): Environment {
  invariant(dialogEngine);

  log.debug(`Creating environment`);

  const textChannel = createTextChannel(dialogEngine);
  const intentChannel = createIntentChannel(dialogEngine);
  const boundSpeak =
    (text: string, finished: boolean) => speak(dialogEngine, text, finished);

  const env: Environment = {
    dialogEngine,
    textChannel,
    intentChannel,
    speak: boundSpeak,
  };

  return env;
}
