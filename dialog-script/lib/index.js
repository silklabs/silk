/**
 * @flow
 */

import createLog from 'silk-log/device';
import getDialogEngine from 'silk-dialog-engine';
import invariant from 'assert';
import storage from 'silk-dialog-storage';
import * as speechOptions from './speechAccessToken';

export type SpeechOptions = typeof speechOptions;

// The main saga function.
import saga from './saga';

// The one and only data store.
import getStore from './store';
import textToIntention from './textToIntention';

import type {DialogEngine} from 'silk-dialog-engine';
import type {Saga} from './environment';

const log = createLog('dialog-script');

// Save state no more than once every 5 seconds.
const COALESCE_STATE_WINDOW_MS = 5000;

class DialogScript {

  _unloaded: boolean = false;
  _currentSaga: ?Saga = null;
  _stopReceivingStateUpdates: ?Function = null;
  _mostRecentState: ?Object = null;
  _persistTimeout: ?number = null;

  constructor(dialogEngine: DialogEngine) {
    log.info(`Starting script`);

    // Immediately kick off the async actions needed to load state from disk.
    log.debug(`Loading store`);
    getStore().then((store) => this._start(dialogEngine, store));
  }

  _start(dialogEngine: DialogEngine, store: Object): void {
    // It's possible that we were unloaded while loading the state from disk.
    if (this._unloaded) {
      log.debug(`Already unloaded`);
      return;
    }

    /**
     * We connect redux state updates to our persistent storage by "subscribing"
     * to the store.
     */
    this._stopReceivingStateUpdates = store.subscribe(() => {
      this._persistState(store.getState());
    });

    log.info(`Starting saga with initial state`, store.getState());

    this._currentSaga = store.runSaga(saga, dialogEngine);
  }

  _persistState(state: Object): void {
    invariant(state);

    // Always save the most recent state.
    this._mostRecentState = state;

    if (this._persistTimeout) {
      // Already running a persist timer, just wait for it to expire.
      return;
    }

    log.debug(`Setting persistence timer`);

    this._persistTimeout = setTimeout(() => {
      const state = this._mostRecentState;
      invariant(state);

      // Don't hang on to state any longer than necessary.
      this._mostRecentState = null;
      this._persistTimeout = null;

      log.info(`Persisting state`, state);

      storage.set(state).catch((error) => {
        log.error(`Failed to persist state`, error);
      });

    }, COALESCE_STATE_WINDOW_MS);
  }

  unload(): void {
    if (this._unloaded) {
      log.warn(`Unloaded more than once`);
      return;
    }

    this._unloaded = true;
    this._mostRecentState = null;

    if (this._persistTimeout) {
      clearTimeout(this._persistTimeout);
      this._persistTimeout = null;
    }

    if (this._stopReceivingStateUpdates) {
      this._stopReceivingStateUpdates();
      this._stopReceivingStateUpdates = null;
    }

    const currentSaga = this._currentSaga;
    if (currentSaga) {
      log.info(`Canceling saga`);
      currentSaga.cancel();
      this._currentSaga = null;
    }
  }
}

/**
 * Get the dialog engine and make sure it is configured with custom intents and
 * Luis keys.
 */
const dialogEngine = getDialogEngine();
invariant(dialogEngine);

dialogEngine.configure({
  customIntentions: textToIntention,
  luisOptions: {
    apps: [
      {
        // Baby Luis app
        id: `1049f242-aa89-4ed2-ac4b-5861754818dc`,
        key: `0e6a5c9f33a14422ad6f1bad7c77926e`,
      },
      {
        // Silk demo Luis app
        id: `ab071c9a-8169-4e3c-ad88-a1be06b8153f`,
        key: `0e6a5c9f33a14422ad6f1bad7c77926e`,
      },
    ],
  },
  speechOptions,
});

let dialogScript: ?DialogScript = new DialogScript(dialogEngine);

// This function is called whenever new packages have been pushed to the device
// so we need to cancel any existing script immediately.
export function silkWillUnload() {
  log.info('Unloading');
  if (dialogScript) {
    dialogScript.unload();
    dialogScript = null;
  }
}

// Only for testing!
export function reload() {
  log.info('Reloading');
  if (dialogScript) {
    dialogScript.unload();
    dialogScript = null;
  }
  dialogScript = new DialogScript(dialogEngine);
}
