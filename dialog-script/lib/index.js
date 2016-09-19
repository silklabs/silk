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

    // Example real-time communication with any connected apps:
    // - Broadcast the time every 10 seconds
    // - Echo back anything sent
    const broadcastTime = () => {
      if (this._unloaded) {
        return;
      }
      dialogEngine.rtc.emit(`message`, {
        command: `time`,
        payload: {
          now: Date.now(),
        },
      });
      setTimeout(broadcastTime, 10 * 1000);
    };
    broadcastTime();

    dialogEngine.rtc.on(`message`, this._onRtcMessage);
    // End RTC example

    dialogEngine.on('sound', this._onSoundEvent);
  }

  _onRtcMessage: ((payload: Object) => void) = (message) => {
    log.info(`Message from rtc`, message);

    // Echo 'echo' messages back to the sender.
    if (message &&
        typeof message === `object` &&
        message.command === `echo` &&
        typeof message.payload === `object`) {
      dialogEngine.rtc.emit(`message`, message);
    }
  }

  _onSoundEvent: ((type: string, when: number) => void) = (type, when) => {
    log.info(`${type} event detected at ${when}`);
  };

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

    dialogEngine.removeListener('sound', this._onSoundEvent);
    dialogEngine.rtc.removeListener(`message`, this._onRtcMessage);

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
        // 'Baby Feeding' Luis app - engineering@silklabs.com
        id: `6464166b-c589-439f-8b2e-a84418d974c1`,
        key: `572e250e318e428d893cb19279d22a87`,
      },
      {
        // 'Silk Demo' Luis App - engineering@silklabs.com
        id: `77362118-061a-4713-adac-ed0498342935`,
        key: `572e250e318e428d893cb19279d22a87`,
      },
      {
        // 'Cortana prebuilt' Luis App
        id: `c413b2ef-382c-45bd-8ff0-f76d60e2a821`,
        key: `572e250e318e428d893cb19279d22a87`,

        // Only handle these intents from the prebuilt app
        whitelist: ['builtin.intent.weather.check_weather',
                    'builtin.intent.alarm.delete_alarm',
                    'builtin.intent.alarm.turn_off_alarm',
                    'builtin.intent.alarm.set_alarm',
                    'builtin.intent.alarm.time_remaining',
                    'builtin.intent.alarm.find_alarm'],
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
