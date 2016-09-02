/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 * @private
 */
/**
 * Silk Dialog Engine
 * @module silk-dialog-engine
 * @example
 * const getDialogEngine = require('silk-dialog-engine').default;
 * let dialogEngine = getDialogEngine();
 */

import invariant from 'assert';
import {EventEmitter} from 'events';
import createLog from 'silk-log/device';
import ClosingPassThrough from 'silk-streams/src/closing_passthrough';
import {Readable} from 'stream';

import { default as SpeechToText, configureSpeechToText } from 'silk-stt';
import { default as TextToSpeech, configureTextToSpeech } from 'silk-tts';
import TextToIntention from './textToIntention';
import type { UtteranceType } from 'silk-stt';

export type {Intention, Entity, Entities} from './textToIntention';

import type {
  Intention,
  LuisOptions,
  CustomIntentions,
} from './textToIntention';

import type { SpeechOptions } from 'silk-dialog-script';
import netstatus from 'silk-netstatus';

export type DialogEngineOptions = {
  localTts?: boolean;
};

export type DialogUiMode = 'normal' |
                           'dnd' |    // "Do Not Disturb" with alerts/timers
                           'mute';    // Disable all interaction with the Speaker

export type DialogUiModeEventCallback = (uiMode: DialogUiMode) => void;
export type DialogScriptOptions = {
  customIntentions?: CustomIntentions;
  luisOptions?: LuisOptions,
  speechOptions?: SpeechOptions,
};

/**
 * 'waiting'  : In this state the dialog engine listens to the mic input to get
 *              feedback from the user.
 * 'idle'     : In this state the dialog engine considers the dialog to be done
 *              and requires the keyword to start a new dialog.
 * @private
 */
export type DialogState = 'waiting' | 'idle';

const log = createLog('dialog-engine');

/**
 * Dialog Engine Class
 * @memberof silk-dialog-engine
 */
export class DialogEngine extends EventEmitter {
  /**
   * This event is emitted when the Speaker starts talking
   *
   * @event speak-begin
   * @param {string} text Text that is about to be spoken.
   * @memberof silk-dialog-engine.DialogEngine
   * @instance
   */
  /**
   * This event is emitted when the Speaker finishes talking
   *
   * @event speak-end
   * @param {string} text Text that was spoken.
   * @param {Error} error Non-null if an error was generated during speech.
   * @memberof silk-dialog-engine.DialogEngine
   * @instance
   */
  /**
   * This event is emitted when the microphone activates
   *
   * @event interpret-begin
   * @memberof silk-dialog-engine.DialogEngine
   * @instance
   */
  /**
   * This event is emitted when the microphone deactivates
   *
   * @event interpret-end
   * @memberof silk-dialog-engine.DialogEngine
   * @instance
   */
  /**
   * This event is emitted after speech-to-text has run and we have a text result.
   *
   * @event text
   * @param {string} text Text that was interpreted.
   * @memberof silk-dialog-engine.DialogEngine
   * @instance
   */
  /**
   * This event is emitted once the text result has been run though intent analysis.
   *
   * @event intent
   * @param {string} intent Intent that was inferred from the text.
   * @param {Array<string>} entities A list of entities that were inferred from the text.
   * @memberof silk-dialog-engine.DialogEngine
   * @instance
   */
  /**
   * This event is emitted when the UI mode changes
   *
   * @event ui-mode
   * @param {`normal`|`dnd`|`mute`} dialogUiMode The current ui mode.
   * @memberof silk-dialog-engine.DialogEngine
   * @instance
   */
  /**
   * This event is emitted when a type of sound is detected
   *
   * @event sound
   * @param type Type of the sound detected. For ex, babycry
   * @param when Timestamp of when the sound was detected
   * @memberof silk-dialog-engine.DialogEngine
   * @instance
   */
  /**
   * This event is emitted when a dialog starts
   *
   * @event dialog-start
   * @memberof silk-dialog-engine.DialogEngine
   * @instance
   */
  /**
   * This event is emitted when a dialog ends
   *
   * @event dialog-end
   * @memberof silk-dialog-engine.DialogEngine
   * @instance
   */

