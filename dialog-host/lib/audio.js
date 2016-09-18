/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * Flow disabled because `speaker` package isn't normally installed.
 * @noflow
 */

import ClosingPassThrough from 'silk-streams/src/closing_passthrough';
import config from 'silk-config';
import createLog from 'silk-log';
import createMic from 'mic';
import {EventEmitter} from 'events';
import invariant from 'assert';
import readline from 'readline';
import Speaker from 'speaker';

import beep from './beep';

import type {Interface as ReadlineInterface} from 'readline';
import type {Readable} from 'stream';

type Mic = EventEmitter & {
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  getAudioStream(): Readable;
};

const log = createLog(`dialog-audio`);

const SPEAKER_PARAMS = {
  bytesPerSample: 16,
  signed: true,
  channels: 1,
  sampleRate: 16000,
};

export default class Audio extends EventEmitter {

  _rl: ReadlineInterface;
  _mic: Mic;
  _waiting: boolean = false;
  _micStream: ?ClosingPassThrough = null;

  constructor() {
    super();

    this._rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const audioParams = config.deviceMic;

    this._mic = createMic({
      bitwidth: audioParams.bytesPerSample * 8,
      encoding: audioParams.encoding,
      endian: audioParams.endian,
      channels: audioParams.numChannels,
      rate: audioParams.sampleRate,
      exitOnSilence: 4,
    });

    const micStream = this._mic.getAudioStream();

    micStream.on('pauseComplete', () => this._onMicPause());
    micStream.on('resumeComplete', () => this._onMicResume());
    micStream.on(`data`, (data) => this._onMicData(data));
    micStream.on(`silence`, () => this._onMicSilence());

    this._mic.start();
    this._mic.pause();
  }

  _waitForWake(): void {
    if (this._waiting) {
      log.debug(`Already waiting for wake`);
      return;
    }
    this._waiting = true;

    log.debug(`Waiting for wake`);

    const callback = () => {
      this._onWake();
    };

    this._rl.question(`\nPress enter to simulate wake word detection`,
                      callback);
  }

  async _onWake(): Promise<void> {
    invariant(this._waiting);
    this._waiting = false;

    await beep(`startListen`);
    this._mic.resume();
  }

  _onMicResume(): void {
    invariant(!this._waiting);

    log.info(`Microphone enabled`);

    const stream = new ClosingPassThrough();

    invariant(!this._micStream);
    this._micStream = stream;

    this.emit(`speech`, stream);
  }

  _onMicData(data: Buffer): void {
    invariant(data);
    invariant(!this._waiting);

    const stream = this._micStream;
    invariant(stream);

    log.debug(`Mic data`, data.length);
    stream.write(data);
  }

  _onMicSilence(): void {
    invariant(!this._waiting);

    const stream = this._micStream;
    invariant(stream);

    process.nextTick(() => stream.end());

    this._mic.pause();
  }

  async _onMicPause(): Promise<void> {
    invariant(!this._waiting);

    const stream = this._micStream;
    this._micStream = null;

    if (stream) {
      log.info(`Microphone disabled`);
      await beep('stopListen');
    }

    this._waitForWake();
  }

  // eslint-disable-next-line no-undef
  speak(stream: Readable, nextState: DialogState): void {
    invariant(stream);

    const speaker = new Speaker(SPEAKER_PARAMS);

    let speakerErrorListener: ?Function = null;
    let speakerCloseListener: ?Function = null;
    let streamErrorListener: ?Function = null;

    const finish = () => {
      invariant(speakerErrorListener);
      invariant(speakerCloseListener);
      invariant(streamErrorListener);

      speaker.removeListener(`error`, speakerErrorListener);
      speaker.removeListener(`close`, speakerCloseListener);
      stream.removeListener(`error`, streamErrorListener);

      speaker.end();

      if (nextState === 'waiting') {
        this._onWake();
      } else if (nextState === 'idle') {
        this._waitForWake();
      }
    };

    speakerErrorListener = (error) => {
      log.error(`Speaker error`, error);
      finish();
    };
    speakerCloseListener = () => {
      log.debug(`Finished playing sound`);
      finish();
    };
    streamErrorListener = (error) => {
      log.error(`Stream error`, error);
      finish();
    };

    speaker.addListener(`error`, speakerErrorListener);
    speaker.addListener(`close`, speakerCloseListener);
    stream.addListener(`error`, streamErrorListener);

    stream.pipe(speaker);
  }

}
