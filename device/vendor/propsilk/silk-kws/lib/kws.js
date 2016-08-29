/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import fs from 'mz/fs';
import path from 'path';
import assert from 'assert';
import {EventEmitter} from 'events';
import wav from 'wav';
import config from 'silk-config';
import caffe from 'silk-caffe';
import Vibrator from 'silk-vibrator';
import createLog from 'silk-log/device';
import * as util from 'silk-sysutils';
import {MelFeatureExtractor, Framer, Normalizer} from 'mel-features';
import netstatus from 'silk-netstatus';
import SpeechToText from 'silk-stt';
import player from 'silk-audioplayer';
import {
  PosKeywordUploadOperation,
  NegKeywordUploadOperation,
  getOutboxInstance,
} from 'silk-outbox';
import {BufferReadable} from 'silk-streams';

import type {VoiceActivityDetector} from 'silk-vad';
import type {Outbox} from 'silk-outbox';

const log = createLog('kws');

const MODEL_PROTO = path.join(__dirname, '..', 'model', 'keyword.prototxt');
const MODEL_BIN = path.join(__dirname, '..', 'model', 'aristotle.caffemodel');
const MODEL_DICTIONARY = path.join(__dirname, '..', 'model', 'keyword.labels');
const KEYWORDS = path.join(__dirname, '..', 'model', 'keywords.txt');
const TOPK = 3; // Return top K predictions
const HOT_KEYWORD = 'keyword';

// List of possible texts that SpeechToText service converts the `pando`
// audio sample to. All of these are considered as positive samples.
let keywordTexts;

const MEL_COEFFS = 26;
const FFT_SIZE = 512;
const STEP_SIZE = FFT_SIZE / 2;
const NUM_SAMPLES = 70; // Each sample is 16ms

// Kenzo is showing lot of missed with value of 20 while Mako shows the similar
// results with value of 20 or 10. Value of 5 is leading to a longer queue
// as both kenzo and Mako aren't able to process samples fast enough leading
// to delay between the uterrance and the detection. So choosing 10 as it seems
// to be the common denominator
const SKIP_SAMPLES = 10; // Skip these many samples

const WINDOW_SIZE_IN_BYTES = NUM_SAMPLES * STEP_SIZE * 2;

const PCM_BUFFER_SECS = 1000; // How many seconds worth of data to buffer
// Reference: vendor/silk/capture/AudioSourceEmitter.cpp#L17
const PCM_BUFFER_COUNT = PCM_BUFFER_SECS / 100; // 96ms (~100) of buffer per TAG_MIC packet

// Kenzo seems to produce results with lower confidence than with Mako for some
// reason. Also further away the device is lower the confidence is. Keeping
// the threshold to lower value to catch far utterances too.
// Ignore predictions with probability lower than threshold
const KWS_THRESHOLD = 'persist.silk.kws.threshold';
let THRESHOLD = util.getintprop(KWS_THRESHOLD, 50);

const STT_CONFIDENCE_THRESHOLD = 0.35;

const UPLOAD_KEYWORD_WAV = 'persist.silk.kws.upload';
const VAD_ENABLED_PROP = 'persist.silk.kws.vad.enabled';
const WAV_HEADER_CHUNK_SIZE = 4;
const WAV_HEADER_SUBCHUNK2_SIZE = 40;

type SampleType = 'pos' | 'neg';

type MicData = {
  when: number;
  frames: Buffer;
};

/**
 * This class receives mic data stream and tries to detect a specific keyword
 * using keyword spotting with neural networks
 */
export default class KeywordSpotting extends EventEmitter {
  _netCaffe: caffe.Model;
  _spotting: bool = false;
  _predicting: bool = false;
  _extractor: MelFeatureExtractor;
  _framer: Framer;
  _output: Array<Float32Array>;
  _sampleRate:number;
  _bytesPerSample: number;
  _numChannels: number;
  _pcmDataArray: Array<Buffer>;
  _pcmDataSizeInBytes: number;
  _vib: Vibrator;
  _standAlone: boolean;
  _wavDataBuffer: Buffer;
  _uploadEnabled: boolean;
  _onSpeechStart: (when: number) => void;
  _onSpeechStop: (when: number) => void;
  _voiceActivityDetector: VoiceActivityDetector;
  _ready: boolean = false;
  _vadEnabled: boolean = false;
  _outbox: Outbox;

