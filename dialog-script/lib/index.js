/**
 * @flow
 */

import createLog from 'silk-log';
import getDialogEngine from 'silk-dialog-engine';
import invariant from 'assert';

import createEnvironment from './environment';
import saga from './saga';
import store from './store';
import {
  speakBegin,
  speakEnd,
  interpretBegin,
  interpretEnd,
} from './actions';
import textToIntention from './textToIntention';

import type {DialogEngine} from 'silk-dialog-engine';

export type Task = {
  isRunning(): boolean;
  isCancelled(): boolean;
  result(): any;
  error(): any;
  done: Promise<any>;
  cancel(): void;
};

const log = createLog('dialog-script');

class Script{

  _unload: ?(() => void);

  constructor(dialogEngine: DialogEngine) {
    log.info(`Starting script`);
    log.debug(`Initial state`, store.getState());

    const task: Task = store.runSaga(saga, createEnvironment(dialogEngine));
    invariant(task.isRunning());

    dialogEngine.on(`interpret-begin`, this.onInterpretBegin);
    dialogEngine.on(`interpret-end`, this.onInterpretEnd);
    dialogEngine.on(`speak-begin`, this.onSpeakEnd);
    dialogEngine.on(`speak-end`, this.onSpeakEnd);

    this._unload = () => {
      this._unload = null;
      dialogEngine.removeListener(`interpret-begin`, this.onInterpretBegin);
      dialogEngine.removeListener(`interpret-end`, this.onInterpretEnd);
      dialogEngine.removeListener(`speak-begin`, this.onSpeakBegin);
      dialogEngine.removeListener(`speak-end`, this.onSpeakEnd);
      task.cancel();
    };
  }

  onInterpretBegin: (() => void) = () => {
    store.dispatch(interpretBegin());
  };

  onInterpretEnd: (() => void) = () => {
    store.dispatch(interpretEnd());
  };

  onSpeakBegin: ((text: string) => void) = (text) => {
    store.dispatch(speakBegin(text));
  };

  onSpeakEnd: (() => void) = () => {
    store.dispatch(speakEnd());
  };

  unload() {
    invariant(this._unload);
    this._unload();
  }
}

const dialogEngine = getDialogEngine();
invariant(dialogEngine);

dialogEngine.configure({textToIntention});

let script = new Script(dialogEngine);

export function silkWillUnload() {
  log.info('Farewell');
  invariant(script);
  script.unload();
  script = null;
}