  _uiMode: DialogUiMode;
  _options: DialogEngineOptions;
  _scriptOptions: DialogScriptOptions;
  _saveUtterance: boolean = false;
  _utteranceType: UtteranceType;
  _dialogStarted: boolean = false;
  _dialogPromise: Promise<void> = Promise.resolve();
  _dialogPromiseResolve: (value: Promise<void> | void) => void;

  /**
   * Real-time communication channel with any apps that are currently connected
   * to the device
   */
  rtc: EventEmitter;

  constructor(options: DialogEngineOptions,
              uiMode: DialogUiMode,
              rtc: ?EventEmitter) {

    super();

    this._options = options;
    this._uiMode = uiMode;
    if (!rtc) {
      rtc = new EventEmitter();
    }
    this.rtc = rtc;
  }

  get uiMode(): DialogUiMode {
    return this._uiMode;
  }

  set uiMode(mode: DialogUiMode): void {
    if (this._uiMode !== mode) {
      this._uiMode = mode;
      process.nextTick(() => this.emit('ui-mode', mode));
    }
  }

  set saveUtterance(save: boolean) {
    this._saveUtterance = save;
  }

  set utteranceType(type: UtteranceType) {
    this._utteranceType = type;
  }

  /**
   * Configure the Dialog Engine
   *
   * @param scriptOptions Configuration options
   * @memberof silk-dialog-engine.DialogEngine
   */
  configure(scriptOptions: DialogScriptOptions) {
    this._scriptOptions = scriptOptions;

    if (this._scriptOptions.speechOptions) {
      configureSpeechToText(this._scriptOptions.speechOptions);
    }

    if (this._scriptOptions.speechOptions) {
      configureTextToSpeech(this._scriptOptions.speechOptions);
    }

    netstatus.on('online', this._onOnline);
    if (netstatus.online) {
      this._onOnline();
    }
  }

  _onOnline: (() => void) = () => {
    // Opportunistically try acquire the access token once online
    this._scriptOptions.speechOptions.getAccessToken();
  }

  // Returns intention from text (utterance)
  _getIntention(text: string): Promise<Intention> {
    invariant(text);

    text = text.toLowerCase();

    log.debug(`Requesting intention for '${text}'`);

    const tti = new TextToIntention(this._scriptOptions);
    return tti.getIntent(text);
  }

  _onDialogStart: (() => void) = () => {
    log.debug(`Dialog started; pausing audio`);
    this._dialogStarted = true;
    this.emit(`dialog-start`);
    this._dialogPromise = new Promise(resolve => {
      this._dialogPromiseResolve = resolve;
    });
  };

  _onDialogEnd: (() => void) = () => {
    log.debug(`Dialog ended; resuming audio`);
    this._dialogStarted = false;
    this.emit(`dialog-end`);
    this._dialogPromiseResolve();
  };

  _onSpeakBegin: (() => void) = () => {
    if (!this._dialogStarted) {
      // This happens as a result of an unsolicited response like a timer that
      // has expired or an alarm that went off.
      log.debug(`Unsolicited speech started; pausing audio`);
      this._dialogPromise = new Promise(resolve => {
        this._dialogPromiseResolve = resolve;
      });
      this.emit(`dialog-start`);
    }
  };

  /**
   * This function returns a promise that is resolved once the currently active
   * dialog is done.
   */
  dialogDone(): Promise<void> {
    return this._dialogPromise;
  }

