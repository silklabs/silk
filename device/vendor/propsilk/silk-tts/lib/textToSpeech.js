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

class TextToSpeech extends EventEmitter {

  _options: SpeechOptions;

  constructor() {
    super();
  }

  configure(options: SpeechOptions) {
    this._options = options;
  }

  async startRequest(text: string): Promise<void> {
    log.debug(`startRequest`, text);

    if (!this._options) {
      this.emit(`error`, `Not configured?`);
      return;
    }

    const accessToken = await this._options.getAccessToken();
    log.debug(`Got access token`);

    const postData = `<speak version='1.0' xml:lang='en-US'><voice xml:lang='en-US' xml:gender='Female' name='Microsoft Server Speech Text to Speech Voice (en-US, ZiraRUS)'>${text}</voice></speak>`;

    const opts = {
      hostname: this._options.SPEECH_HOST,
      port: 443,
      path: `/synthesize`,
      method: `POST`,
      headers: {
        'Content-Type': `application/ssml+xml`,
        'X-Microsoft-OutputFormat': `raw-16khz-16bit-mono-pcm`,
        'Authorization': `Bearer ${accessToken}`,
        'X-Search-AppId': this._options.APP_ID_NO_DASH,
        'X-Search-ClientID': this._options.INSTANCE_ID_NO_DASH,
        'User-Agent': `silk`,
        'Content-Length': postData.length,
      },
    };

    log.info(`Issuing new request`);
    log.debug(`postData`, opts);

    const req = https.request(opts, res => {
      res.once(`error`, (error) => this.emit(`error`, error));
      res.on(`data`, (chunk) => {
        log.debug(`Response data chunk`, chunk.length);
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

    req.write(postData);
    req.end();
  }
}

module.exports = new TextToSpeech();