  constructor(voiceActivityDetector: VoiceActivityDetector, standAlone: boolean = false) {
    super();
    this._standAlone = standAlone;
    this._voiceActivityDetector = voiceActivityDetector;
    this._init();
    this._vib = new Vibrator();

    this._sampleRate = config.deviceMic.sampleRate;
    this._bytesPerSample = config.deviceMic.bytesPerSample;
    this._numChannels = config.deviceMic.numChannels;

    this._extractor = new MelFeatureExtractor(MEL_COEFFS, this._sampleRate, FFT_SIZE);
    this._framer = new Framer(STEP_SIZE, FFT_SIZE, (signal) => {
      this._detectKeyword(signal);
    });

    this._uploadEnabled = util.getboolprop(UPLOAD_KEYWORD_WAV, false);
    this._vadEnabled = util.getboolprop(VAD_ENABLED_PROP, false);

    this._pcmDataArray = [];
    this._pcmDataSizeInBytes = 0; // Size of all the pcmData buffers in the queue
    this._output = [];
    this._wavDataBuffer = new Buffer(0); // Array of raw pcmData

    this._outbox = getOutboxInstance();
    this._outbox.registerOperation(PosKeywordUploadOperation);
    this._outbox.registerOperation(NegKeywordUploadOperation);

    this._onSpeechStart = when => {
      this._resumeSpotting();
    };
    this._onSpeechStop = when => {
      this._pauseSpotting(when);
    };
  }

  get MEL_COEFFS(): number {
    return MEL_COEFFS;
  }

  get FFT_SIZE(): number {
    return FFT_SIZE;
  }

  get STEP_SIZE(): number {
    return STEP_SIZE;
  }

  get NUM_SAMPLES(): number {
    return NUM_SAMPLES;
  }

  /**
   * Call this function to add mic-data
   */
  addMicData(pkt: MicData) {
    if (this._voiceActivityDetector) {
      this._voiceActivityDetector.addMicData(pkt);
    }
    this._handleMicData(pkt.when, pkt.frames);
  }

  /**
   * Start keyword spotting
   */
  start() {
    log.info(`Starting kws`);
    this._vib.pattern(50);
    if (this._vadEnabled) {
      this._voiceActivityDetector.setMode('continuous');
      this._voiceActivityDetector.on('speech_start', this._onSpeechStart);
      this._voiceActivityDetector.on('speech_stop', this._onSpeechStop);
    } else {
      this._resumeSpotting();
    }
  }

  /**
   * Stop keyword spotting
   */
  stop() {
    log.info(`Stopping kws`);
    this._voiceActivityDetector.setMode('dialog');
    if (this._vadEnabled) {
      this._voiceActivityDetector.removeListener('speech_start', this._onSpeechStart);
      this._voiceActivityDetector.removeListener('speech_stop', this._onSpeechStop);
    } else {
      this._pauseSpotting();
    }
  }

  /**
   * Load model asynchronously
   * @private
   */
  _loadAsync(modelProto: string, modelBin: string) {
    log.verbose(`Loading keyword spotting model`);
    return new Promise((resolve, reject) => {
      let start = Date.now();
      this._netCaffe.load(modelProto, modelBin, err => {
        if (err) {
          reject(err);
        } else {
          let diff = Date.now() - start;
          log.verbose(`Model loaded in ${diff}ms`);
          resolve();
        }
      });
    });
  }

  /**
   * Make prediction asynchronously
   * @private
   */
  _predictAsync(mat: Array<Array<number>>) {
    if (!this._ready) {
      return Promise.resolve([]);
    }
    return new Promise((resolve, reject) => {
      let start = util.uptime();
      this._netCaffe.predictTopK(mat, TOPK, (err, predictions) => {
        if (err) {
          reject(err);
        } else {
          let diff = Math.round(util.uptime(start));
          log.debug('Prediction:', predictions, 'in', diff, 'ms');

          const label = predictions[0].label;

          // Emit event if a successful keyword is spotted
          if (label === HOT_KEYWORD) {
            const confidence = parseInt((predictions[0].confidence * 100).toFixed(2));
            log.info(`***** ${label} spotted with confidence: ${confidence}%`);
            if (confidence >= THRESHOLD) {
              resolve([label, confidence]);
            } else {
              resolve([]);
            }
          } else {
            resolve([]);
          }
        }
      });
    });
  }

