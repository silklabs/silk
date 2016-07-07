/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 * @private
 */

import createLog from 'silk-log/device';
import * as https from 'https';
import invariant from 'assert';
import uuid from 'uuid';

import config from 'silk-config';
import type { ConfigDeviceMic } from 'silk-config';
import type { SpeechOptions } from 'silk-dialog-script';

const audioParams = config.deviceMic;

import type {ClientRequest} from 'https';

type Callback = (error: ?Error, text?: string) => void;

const log = createLog('stt');

function generateWavHeader(dataSize: number, options: ConfigDeviceMic) {
  const bytesPerSample = options.bytesPerSample || 2;
  const numChannels = options.numChannels || 1;
  const sampleRate = options.sampleRate || 16000;
  const chunkSize = 36 + dataSize; // header size + dataSize
  const byteRate = sampleRate * bytesPerSample * numChannels;
  const blockAlign = numChannels * bytesPerSample;
  const bitsPerSample = bytesPerSample * 8;

  let hdr = new Buffer(44);
  hdr.writeUInt32BE(0x52494646, 0);          // "RIFF"
  hdr.writeUInt32LE(chunkSize, 4);           // chunk size
  hdr.writeUInt32BE(0x57415645, 8);          // "WAVE"
  hdr.writeUInt32BE(0x666d7420, 12);         // subchunk1 id- "fmt"
  hdr.writeUInt32LE(16, 16);                 // subchunk1 size
  hdr.writeUInt16LE(1, 20);                  // audio format
  hdr.writeUInt16LE(numChannels, 22);        // num channels
  hdr.writeUInt32LE(sampleRate, 24);         // sample rate
  hdr.writeUInt32LE(byteRate, 28);           // byte rate
  hdr.writeUInt16LE(blockAlign, 32);         // block align
  hdr.writeUInt16LE(bitsPerSample, 34);      // bits per sample
  hdr.writeUInt32BE(0x64617461, 36);         // subchunk2 id - "data"
  hdr.writeUInt32LE(dataSize, 40);           // data size

  return hdr;
}

class SpeechToText {

  _cb: ?Callback;
  _req: ?ClientRequest = null;
  _pendingFinish: boolean = false;
  _bufferedSamples: Array<Buffer> = [];
  _options: SpeechOptions;

  configure(options: SpeechOptions) {
    this._options = options;
  }

  _callCallback(error: ?Error, text?: string, confidence?: number): void {
    if (this._cb) {
      this._cb(error, text, confidence);
    }

    this._req = null;
    this._pendingFinish = false;
    this._cb = null;
  }

  async startRequest(cb: Callback): Promise<void> {
    log.debug(`startRequest`);
    if (this._cb) {
      cb(new Error(`Another request is being processed; plese try again`));
      return;
    }

    this._cb = cb;
    if (!this._options) {
      this._callCallback(new Error(`Speech to text not configured?`));
      return;
    }

    let accessToken;
    try {
      accessToken = await this._options.getAccessToken();
    } catch (err) {
      this._callCallback(err);
      return;
    }
    log.debug(`Got access token`);

    const query = this._options.urlEncode({
      version: `3.0`,
      requestid: uuid.v4(), // per request
      appid: this._options.APP_ID,
      format: `json`,
      locale: `en-US`,
      'device.os': `Silk OS`,
      scenarios: `ulm`,
      instanceid: this._options.INSTANCE_ID,
      'result.profanitymarkup': 0, // Fuck marking up profanity
    });

    const opts = {
      hostname: this._options.SPEECH_HOST,
      port: 443,
      path: `/recognize/query?` + query,
      method: `POST`,
      headers: {
        'Content-type': `audio/wav; samplerate=${audioParams.sampleRate}`,
        //'Content-Length' : wav.length,
        'Authorization': `Bearer ${accessToken}`,
      },
    };

    log.info(`Issuing new request`);

    const req = https.request(opts, (res) => {
      let json = ``;
      res.once(`error`, (error) => this._callCallback(error));
      res.on(`data`, chunk => {
        json += chunk;
      });
      res.once(`end`, () => {
        log.info(`Response complete ${res.statusCode}`);
        log.debug(`Response`, json);

        if (res.statusCode !== 200) {
          this._callCallback(new Error(`Request failed with status code ` +
                                       `${res.statusCode}`));
          return;
        }

        let response: ?Object = null;
        try {
          response = JSON.parse(json);
        } catch(error) {
          this._callCallback(error);
          return;
        }

        invariant(response);

        let text = ``;
        let confidence = 0;
        if (response.results && response.results.length > 0) {
          const result = response.results[0];
          text = result.name;
          confidence = result.confidence;
          log.info(`Confidence ${result.confidence}: '${text}'`);
        } else {
          log.warn(`No text`);
          confidence = 1.0;
        }

        this._callCallback(null, text, confidence);
      });
    });

    // Use large length since we don't know how much PCM data will be coming in.
    const hdr =
      generateWavHeader(0x6FFFFFFF, Object.assign({}, audioParams));

    log.info(`Sending wav header`);
    req.write(hdr);

    if (this._bufferedSamples.length) {
      log.info(`Sending buffered PCM data`);
      this._bufferedSamples.forEach((buffer) => {
        req.write(buffer);
      });
      this._bufferedSamples.length = 0;
    }

    if (this._pendingFinish) {
      log.info(`Finishing pending request`);
      req.end();
      return;
    }

    this._req = req;
  }

  write(pcmData: Buffer): void {
    invariant(!this._pendingFinish);

    const req = this._req;
    if (!req) {
      log.debug(`Queuing PCM data: ${pcmData.length} bytes`);
      this._bufferedSamples.push(pcmData);
      return;
    }

    req.write(pcmData);
  }

  finish(): void {
    invariant(!this._pendingFinish);

    const req = this._req;
    if (!req) {
      this._pendingFinish = true;
      log.debug(`Can't finish until we get an access token`);
      return;
    }

    log.info(`Finishing request`);
    req.end();
  }
}

module.exports = new SpeechToText();
