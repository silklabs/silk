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
import * as util from 'silk-sysutils';
import {PosKeywordUploadOperation, getOutboxInstance} from 'silk-outbox';
import {BufferReadable} from 'silk-streams';
import path from 'path';
import fs from 'mz/fs';
import api from 'silk-device-api';
import {Metric, MetricTypes} from 'silk-api';

import config from 'silk-config';
import type { ConfigDeviceMic } from 'silk-config';
import type { SpeechOptions } from 'silk-dialog-script';
import type {Outbox} from 'silk-outbox';

const audioParams = config.deviceMic;

import type {ClientRequest} from 'https';
export type UtteranceType = 'keyword_pos' | 'unknown';

type Callback = (error: ?Error, text?: string) => void;

const log = createLog('stt');
let options: SpeechOptions;

class SttRequest extends Metric {
  static NAME = 'stt_request';
  static DESC = 'Measures time for a StT request';

  constructor(statusCode: number, durationMS: number) {
    super({
      statusCode: new MetricTypes.Integer(statusCode),
      durationMS: new MetricTypes.Integer(Math.floor(durationMS)),
    });
  }
}

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

/**
 * Call this function once to configure the speech options
 */
export function configureSpeechToText(speechOptions: SpeechOptions) {
  options = speechOptions;
}

/**
 * This class provides APIs to convert speech to text
 */
export default class SpeechToText {

  _cb: ?Callback;
  _req: ?ClientRequest = null;
  _pendingFinish: boolean = false;
  _bufferedSamples: Array<Buffer> = [];
  _saveEnabled: boolean;
  _utteranceType: UtteranceType;
  _wavDataBuffer: Buffer;
  _requestStartUptime: number;
  _outbox: Outbox;

  constructor() {
    this._outbox = getOutboxInstance();
  }

  _callCallback(error: ?Error, text?: string, confidence?: number): void {
    if (this._cb) {
      this._cb(error, text, confidence);
    }

    if (!error && this._saveEnabled) {
      this._saveUtterance();
    }

    this._req = null;
    this._pendingFinish = false;
    this._cb = null;
  }

  async startRequest(cb: Callback, save: boolean = false,
      type: UtteranceType = 'unknown'): Promise<void> {
    log.debug(`startRequest`);
    if (this._cb) {
      cb(new Error(`Another request is being processed; plese try again`));
      return;
    }

    this._cb = cb;
    this._saveEnabled = save;
    this._utteranceType = type;
    this._wavDataBuffer = new Buffer(0);

    if (!options) {
      this._callCallback(new Error(`Speech to text not configured?`));
      return;
    }

    let accessToken;
    try {
      accessToken = await options.getAccessToken();
    } catch (err) {
      this._callCallback(err);
      return;
    }
    log.debug(`Got access token`);

    const query = options.urlEncode({
      cid: options.CRIS_ID, // only needed for CRIS, else no-op
      version: `3.0`,
      requestid: uuid.v4(), // per request
      appid: options.APP_ID,
      format: `json`,
      locale: `en-US`,
      'device.os': `Silk OS`,
      scenarios: `ulm`,
      instanceid: options.INSTANCE_ID,
      'result.profanitymarkup': 0, // Fuck marking up profanity
    });

    let host = options.SPEECH_HOST;
    let path = options.SPEECH_STT_PATH;

    if (options.STT_USE_CRIS) {
      host = options.CRIS_HOST;
      path = options.CRIS_STT_PATH;
    }

    const opts = {
      hostname: host,
      port: 443,
      path: path + '?' + query,
      method: `POST`,
      headers: {
        'Content-type': `audio/wav; samplerate=${audioParams.sampleRate}`,
        //'Content-Length' : wav.length,
        'Authorization': `Bearer ${String(accessToken)}`,
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
        const requestDuration = Math.floor(util.uptime(this._requestStartUptime));
        log.info(`Response complete ${res.statusCode} in ${requestDuration}ms`);
        log.debug(`Response`, json);
        api.metrics.add(new SttRequest(res.statusCode, requestDuration));

        if (res.statusCode !== 200) {
          this._callCallback(new Error(`Request failed with status code ` +
                                       `${res.statusCode}`));
          return;
        }

        let response: ?Object = null;
        try {
          response = JSON.parse(json);
        } catch (error) {
          this._callCallback(error);
          return;
        }

        invariant(response);

        // Handle response error
        if (response.header.status !== 'success' ) {
          log.warn(response.header.properties);
          this._callCallback(null, '', 1.0);
          return;
        }

        if (response.results && response.results.length > 0) {
          const result = response.results[0];
          const text = result.name;
          const confidence = result.confidence;
          log.info(`Confidence ${result.confidence}: '${text}'`);
          this._callCallback(null, text, confidence);
        } else {
          this._callCallback(new Error(`Request failed with empty results`));
        }
      });
    });
    req.once(`error`, (error) => this._callCallback(error));

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
      this._requestStartUptime = util.uptime();
      req.end();
      return;
    }

    this._req = req;
  }

  write(pcmData: Buffer): void {
    invariant(!this._pendingFinish);
    if (this._saveEnabled) {
      this._wavDataBuffer = Buffer.concat([this._wavDataBuffer, pcmData]);
    }

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
    this._requestStartUptime = util.uptime();
    req.end();
  }

  /**
   * Save utterance based on utterance type
   */
  _saveUtterance(): void {
    const hdr = generateWavHeader(this._wavDataBuffer.length, Object.assign({},
        audioParams));
    let wavData = Buffer.concat([hdr, this._wavDataBuffer]);

    if (this._utteranceType === 'keyword_pos') {
      let op = new PosKeywordUploadOperation({
        size: wavData.length,
        metadata: {
          metaType: PosKeywordUploadOperation.META_TYPE,
          startUTC: Date.now(),
        },
      });
      this._outbox.addToQueue(op, new BufferReadable(wavData));
    } else {
      // Unknown type of utterance; save it in a file
      fs.writeFile(path.join('data', 'media', `speech_${Date.now()}.wav`), wavData)
      .catch(err => log.error(err));
    }
  }
}
