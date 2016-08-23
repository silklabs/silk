/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 * @private
 */

import * as https from 'https';
import createLog from 'silk-log/device';
import {uptime} from 'silk-sysutils';
import api from 'silk-device-api';
import {Metric, MetricTypes} from 'silk-api';

import type {DialogScriptOptions} from './index';

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

class LuisRequest extends Metric {
  static NAME = 'luis_request';
  static DESC = 'Measures time for a Luis request';

  constructor(statusCode: number, durationMS: number) {
    super({
      statusCode: new MetricTypes.Integer(statusCode),
      durationMS: new MetricTypes.Integer(Math.floor(durationMS)),
    });
  }
}

export default class TextToIntention {

  _options: DialogScriptOptions;

  constructor(options?: DialogScriptOptions = {}) {
    this._options = options;
  }

  _fetchIntention(text: string, id: string, key: string, whitelist?: Array<string>): Promise<Intention> {
    let onError = (resolve, error) => {
      log.error(error.message);
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

      log.verbose(`Issuing luis request`);
      log.debug(`options`, opts);
      const requestStartUptime = uptime();

      const req = https.request(opts, (res) => {
        let json = '';
        res.once(`error`, (error) => onError(resolve, error));
        res.on('data', (chunk) => {
          json += chunk;
        });
        res.once('end', () => {
          const requestDuration = Math.floor(uptime(requestStartUptime));
          api.metrics.add(new LuisRequest(res.statusCode, requestDuration));
          if (res.statusCode === 200) {
            log.verbose(`Luis request complete in ${requestDuration}ms`);
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

      req.once(`error`, (error) => onError(resolve, error));
      req.write(data);
      req.end();
    });
  }

  getIntent(text: string): Promise<Intention> {
    log.verbose(`Finding intent`, text);

    if (this._options.customIntentions) {
      const intention = this._options.customIntentions[text];
      if (intention) {
        log.info(`Found match in custom intentions`, intention);
        return Promise.resolve(intention);
      }
    }

    if (this._options.luisOptions) {
      let promises = [];
      this._options.luisOptions.apps.forEach(app => {
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
              topMatchIntent.score < intention.score) {
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
      // builtins have undefined scores. Consider no score as high score
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
