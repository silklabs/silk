/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import createLog from 'silk-log';
import {EventEmitter} from 'events';
import * as https from 'https';

import {
  getAccessToken,
  APP_ID_NO_DASH,
  INSTANCE_ID_NO_DASH,
  SPEECH_HOST,
} from './speechAccessToken';

const log = createLog(`dialog-tts`);

export const TEXT_TO_SPEECH_PARAMS = {
  bytesPerSample: 2,
  encoding: `signed-integer`,
  endian: `little`,
  numChannels: 1,
  sampleRate: 16000,
};

export default class TextToSpeech extends EventEmitter {

  _accessToken: ?Object = null;

  constructor(text: string) {
    super();

    this._startRequest(text);
  }

  async _startRequest(text: string): Promise<void> {
    log.debug(`_startRequest`, text);

    const accessToken = (await getAccessToken()).access_token;
    log.debug(`Got access token`);

    const postData = `<speak version='1.0' xml:lang='en-US'><voice xml:lang='en-US' xml:gender='Female' name='Microsoft Server Speech Text to Speech Voice (en-US, ZiraRUS)'>${text}</voice></speak>`;

    const opts = {
      hostname: SPEECH_HOST,
      port: 443,
      path: `/synthesize`,
      method: `POST`,
      headers: {
        'Content-Type': `application/ssml+xml`,
        'X-Microsoft-OutputFormat': `raw-16khz-16bit-mono-pcm`,
        'Authorization': `Bearer ${accessToken}`,
        'X-Search-AppId': APP_ID_NO_DASH,
        'X-Search-ClientID': INSTANCE_ID_NO_DASH,
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
