/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import createLog from 'silk-log/device';
import Input from 'silk-input';
import config from 'silk-config';
import fs from 'mz/fs';
import mkdirp from 'mkdirp-promise';
import wav from 'wav';

import type { Env, Camera } from 'silk-exttest';
import type { FileWriter } from 'wav';

type MicData = {
  when: number;
  frames: Buffer;
};
type MicDataCallback = (pkt: MicData) => void;
type InputEventCallback = (event: { keyId: string }) => void;

const RECORDINGS_PATH = 'data/media/mic';
const MAX_DURATION_MS = 10 * 60 * 1000; // 10 minutes

const log = createLog('silkext-voicerecorder');
let camera: Camera;

/**
 * This extension implements voice recorder
 */
class Recorder {
  _input: Input;
  _ready: boolean = false;
  _writer: ?FileWriter = null;
  _durationTimeoutId: ?number = null;

  constructor(env: Env) {
    camera = env.camera;
    this._input = new Input();

    camera.on('mic-data', this._onMicData);
    this._input.on('down', this._onKeyPress);

    this._init();
  }

  /**
   * @private
   */
  async _init() {
    try {
      if ((await fs.exists(RECORDINGS_PATH)) === false) {
        await mkdirp(RECORDINGS_PATH);
      }
      this._ready = true;
    } catch (err) {
      log.error(err);
    }
  }

  /**
   * Mic-data handler
   */
  _onMicData: MicDataCallback = pkt => {
    if (!this._writer) {
      return;
    }
    const { when, frames } = pkt;
    log.debug(`mic-data: ${frames.length} bytes at ${when}`);
    this._writer.write(frames);
  };

  /**
   * Handle volume key down event
   */
  _onKeyPress: InputEventCallback = event => {
    if (event.keyId !== 'volumedown') {
      return;
    }

    if (!this._ready) {
      log.warn(`Audio recorder not ready yet`);
      return;
    }

    log.debug(`Received key down event ${JSON.stringify(event)}`);
    if (!this._writer) {
      // Set up the max duration timeout
      this._durationTimeoutId = setTimeout(() => this._stopRecording('timeout'),
          MAX_DURATION_MS);

      log.info(`Started audio recording`);
      this._writer = new wav.FileWriter(`${RECORDINGS_PATH}/${Date.now()}.wav`, {
        sampleRate: config.deviceMic.sampleRate,
        channels: config.deviceMic.numChannels,
        bitDepth: config.deviceMic.bytesPerSample * 8,
      });
      this._writer.on('done', () => {
        log.info(`Finished saving audio recording`);
      });
      this._writer.on('error', err => {
        log.error('Failed to write: ', err);
      });
    } else {
      this._stopRecording();
    }
  };

  _stopRecording(reason: string) {
    log.info(`Stopping audio recording, reason: ${reason}`);
    this._cancelDurationTimer();
    if (this._writer) {
      this._writer.end();
      this._writer = null;
    }
  }

  _cancelDurationTimer() {
    if (this._durationTimeoutId) {
      clearTimeout(this._durationTimeoutId);
      this._durationTimeoutId = null;
    }
  }

  willUnload(): void {
    log.info('unloading....');

    camera.removeListener('mic-data', this._onMicData);
    this._input.removeListener('down', this._onKeyPress);
    this._cancelDurationTimer();
  }
}

module.exports = (env: Env) => new Recorder(env);
