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

import SpeechToText from './speechToText';
import TextToSpeech from './textToSpeech';

// XXX DEMO ONLY Replace with luis
import textToIntention from './textToIntention';

export type DialogEngineOptions = {
  // Nothing for now... Will eventually have luis model access token, etc.
};

export type Intention = {
  intent: string;
  entities: Array<string>;
};

const log = createLog('dialog-engine');

export const UNKNOWN_INTENT = 'unknownIntent';

/**
 * Dialog Engine Class
 * @memberof silk-dialog-engine
 */
export class DialogEngine extends EventEmitter {
  /**
   * This event is emitted when the speaker starts talking
   *
   * @event speak-begin
   * @memberof silk-dialog-engine.DialogEngine
   */
  /**
   * This event is emitted when the speaker finishes talking
   *
   * @event speak-end
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
   * @memberof silk-dialog-engine.DialogEngine
   */
  /**
   * This event is emitted once the text result has been run though intent analysis.
   *
   * @event indent
   * @memberof silk-dialog-engine.DialogEngine
   */

  _options: DialogEngineOptions;

  constructor(options: DialogEngineOptions) {

    super();

    this._options = options;
  }

  // Returns intention from text (utterance)
  async _getIntention(text: string): Promise<Intention> {
    invariant(text);

    text = text.toLowerCase();

    log.debug(`Requesting intention for '${text}'`);

    // XXX DEMO ONLY
    let {intent, entities} = Object.assign({}, textToIntention[text]);

    if (!intent) {
      log.info(`Did not find intention information for '${text}'`);
      intent = UNKNOWN_INTENT;
      entities = [];
    }

    log.debug(`Processed intention`, intent, entities);

    return {
      intent,
      entities,
    };
  }

  speak(text: string, finished: boolean): void {
    invariant(text);
    log.debug(`Starting to speak`, text);

    process.nextTick(() => this.emit(`speak-begin`, text));

    const tts = new TextToSpeech(text);
    const stream = new ClosingPassThrough();

    tts.addListener(`error`, (error) => stream.emit(`error`, error));
    tts.addListener(`data`, (data) => stream.write(data));
    tts.addListener(`end`, () => stream.end());
    stream.addListener(`close`, () => {
      log.debug(`Finished speaking`, text);
      this.emit(`speak-end`, text);
    });

    process.nextTick(() => this.emit(`speech`, stream, finished));
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
        this.emit(`interpret-end`);
        return;
      }

      if (!text) {
        log.debug(`No speech detected`);
        this.emit(`text`, text);
        process.nextTick(() => {
          this.emit(`intent`, text, []);
          this.emit(`interpret-end`);
        });
        return;
      }

      log.debug(`Speech recognition finished`, text);
      this.emit(`text`, text);

      this._getIntention(text).then((intention: Intention) => {
        log.debug(`Interpretation finished`, intention);
        this.emit(`intent`, intention.intent, intention.entities);
        this.emit(`interpret-end`);
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
