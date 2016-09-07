/**
 * @flow
 */

import EventEmitter from 'events';
import * as https from 'https';
import createLog from 'silk-log';

import type {Readable} from 'stream';

export type Entity = EntityResponse;
export type Entities = Array<Entity>;

export type Intention = {
  intent: string;
  score: number;
  entities: Entities;
};

export type LuisApp = {
  id: string;
  key: string;
  whitelist?: Array<string>;
};

export type LuisOptions = {
  apps: Array<LuisApp>;
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

type EntityResponse = {
  type: string;
  entity: string;
  startIndex: number;
  endIndex: number;
  score: number;
  resolution: {
    resolution_type: string;
    date: string;
    time: string;
    duration: string;
  };
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
  uiMode = 'normal';
  rtc: EventEmitter = new EventEmitter();

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

  dialogDone(): Promise<void> {
    return Promise.resolve();
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

  _fetchIntention(text: string, id: string, key: string, whitelist?: Array<string>): Promise<Intention> {
    let onError = (resolve, error) => {
      log.warn(error);
      resolve({
        intent: UNKNOWN_INTENT,
        score: 0.0,
        entities: [],
      });
    };

    return new Promise(resolve => {
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
        res.once(`error`, (error) => onError(resolve, error));
        res.on('data', (chunk) => {
          json += chunk;
        });
        res.once('end', () => {
          if (res.statusCode === 200) {
            log.info(`Request complete`);
            log.debug(json);

            let intent;
            try {
              intent = this._parseResponse(json);
            } catch (error) {
              onError(resolve, error);
              return;
            }
            if (!whitelist || (whitelist.indexOf(intent.intent) !== -1)) {
              resolve(intent);
            } else {
              onError(resolve, new Error(`Ignoring blacklisted ${intent.intent}`));
            }
          } else {
            let errorText = `Request failed with status code ${res.statusCode}`;
            onError(resolve, new Error(errorText));
          }
        });
      });

      req.write(data);
      req.end();
    });
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
      let promises = [];
      this._scriptOptions.luisOptions.apps.forEach(app => {
        promises.push(this._fetchIntention(text, app.id, app.key, app.whitelist));
      });

      return Promise.all(promises)
      .then(intentions => {
        let topMatchIntent = {
          intent: UNKNOWN_INTENT,
          score: 0.0,
          entities: [],
        };
        for (let intention of intentions) {
          if (intention.intent !== UNKNOWN_INTENT &&
              intention.intent !== 'None' &&
              intention.intent !== 'builtin.intent.none' &&
              (!topMatchIntent || topMatchIntent.score < intention.score)) {
            topMatchIntent = intention;
          }
        }
        return topMatchIntent;
      });
    }

    log.info(`No intention found`);
    return Promise.resolve({intent: UNKNOWN_INTENT, score: 0.0, entities: []});
  }

  _parseResponse(json: string): Intention {
    const response = JSON.parse(json);

    let topMatchIntent: ?IntentResponse = null;
    response.intents.forEach((intentResponse: IntentResponse) => {
      if (intentResponse.score === undefined) {
        intentResponse.score = 1.0;
      }
      if (intentResponse.score >= 0.35 &&
          (!topMatchIntent || topMatchIntent.score < intentResponse.score)) {
        topMatchIntent = intentResponse;
      }
    });

    if (!topMatchIntent) {
      return {
        intent: UNKNOWN_INTENT,
        score: 0.0,
        entities: [],
      };
    }

    const entities: Array<Entity> = [];
    let entity: EntityResponse;
    for (entity of response.entities) {
      // builtins have undefined scores. Consider no score as high score
      if (entity.score === undefined || entity.score >= 0.35) {
        entities.push(entity);
      }
    }

    return {
      intent: topMatchIntent.intent,
      score: topMatchIntent.score,
      entities: entities,
    };
  }
}
