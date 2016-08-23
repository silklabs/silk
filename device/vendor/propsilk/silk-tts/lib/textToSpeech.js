/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 * @private
 */

import createLog from 'silk-log/device';
import {EventEmitter} from 'events';
import * as https from 'https';
import TtsCache from './tts_cache';
import {uptime} from 'silk-sysutils';
import api from 'silk-device-api';
import {Metric, MetricTypes} from 'silk-api';

import type { SpeechOptions } from 'silk-dialog-script';

const log = createLog('tts');
let options: SpeechOptions;
let ttsCache = new TtsCache();


class TtsRequest extends Metric {
  static NAME = 'tts_request';
  static DESC = 'Measures time for a TtS request';

  constructor(statusCode: number, durationMS: number) {
    super({
      statusCode: new MetricTypes.Integer(statusCode),
      durationMS: new MetricTypes.Integer(Math.floor(durationMS)),
    });
  }
}

/**
 * Call this function once to configure the speech options
 */
export function configureTextToSpeech(speechOptions: SpeechOptions) {
  options = speechOptions;
}

/**
 * This class provides APIs to convert text to speech
 */
export default class TextToSpeech extends EventEmitter {

  constructor() {
    super();
  }

  async startRequest(text: string): Promise<void> {
    log.debug(`startRequest`, text);

    if (!options) {
      this.emit(`error`, `Not configured?`);
      return;
    }

    // Return cached sample if available
    let samples = await ttsCache.get(text);
    if (samples) {
      this.emit(`data`, samples);
      this.emit(`end`);
      return;
    }

    let accessToken;
    try {
      accessToken = await options.getAccessToken();
    } catch (err) {
      this.emit(`error`, err);
      return;
    }
    log.debug(`Got access token`);

    const postData = `<speak version='1.0' xml:lang='en-US'><voice xml:lang='en-US' xml:gender='Female' name='Microsoft Server Speech Text to Speech Voice (en-US, ZiraRUS)'>${text}</voice></speak>`;

    const opts = {
      hostname: options.SPEECH_HOST,
      port: 443,
      path: `/synthesize`,
      method: `POST`,
      headers: {
        'Content-Type': `application/ssml+xml`,
        'X-Microsoft-OutputFormat': `raw-16khz-16bit-mono-pcm`,
        'Authorization': `Bearer ${String(accessToken)}`,
        'X-Search-AppId': options.APP_ID_NO_DASH,
        'X-Search-ClientID': options.INSTANCE_ID_NO_DASH,
        'User-Agent': `silk`,
        'Content-Length': postData.length,
      },
    };

    log.verbose(`Issuing new request`);
    const requestStartUptime = uptime();
    log.debug(`postData`, opts);

    const req = https.request(opts, res => {
      let samples = new Buffer(0);
      res.once(`error`, (error) => this.emit(`error`, error));
      res.on(`data`, (chunk) => {
        this.emit(`data`, chunk);
        samples = Buffer.concat([samples, chunk]);
      });
      res.once(`end`, () => {
        const requestDuration = Math.floor(uptime(requestStartUptime));
        log.verbose(`Response complete ${res.statusCode} in ${requestDuration}ms`);
        api.metrics.add(new TtsRequest(res.statusCode, requestDuration));
        if (res.statusCode !== 200) {
          this.emit(`error`, new Error(`Request failed with status code ` +
                                       `${res.statusCode}`));
        } else {
          this.emit(`end`);
          ttsCache.add(text, samples);
        }
      });
    });

    req.once(`error`, (error) => this.emit(`error`, error));
    req.write(postData);
    req.end();
  }
}
