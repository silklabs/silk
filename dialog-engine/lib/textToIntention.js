/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 * @private
 */

import createLog from 'silk-log';
import * as https from 'https';

import type {DialogScriptOptions} from './index';

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

type IntentResponse = {
  intent: string;
  score: number;
};

export const UNKNOWN_INTENT = `unknownIntent`;

const log = createLog(`dialog-tti`);

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

export default class TextToIntention {

  _options: DialogScriptOptions;

  constructor(options?: DialogScriptOptions = {}) {
    this._options = options;
  }

  getIntent(text: string): Promise<Intention> {
    log.info(`Finding intent`, text);

    if (this._options.customIntentions) {
      const intention = this._options.customIntentions[text];
      if (intention) {
        log.info(`Found match in custom intentions`, intention);
        return Promise.resolve(intention);
      }
    }

    if (this._options.luisOptions) {
      const {id, key} = this._options.luisOptions;

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
