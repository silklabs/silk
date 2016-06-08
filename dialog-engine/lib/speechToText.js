/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import createLog from 'silk-log';
import * as https from 'https';
import invariant from 'assert';
import uuid from 'uuid';

import config from 'silk-config';
const audioParams = config.deviceMic;

import {
  getAccessToken,
  urlEncode,
  APP_ID,
  INSTANCE_ID,
  SPEECH_HOST,
} from './speechAccessToken';

import type {ClientRequest} from 'https';

export type ConfigDeviceMic = {
  bytesPerSample: number;
  encoding: string;
  endian: 'big' | 'little';
  numChannels: number;
  sampleRate: number;
  sampleMin: number;
  sampleMax: number;
};

type Callback = (error: ?Error, text?: string) => void;

const log = createLog(`dialog-stt`);

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


export default class SpeechToText {

  _cb: ?Callback;
  _accessToken: ?Object = null;
  _req: ?ClientRequest = null;
  _finished: boolean = false;
  _pcmSamples: Buffer = new Buffer(0);


  constructor(cb: Callback) {
    this._cb = cb;

    this._startRequest();
  }

  _callCallback(error: ?Error, text?: string): void {
    if (!this._cb) {
      log.error(`Callback was going to be called more than once`, error, text);
      return;
    }

    this._cb(error, text);
    this._cb = null;
  }

  async _startRequest(): Promise<void> {
    log.debug(`_startRequest`);

    const accessToken = (await getAccessToken()).access_token;
    log.debug(`Got access token`);

    if (this._finished) {
      log.debug(`speech-to-text: Request aleady finished`);
      return;
    }

    const query = urlEncode({
      version: `3.0`,
      requestid: uuid.v4(), // per request
      appid: APP_ID,
      format: `json`,
      locale: `en-US`,
      'device.os': `Silk OS`,
      scenarios: `ulm`,
      instanceid: INSTANCE_ID,
      'result.profanitymarkup': 0, // Fuck marking up profanity
    });

    const opts = {
      hostname: SPEECH_HOST,
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
        log.debug(`Response data chunk`, chunk.length);
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
        if (response.results && response.results.length > 0) {
          const result = response.results[0];
          text = result.name;
          log.info(`Confidence ${result.confidence}: '${text}'`);
        } else {
          log.warn(`No text`);
        }

        this._callCallback(null, text);
      });
    });

    // Use large length since we don't know how much PCM data will be coming in.
    const hdr =
      generateWavHeader(0x6FFFFFFF, Object.assign({}, audioParams));

    log.info(`Sending wav header`);
    req.write(hdr);
    if (this._pcmSamples.length > 0) {
      log.info(`Sending queued PCM data: ${this._pcmSamples.length} bytes`);
      req.write(this._pcmSamples);
    }

    this._req = req;
  }

  write(pcmData: Buffer): void {
    invariant(!this._finished);

    const req = this._req;
    if (!req) {
      log.info(`Queuing PCM data: ${pcmData.length} bytes`);
      this._pcmSamples = Buffer.concat([this._pcmSamples, pcmData]); // *shudder*
      return;
    }

    log.debug(`Writing PCM data: ${pcmData.length} bytes`);
    req.write(pcmData);
  }

  finish(): void {
    invariant(!this._finished);
    this._finished = true;

    const req = this._req;
    if (!req) {
      const msg = `Unable to get access token in time, request dropped`;
      log.error(msg);

      this._callCallback(new Error(msg));
      return;
    }


    log.info(`Finishing request`);
    req.end();
  }

}
