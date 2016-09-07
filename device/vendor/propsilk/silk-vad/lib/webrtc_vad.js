/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

// $FlowFixMe: Flow doesn't understand importing of a node module
import webrtcvad from '../build/Release/webrtc_vad.node';

import EventEmitter from 'events';
import createLog from 'silk-log/device';
import config from 'silk-config';

import type { MicData } from '..';

const log = createLog('vad');

/**
 * Availabe VAD modes
 */
// (Default mode) Constant for normal voice detection mode. Suitable for high
// bitrate, low-noise data. May classify noise as voice, too
const MODE_NORMAL = 0; // eslint-disable-line
// Detection mode optimised for low-bitrate audio
const MODE_LOW_BITRATE = 1; // eslint-disable-line
// Detection mode best suited for somewhat noisy, lower quality audio
const MODE_AGGRESSIVE = 2; // eslint-disable-line
// Detection mode with lowest miss-rate. Works well for most inputs
const MODE_VERY_AGGRESSIVE = 3; // eslint-disable-line

const VAD_EVENT_SILENCE = 0; // Silence detected
const VAD_EVENT_VOICE = 1; // Voice detected

/**
 * Wrapper class around webrtc_vad node module
 */
export default class WebrtcVad extends EventEmitter {

  _vad: any;
  _listening: boolean = false;
  _sampleRate: number;
  _bytesPerSample: number;
  _numChannels: number;
  _pcmDataQueue: Array<[number, Buffer]>; // Array of [when, pcmData] tuples
  _pcmDataQueueSizeInBytes: number; // Size of all the pcmData buffers in the queue
  _processingInProgress: boolean;
  _backlogMinSizeInBytes: number;

  constructor() {
    super();
    this._sampleRate = config.deviceMic.sampleRate;
    this._bytesPerSample = config.deviceMic.bytesPerSample;
    this._numChannels = config.deviceMic.numChannels;
    this._pcmDataQueue = [];
    this._pcmDataQueueSizeInBytes = 0;
    this._processingInProgress = false;

    // Calculate backlog size for 1 second worth of data
    this._backlogMinSizeInBytes = 1 * this._sampleRate * this._bytesPerSample *
        this._numChannels;

    this._vad = new webrtcvad.Vad();
  }

  /**
   * Initialze webrtc vad
   */
  init(): boolean {
    let result = this._vad.init(this._sampleRate);
    if (result) {
      result = this._vad.setMode(MODE_VERY_AGGRESSIVE);
    }

    return result;
  }

  /**
   * Call this function to add mic-data
   */
  addMicData(pkt: MicData) {
    this._handleMicData(pkt.when, pkt.frames);
  }

  /**
   * Start listening for voice activity
   */
  startListening() {
    if (this._listening) {
      return;
    }

    this._pcmDataQueue.length = 0;
    this._pcmDataQueueSizeInBytes = 0;
    this._listening = true;
  }

  /**
   * Stop listening for the utterance
   */
  stop(): void {
    if (!this._listening) {
      return;
    }

    log.debug(`Stop recognition`);
    this._listening = false;
  }

  /**
   * Receive  mic data and buffer it to be processed at a later time
   */
  _handleMicData(when: number, pcmData: Buffer): void {
    if (!this._listening) {
      return;
    }
    this._pcmDataQueue.push([when, pcmData]);
    this._pcmDataQueueSizeInBytes += pcmData.length;

    // Emit a warning if the queue is backlogged
    if (this._pcmDataQueueSizeInBytes >= this._backlogMinSizeInBytes) {
      const backlogMs = this._pcmDataQueueSizeInBytes /
          (this._sampleRate * this._bytesPerSample * this._numChannels);
      log.warn(`Warning: PCM data backlog of ${backlogMs}secs`);
    }

    if (!this._processingInProgress) {
      this._processingInProgress = true;
      this._processNextSample();
    }
  }

  /**
   * Process next mic data from the queue
   */
  _processNextSample(): void {
    if (this._pcmDataQueue.length === 0) {
      this._processingInProgress = false; // Need more pcm data
      return;
    }
    const [when, pcmData] = this._pcmDataQueue.shift();
    this._pcmDataQueueSizeInBytes -= pcmData.length;

    const callback = (err, result) => {
      log.debug(`Finished processing result: ${result}`);
      let inSpeech = false;
      if (result === VAD_EVENT_SILENCE) {
        inSpeech = false;
      } else if (result === VAD_EVENT_VOICE) {
        inSpeech = true;
      }

      if (inSpeech) {
        this.emit('speech_start', when);
      } else {
        this.emit('speech_stop', when);
      }

      this._processingInProgress = true;
      process.nextTick(() => this._processNextSample()); // Process next sample
    };

    this._vad.processAudio(pcmData, pcmData.length, callback);
  }
}
