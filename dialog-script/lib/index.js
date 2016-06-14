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

dialogEngine.configure({
  customIntentions: textToIntention,
  luisOptions: {
    id: `1049f242-aa89-4ed2-ac4b-5861754818dc`,
    key: `0e6a5c9f33a14422ad6f1bad7c77926e`,
  },
});

let script = new Script(dialogEngine);

export function silkWillUnload() {
  log.info('Farewell');
  invariant(script);
  script.unload();
  script = null;
}

// Only for testing!
export function reload() {
  invariant(script);
  script.unload();
  script = new Script(dialogEngine);
}
