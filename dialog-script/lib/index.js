/**
 * @flow
 */

import createLog from 'silk-log';
import getDialogEngine from 'silk-dialog-engine';
import invariant from 'assert';

// The main saga function.
import saga from './saga';

// The one and only data store.
import store from './store';
import textToIntention from './textToIntention';

import type {DialogEngine} from 'silk-dialog-engine';
import type {Saga} from './environment';

const log = createLog('dialog-script');

// The currently running saga.
let currentSaga: ?Saga = null;

// Launch the main saga.
function startScript(dialogEngine: DialogEngine): void {
  invariant(!currentSaga);

  log.info(`Starting script`);
  log.debug(`Initial state`, store.getState());

  currentSaga = store.runSaga(saga, dialogEngine);
  invariant(currentSaga.isRunning());
}

// Cancel the main saga.
function stopScript(): void {
  if (!currentSaga) {
    log.warn(`Unloaded more than once?`);
    return;
  }

  log.info(`Canceling script`);
  currentSaga.cancel();
  currentSaga = null;
}

// Get the dialog engine and make sure it is configured with custom intents and
// Luis keys.
const dialogEngine = getDialogEngine();
invariant(dialogEngine);

dialogEngine.configure({
  customIntentions: textToIntention,
  luisOptions: {
    id: `1049f242-aa89-4ed2-ac4b-5861754818dc`,
    key: `0e6a5c9f33a14422ad6f1bad7c77926e`,
  },
});

// Run the dialog engine with our script.
startScript(dialogEngine);

// This function is called whenever new packages have been pushed to the device
// so we need to cancel any existing script immediately.
export function silkWillUnload() {
  log.info('Unloading');
  stopScript();
}

// Only for testing!
export function reload() {
  log.info('Reloading');
  stopScript();
  startScript(dialogEngine);
}
