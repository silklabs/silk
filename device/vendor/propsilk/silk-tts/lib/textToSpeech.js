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

import type { SpeechOptions } from 'silk-dialog-script';

const log = createLog('tts');
let options: SpeechOptions;

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

    log.info(`Issuing new request`);
    log.debug(`postData`, opts);

    const req = https.request(opts, res => {
      res.once(`error`, (error) => this.emit(`error`, error));
      res.on(`data`, (chunk) => {
        this.emit(`data`, chunk);
      });
      res.once(`end`, () => {
        log.info(`Response complete ${res.statusCode}`);
        if (res.statusCode !== 200) {
          this.emit(`error`, new Error(`Request failed with status code ` +
                                       `${res.statusCode}`));
        } else {
          this.emit(`end`);
        }
      });
    });

    req.once(`error`, (error) => this.emit(`error`, error));
    req.write(postData);
    req.end();
  }
}