  /**
   * @private
   */
  async _init(): Promise<void> {
    this._netCaffe = new caffe.Model();

    // Load a DNN model
    try {
      // Check if all the required files exist on device
      let exists = fs.exists(MODEL_PROTO);
      if (!exists) {
        log.error(`${MODEL_PROTO} not available on the device`);
        return;
      }

      exists = fs.exists(MODEL_BIN);
      if (!exists) {
        log.error(`${MODEL_BIN} not available on the device`);
        return;
      }

      exists = fs.exists(MODEL_DICTIONARY);
      if (!exists) {
        log.error(`${MODEL_DICTIONARY} not available on the device`);
        return;
      }
      await this._loadAsync(MODEL_PROTO, MODEL_BIN);
      this._netCaffe.setLabels(MODEL_DICTIONARY);

      exists = fs.exists(KEYWORDS);
      if (!exists) {
        log.error(`${KEYWORDS} not available on the device`);
        return;
      }
      let keywordsJson = await fs.readFile(KEYWORDS);
      keywordTexts = JSON.parse(keywordsJson);
    } catch (err) {
      log.error(`Failed to load caffe model err: ${err}`);
      return;
    }
    this._ready = true;
    this.emit('ready');
  }

  /**
   * Receive  mic data and buffer it to be processed at a later time
   * @private
   */
  _handleMicData(when: number, pcmData: Buffer) {
    this._pcmDataArray.push(pcmData);
    this._pcmDataSizeInBytes += pcmData.length;

    // Keep around PCM_BUFFER_SECS worth of data in the ring buffer
    if (!this._spotting && (this._pcmDataArray.length > PCM_BUFFER_COUNT)) {
      while (this._pcmDataArray.length > PCM_BUFFER_COUNT) {
        this._pcmDataArray.shift();
        this._pcmDataSizeInBytes -= pcmData.length;
      }
    }
    process.nextTick(() => this._processNextSample());
  }

  /**
   * Process next mic data from the queue
   */
  _processNextSample() {
    if (!this._spotting) {
      return;
    }
    if (this._pcmDataArray.length === 0) {
      // Waiting for more PCM data
      return;
    }

    // Start processing pcm data
    const pcmData = this._pcmDataArray.shift();
    this._pcmDataSizeInBytes -= pcmData.length;

    // Convert the raw pcm data into Float32Array of [-1, 1]
    let samples = new Int16Array(pcmData.length / 2);
    for (let i = 0; i < samples.length; ++i) {
      samples[i] = pcmData.readInt16LE(2 * i);
    }
    let wavData = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; ++i) {
      wavData[i] = (samples[i] < 0) ? (samples[i] / 32768) : (samples[i] / 32767);
    }

    // Store raw PCM data
    if (this._uploadEnabled) {
      this._wavDataBuffer = Buffer.concat([this._wavDataBuffer, pcmData]);
    }

    this._framer.addData(wavData);

