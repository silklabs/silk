/**
 * @flow
 */

import createLog from 'silk-log';
import getDialogEngine from 'silk-dialog-engine';
import invariant from 'assert';

import saga from './saga';
import store from './store';
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

  _task: ?Task;

  constructor(dialogEngine: DialogEngine) {
    log.info(`Starting script`);
    log.debug(`Initial state`, store.getState());

    this._task = store.runSaga(saga, dialogEngine);
    invariant(this._task.isRunning());
  }

  unload() {
    if (!this._task) {
      log.warn(`Unloaded more than once`);
      return;
    }

    this._task.cancel();
    this._task = null;
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
