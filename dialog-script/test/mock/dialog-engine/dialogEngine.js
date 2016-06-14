/**
 * @flow
 */

import {EventEmitter} from 'events';
import * as https from 'https';
import createLog from 'silk-log';

import type {Readable} from 'stream';

export type Intention = {
  intent: string;
  entities: Array<string>;
};

export type LuisOptions = {
  id: string;
  key: string;
};

export type CustomIntentions = {
  [key: string]: Intention
};

export type DialogEngineOptions = {
  // Nothing for now...
};

export type DialogScriptOptions = {
  customIntentions?: CustomIntentions;
  luisOptions?: LuisOptions,
};

type IntentResponse = {
  intent: string;
  score: number;
};

export const UNKNOWN_INTENT = `unknownIntent`;

const log = createLog(`mock-dialog-engine`);

const LUIS_HOSTNAME = `api.projectoxford.ai`;
const LUIS_PORT = 443;
const LUIS_PATH = `/luis/v1/application`;
const LUIS_METHOD = `GET`;

function urlEncode(obj: Object): string {
  const list = [];
  Object.keys(obj).forEach(key => {
    list.push(`${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`);
  });
  return list.join(`&`);
}

function sleep(delayMs: number = 0): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export default class DialogEngine extends EventEmitter {

  _options: DialogEngineOptions;
  _scriptOptions: DialogScriptOptions;

  constructor(options?: DialogEngineOptions = {}) {
    super();
    this._options = options;
  }

  configure(scriptOptions?: DialogScriptOptions = {}): void {
    this._scriptOptions = scriptOptions;
  }

  interpret(stream: Readable): void {
    throw new Error(`Not implemented, use '_mockInterpret'`);
  }

  speak(text: string, finished: boolean) {
    this._mockSpeak(text, finished);
  }

  async _mockSpeak(text: string, finished: boolean): Promise<void> {
    log.info(`Mocking speak`, text, finished);
    await sleep(0);

    this.emit(`speak-begin`, text);
    await sleep(50);

    this.emit(`speak-end`, text, null);
    await sleep(0);

    this.emit(`mock-speech`, text, finished);
  }

  async _mockInterpret(text: string): Promise<void> {
    text = text.toLowerCase();
    log.info(`Mocking interpret`, text);
    await sleep(0);

    this.emit(`interpret-begin`);
    await sleep(50);

    this.emit(`text`, text);
    const intention: Intention = await this._getIntent(text);

    this.emit(`intent`, intention.intent, intention.entities);
    await sleep(0);

    this.emit(`interpret-end`, null);
  }

  _getIntent(text: string): Promise<Intention> {
    log.info(`Finding intent`, text);

    if (this._scriptOptions.customIntentions) {
      const intention = this._scriptOptions.customIntentions[text];
      if (intention) {
        log.info(`Found match in custom intentions`, intention);
        return Promise.resolve(intention);
      }
    }

    if (this._scriptOptions.luisOptions) {
      const {id, key} = this._scriptOptions.luisOptions;

      return new Promise((resolve, reject) => {
        const data = urlEncode({
          id,
          'subscription-key': key,
          'q': text,
        });

        const opts = {
          hostname: LUIS_HOSTNAME,
          port: LUIS_PORT,
          path: `${LUIS_PATH}?${data}`,
          method: LUIS_METHOD,
        };

        log.info(`Issuing luis request`);
        log.debug(`options`, opts);

        const req = https.request(opts, (res) => {
          let json = '';
          res.once(`error`, (error) => reject(error));
          res.on('data', (chunk) => json += chunk);
          res.once('end', () => {
            if (res.statusCode === 200) {
              log.info(`Request complete`);
              log.debug(json);

              let intent;
              try {
                intent = this._parseResponse(json);
              } catch(error) {
                reject(error);
                return;
              }
              resolve(intent);
            } else {
              reject(new Error(`Request failed with status code ` +
                               `${res.statusCode}`));
            }
          });
        });

        req.write(data);
        req.end();
      });
    }

    log.info(`No intention found`);
    return Promise.resolve({intent: UNKNOWN_INTENT, entities: []});
  }

  _parseResponse(json: string): Intention {
    const response = JSON.parse(json);

    let topMatchIntent: ?IntentResponse = null;
    response.intents.forEach((intentResponse: IntentResponse) => {
      if (intentResponse.score >= 0.35 &&
          (!topMatchIntent || topMatchIntent.score < intentResponse.score)) {
        topMatchIntent = intentResponse;
      }
    });

    if (!topMatchIntent) {
      return {
        intent: UNKNOWN_INTENT,
        entities: [],
      };
    }

    const entities = [];
    for (let entity of response.entities) {
      if (entity.score >= 0.35) {
        entities.push(entity.entity);
      }
    }

    return {
      intent: topMatchIntent.intent,
      entities: entities,
    };
  }
}