  speak(text: string, nextState: ?DialogState): void {
    // Currently speaking empty text is used to abort a dialog.  For now convert
    // this into speaking the space character.
    // TODO: Instead just go directly to the idle state
    if (!text) {
      text = ' ';
    }

    log.debug(`Starting to speak`, text);

    process.nextTick(() => {
      this._onSpeakBegin();
      this.emit(`speak-begin`, text, nextState);
    });

    // Local TTS engine is being used so don't use the cloud based tts stream
    if (this._options && this._options.localTts) {
      return;
    }

    const tts = new TextToSpeech();
    const stream = new ClosingPassThrough();

    let ttsError: ?Error = null;

    tts.addListener(`error`, (error) => {
      log.warn(`TTS error`, error);
      if (!ttsError) {
        ttsError = error;
        stream.emit(`error`, error);
      }
    });
    tts.addListener(`data`, (data) => stream.write(data));
    tts.addListener(`end`, () => stream.end());

    stream.addListener(`close`, () => {
      log.debug(`Finished speaking`, text, ttsError);
      this.emit(`speak-end`, text, ttsError);
    });

    process.nextTick(() => this.emit(`speech`, stream, nextState));
    process.nextTick(() => tts.startRequest(text));
  }

  /**
   * This function is to be called by an external tts engine when it is done
   * speaking the provided text
   *
   * @private
   */
  endSpeak(text: string, error: ?Error) {
    this.emit(`speak-end`, text, error);
  }

  startDialog() {
    this._onDialogStart();
  }

  endDialog() {
    this._onDialogEnd();
  }

  interpret(stream: Readable): void {
    invariant(stream);
    log.debug(`Starting to interpret`);

    process.nextTick(() => this.emit(`interpret-begin`));

    let errorListener: ?Function = null;
    let dataListener: ?Function = null;
    let endListener: ?Function = null;

    const finish: ((error: ?Error, text?: string) => void) = (
      error,
      text = ``,
    ) => {
      invariant(errorListener);
      invariant(dataListener);
      invariant(endListener);

      stream.removeListener(`error`, errorListener);
      stream.removeListener(`data`, dataListener);
      stream.removeListener(`end`, endListener);

      if (error) {
        log.error(`Speech stream error`, error);
        this.emit(`interpret-end`, error);
        return;
      }

      this.emit(`text`, text);
      if (!text) {
        log.debug(`No speech detected`);
        process.nextTick(() => {
          this.emit(`intent`, ``, []);
          this.emit(`interpret-end`, error);
        });
        return;
      }

      log.debug(`Speech recognition finished`, text);

      this._getIntention(text).then((intention: Intention) => {
        log.debug(`Interpretation finished`, intention);
        this.emit(`intent`, intention.intent, intention.entities);
        this.emit(`interpret-end`, error);
      }).catch((error) => {
        log.warn(`Error getting intention`, error);
      });
    };

    const stt = new SpeechToText();

    errorListener = (error) => {
      log.error(`Stream error`, error);
      finish(error);
      stt.finish();
    };
    dataListener = (data) => {
      log.debug(`Stream data`, data.length);
      stt.write(data);
    };
    endListener = () => {
      log.debug(`Stream ended`);
      stt.finish();
    };

    stream.addListener(`error`, errorListener);
    stream.addListener(`data`, dataListener);
    stream.addListener(`end`, endListener);
    stt.startRequest(finish, this._saveUtterance, this._utteranceType);
  }

  notifySoundEvent(type: string, when: number): void {
    this.emit('sound', type, when);
  }
}

let instance: ?DialogEngine = null;
let resolveDialogEnginePromise = null;

export function createDialogEngine(
  options: DialogEngineOptions,
  uiMode: DialogUiMode = 'normal',
  rtcChannel: ?EventEmitter,
): DialogEngine {
  if (!instance) {
    instance = new DialogEngine(options, uiMode, rtcChannel);
    if (resolveDialogEnginePromise) {
      resolveDialogEnginePromise(instance);
      resolveDialogEnginePromise = null;
    }
  }
  return instance;
}

export function genDialogEngine(): Promise<DialogEngine> {
  if (instance) {
    return Promise.resolve(instance);
  }

  return new Promise(resolve => {
    resolveDialogEnginePromise = resolve;
  });
}

/**
 * Get the dialog engine
 *
 * @memberof silk-dialog-engine
 * @returns {DialogEngine}
 */
export default function getDialogEngine(): DialogEngine {
  if (!instance) {
    throw new Error(`Must call createDialogEngine() first!`);
  }

  return instance;
}
