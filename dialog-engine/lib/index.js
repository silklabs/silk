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
 */

import invariant from 'assert';
import {EventEmitter} from 'events';
import createLog from 'silk-log';
import ClosingPassThrough from 'silk-streams/src/closing_passthrough';
import {Readable} from 'stream';

import { default as SpeechToText, configureSpeechToText } from 'silk-stt';
import { default as TextToSpeech, configureTextToSpeech } from 'silk-tts';
import TextToIntention from './textToIntention';

import type {
  Intention,
  LuisOptions,
  CustomIntentions,
} from './textToIntention';

import type { SpeechOptions } from 'silk-dialog-script';

export type DialogEngineOptions = {
  localTts?: boolean;
};

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
   * This event is emitted when the speaker starts talking
   *
   * @event speak-begin
   * @param text Text that is about to be spoken.
   * @memberof silk-dialog-engine.DialogEngine
   */
  /**
   * This event is emitted when the speaker finishes talking
   *
   * @event speak-end
   * @param text Text that was spoken.
   * @param error Non-null if an error was generated during speech.
   * @memberof silk-dialog-engine.DialogEngine
   */
  /**
   * This event is emitted when the microphone activates
   *
   * @event interpret-begin
   * @memberof silk-dialog-engine.DialogEngine
   */
  /**
   * This event is emitted when the microphone deactivates
   *
   * @event interpret-end
   * @memberof silk-dialog-engine.DialogEngine
   */
  /**
   * This event is emitted after speech-to-text has run and we have a text result.
   *
   * @event text
   * @param text Text that was interpreted.
   * @memberof silk-dialog-engine.DialogEngine
   */
  /**
   * This event is emitted once the text result has been run though intent analysis.
   *
   * @event intent
   * @param intent Intent that was inferred from the text.
   * @param entities A list of entities that were inferred from the text.
   * @memberof silk-dialog-engine.DialogEngine
   */

  _options: DialogEngineOptions;
  _scriptOptions: DialogScriptOptions;

  constructor(options: DialogEngineOptions) {

    super();

    this._options = options;
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
  }

  // Returns intention from text (utterance)
  _getIntention(text: string): Promise<Intention> {
    invariant(text);

    text = text.toLowerCase();

    log.debug(`Requesting intention for '${text}'`);

    const tti = new TextToIntention(this._scriptOptions);
    return tti.getIntent(text);
  }

  speak(text: string, nextState: ?DialogState): void {
    invariant(text);
    log.debug(`Starting to speak`, text);

    process.nextTick(() => this.emit(`speak-begin`, text, nextState));

    // Local TTS engine is being used so don't use the cloud based tts stream
    if (this._options && this._options.localTts) {
      return;
    }

    const tts = new TextToSpeech(text);
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
   */
  endSpeak(text: string, error: ?Error) {
    this.emit(`speak-end`, text, error);
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

      if (!text) {
        log.debug(`No speech detected`);
        this.emit(`text`, text);
        process.nextTick(() => {
          this.emit(`intent`, ``, []);
          this.emit(`interpret-end`, error);
        });
        return;
      }

      log.debug(`Speech recognition finished`, text);
      this.emit(`text`, text);

      this._getIntention(text).then((intention: Intention) => {
        log.debug(`Interpretation finished`, intention);
        this.emit(`intent`, intention.intent, intention.entities);
        this.emit(`interpret-end`, error);
      }).catch((error) => {
        log.warn(`Error getting intention`, error);
      });
    };

    const stt = new SpeechToText(finish);

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
    stt.startRequest(finish);
  }
}

let instance: ?DialogEngine = null;

export function createDialogEngine(
  options: DialogEngineOptions,
): DialogEngine {
  if (!instance) {
    instance = new DialogEngine(options);
  }
  return instance;
}

/**
 * Get the dialog engine
 *
 * @name default
 * @memberof silk-dialog-engine
 * @returns {DialogEngine}
 * @example
 *
 * const getDialogEngine = require('silk-dialog-engine'.default;
 * let dialogEngine = getDialogEngine();
 *
 */
export default function getDialogEngine(): DialogEngine {
  if (!instance) {
    throw new Error(`Must call createDialogEngine() first!`);
  }

  return instance;
}