    // Process next sample
    process.nextTick(() => this._processNextSample());
  }

  /**
   * Process audio samples from the framer. Framer calls this function everytime
   * it has FFT_SIZE samples available.
   *
   * @private
   */
  _detectKeyword(signal: Float32Array) {
    assert(signal.length === FFT_SIZE);

    // Extract mel features
    let features = this._extractor.process(signal);
    this._output.push(features);

    if (!this._predicting) {
      this._predicting = true;
      this._processNextWindow();
    }
  }

  /**
   * Process next window of size NUM_SAMPLES x MEL_COEFFS. Once we have enough
   * samples we run caffe prediction on it to detect keyword.
   * @private
   */
  async _processNextWindow(): Promise<void> {
    assert(this._predicting);
    // Wait to collect enough samples before running keyword detection on it
    if (this._output.length < NUM_SAMPLES) {
      this._predicting = false;
      return;
    }
    let output = this._output.slice(0, NUM_SAMPLES);
    output = output.map(features => Array.prototype.slice.call(features));

    // Normalize samples per window
    let normalizer = new Normalizer();
    output.forEach(features => normalizer.track(features));
    output.forEach(features => normalizer.apply(features, features));

    let skipCount = SKIP_SAMPLES;
    try {
      let [label, confidence] = await this._predictAsync(output);
      if (label && (label === HOT_KEYWORD)) {
        await this._playHotKeywordSound();
        this._saveAsWav();
        this._onKeywordDetected();
        this.emit(label, { when: Date.now(), confidence});

        // Skip an entire window of samples to prevent same keyword to be
        // spotted again. In a non-standalone mode (w/ dialog extension) the
        // kws is stopped right after a successful prediction so this doesn't matter
        if (this._standAlone) {
          skipCount = NUM_SAMPLES;
        }
      }
    } catch (err) {
      log.error(`Prediction failed err: ${err.stack}||${err}`);
    }

    // Skip a few samples
    this._output.splice(0, skipCount);
    if (this._uploadEnabled) {
      let bytesToSkip = skipCount * STEP_SIZE * 2;
      this._wavDataBuffer = this._wavDataBuffer.slice(bytesToSkip);
    }

    process.nextTick(() => this._processNextWindow()); // Process next sample
  }

  /**
   * Play a sound when hot keyword is detected
   */
  _playHotKeywordSound() {
    if (this._standAlone) {
      return player.play(path.join(__dirname, '..', 'media',
          'hotkeyword_detected.mp3'));
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Stop listening for the keyword
   */
  _pauseSpotting() {
    if (!this._spotting) {
      log.warn(`Already not spotting`);
      return;
    }
    log.debug(`Pause spotting`);
    this._spotting = false;
  }

  /**
   * Start listening for the keyword
   */
  _resumeSpotting() {
    if (this._spotting) {
      log.warn(`Already spotting`);
      return;
    }
    log.debug(`Resume spotting`);
    this._spotting = true;
    this._pcmDataArray = [];
    this._pcmDataSizeInBytes = 0;
    this._output = [];
    this._wavDataBuffer = new Buffer(0);
  }

  /**
   * Stop processsing data as soon as keyword is detected
   */
  _onKeywordDetected() {
    if (this._standAlone) {
      return;
    }
    this._output = []; // Clear buffer to stop predictions right away
    this._spotting = false;
  }

  /**
   * Run speech to text service to qualify the keyword and then save the pcm
   * samples to the file
   */
  _saveAsWav(): void {
    if (this._uploadEnabled && (netstatus.online || this._standAlone)) {
      let pcmData = new Buffer(WINDOW_SIZE_IN_BYTES);
      this._wavDataBuffer.copy(pcmData);

      let stt = new SpeechToText();
      stt.startRequest((error, text = '', confidence = 0) => {
        if (error) {
          log.error('Not saving the keyword: ', error);
          return;
        }
        log.debug(`Speech to text service detected: ${text}, confidence: ${confidence}`);
        let sampleType = this._isAKeyword(text, keywordTexts) ? 'pos' : 'neg';
        if (confidence >= STT_CONFIDENCE_THRESHOLD) {
          this._uploadWav(sampleType, pcmData);
        } else {
          log.warn(`Not saving the keyword ${confidence}`);
        }
      });
      log.debug(`Converting keyword to text`);
      stt.write(pcmData);
      stt.finish();
    }
  }

  /**
   * Check if the text matches any of the strings or its substrings in the list
   * of know keywords and its variants as returned by speech-to-text service
   */
  _isAKeyword(text: string, keywords: Array<string>) {
    for (let i = 0; i < keywords.length; i++) {
      let keyword = keywords[i];
      if (text.indexOf(keyword) !== -1) {
        log.debug(`Keyword match`);
        return true;
      }
    }
    log.debug(`No keyword match found`);
    return false;
  }

  /**
   * Upload wav data to the server
   */
  _uploadWav(sampleType: SampleType, pcmData: Buffer): void {
    let wavData = new Buffer(0);
    let writer = new wav.Writer({
      sampleRate: this._sampleRate,
      channels: this._numChannels,
      bitDepth: this._bytesPerSample * 8,
    });
    writer.on('data', samples => {
      wavData = Buffer.concat([wavData, samples]);
    });
    writer.on('header', header => {
      // Overwrite the wav data length with the correct header information
      let size = header.readInt32LE(WAV_HEADER_SUBCHUNK2_SIZE);
      wavData.writeInt32LE(36 + size, WAV_HEADER_CHUNK_SIZE);
      wavData.writeInt32LE(size, WAV_HEADER_SUBCHUNK2_SIZE);

      let op;
      if (sampleType === 'pos' ) {
        op = new PosKeywordUploadOperation({
          size: wavData.length,
          metadata: {
            metaType: PosKeywordUploadOperation.META_TYPE,
            startUTC: Date.now(),
          },
        });
      } else {
        op = new NegKeywordUploadOperation({
          size: wavData.length,
          metadata: {
            metaType: NegKeywordUploadOperation.META_TYPE,
            startUTC: Date.now(),
          },
        });
      }

      this._outbox.addToQueue(op, new BufferReadable(wavData));
    });
    writer.on('error', err => {
      log.error(err);
    });
    writer.write(pcmData);
    writer.end();
  }
}
