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
import config from 'silk-config';
import caffe from 'silk-caffe';
import { MelFeatureExtractor, Framer, Normalizer } from 'mel-features';
import Vibrator from 'silk-vibrator';

import type { Env, Util, Log, Timeline, Camera } from 'silk-exttest/interface/env';

let log: Log;
let timeline: Timeline;
let camera: Camera;

const MODEL_PROTO = path.join(__dirname, '..', 'model', 'keyword.prototxt');
const MODEL_BIN = path.join(__dirname, '..', 'model', 'keyword.caffemodel');
const MODEL_DICTIONARY = path.join(__dirname, '..', 'model', 'keyword.labels');
const TOPK = 3; // Return top K predictions
const HOT_KEYWORD = 'keyword';
const CRY = 'cry';

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

// Kenzo seems to produce results with lower confidence than with Mako for some
// reason. Also further away the device is lower the confidence is. Keeping
// the threshold to lower value to catch far utterances too.
const THRESHOLD = 50; // Ignore predictions with probability lower than threshold

type MicData = {
  when: number;
  frames: Buffer;
};

/**
 * This class receives mic data stream and tries to detect a specific keyword
 * using keyword spotting with neural networks
 */
class KeywordSpotting extends EventEmitter {
  _env: Env;
  _util: Util;
  _netCaffe: caffe.Model;
  _processing: bool;
  _predicting: bool;
  _onMicData: (pkt: MicData) => void;
  _extractor: MelFeatureExtractor;
  _framer: Framer;
  _output: Array<Float32Array>;
  _sampleRate:number;
  _bytesPerSample: number;
  _numChannels: number;
  _lastWhen: number;
  _pcmDataQueue: Array<Float32Array>;
  _pcmDataQueueSizeInBytes: number;
  _backlogMinSizeInBytes: number;
  _suspended: boolean;
  _onSpeechStop: (when: number) => void;
  _vib: Vibrator;

  constructor(env: Env) {
    super();
    this._env = env;
    this._util = env.util;
    log = this._env.log;
    timeline = this._env.timeline;
    camera = this._env.camera;
    this._processing = false;
    this._predicting = false;
    this._init();
    this._lastWhen = 0;
    this._vib = new Vibrator();

    this._sampleRate = config.deviceMic.sampleRate;
    this._bytesPerSample = config.deviceMic.bytesPerSample;
    this._numChannels = config.deviceMic.numChannels;

    this._extractor = new MelFeatureExtractor(MEL_COEFFS, this._sampleRate, FFT_SIZE);
    this._framer = new Framer(STEP_SIZE, FFT_SIZE, (signal) => {
      this._detectKeyword(signal);
    });

    this._pcmDataQueue = []; // Array of pcmData
    this._pcmDataQueueSizeInBytes = 0; // Size of all the pcmData buffers in the queue
    // Calculate backlog size for 1 second worth of data
    this._backlogMinSizeInBytes = 1 * this._sampleRate * this._bytesPerSample;

    this._output = [];
    this._suspended = false;

    // Setup listener for handing mic data and speech
    this._onMicData = pkt => {
      this._handleMicData(pkt.when, pkt.frames);
    };
    this._onSpeechStop = when => {
      this._resumeSpotting(when);
    };
  }

  /**
   *
   */
  willUnload() {
    camera.removeListener('mic-data', this._onMicData);
    timeline.removeListener('dialog_stop', this._onSpeechStop);
  }

  get MEL_COEFFS() {
    return MEL_COEFFS;
  }

  get FFT_SIZE() {
    return FFT_SIZE;
  }

  get STEP_SIZE() {
    return STEP_SIZE;
  }

  get NUM_SAMPLES() {
    return NUM_SAMPLES;
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
  _predictAsync(mat) {
    return new Promise((resolve, reject) => {
      let start = Date.now();
      this._netCaffe.predictTopK(mat, TOPK, (err, predictions) => {
        if (err) {
          reject(err);
        } else {
          let diff = Date.now() - start;
          log.debug(`Prediction: ${JSON.stringify(predictions)} in ${diff}ms`);

          const label = predictions[0].label;
          const confidence = parseInt((predictions[0].confidence * 100).toFixed(2));

          // Add object to timeline if a successful keyword is spottted
          if (((label === CRY) || (label === HOT_KEYWORD)) &&
              (confidence >= THRESHOLD)) {
            let diff = Date.now() - this._lastWhen;
            this._lastWhen = Date.now();
            if (diff < NUM_SAMPLES * 8) {
              log.debug(`Ignore ${HOT_KEYWORD} potentially from the same utterance ${confidence}%?`);
              resolve();
              return;
            }
            log.info(`${label} spotted with confidence: ${confidence}%`);
            timeline.addObjects([{
              source: 'kws',
              tag: label,
              when: Date.now(),
            }]);
            if (label === HOT_KEYWORD) {
              this._playHotKeywordSound();

              // Pause spotting in anticipation of a dialog
              this._pauseSpotting();
            }
          }
          resolve();
        }
      });
    });
  }

  /**
   * @private
   */
  async _init() {
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
    } catch (err) {
      log.error(`Failed to load caffe model err: ${err}`);
      return;
    }
    this.emit('ready');
    camera.on('mic-data', this._onMicData);
  }

  /**
   * Receive  mic data and buffer it to be processed at a later time
   * @private
   */
  _handleMicData(when: number, pcmData: Buffer) {
    log.debug(`Adding ${pcmData.length} samples to framer`);

    // Convert the raw pcm data into Float32Array of [-1, 1]
    let samples = new Int16Array(pcmData.length / 2);
    for (let i = 0; i < samples.length; ++i) {
      samples[i] = pcmData.readInt16LE(2 * i);
    }
    let rawData = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; ++i) {
      rawData[i] = (samples[i] < 0) ? (samples[i] / 32768) : (samples[i] / 32767);
    }

    this._pcmDataQueue.push(rawData);
    this._pcmDataQueueSizeInBytes += rawData.length;

    if (this._pcmDataQueueSizeInBytes >= this._backlogMinSizeInBytes) {
      const backlogMs = this._pcmDataQueueSizeInBytes /
          this._sampleRate * this._bytesPerSample * this._numChannels;
      log.warn(`Warning: PCM data backlog of ${backlogMs}secs`);
    }

    if (!this._processing) {
      this._processing = true;
      this._processNextSample();
    }
  }

  /**
   * Process next mic data from the queue
   */
  _processNextSample() {
    if (this._pcmDataQueue.length === 0) {
      this._processing = false; // Need more pcm data
      return;
    }
    let rawData = this._pcmDataQueue.shift();
    this._pcmDataQueueSizeInBytes -= rawData.length;

    this._framer.addData(rawData);

    // Process next sample
    process.nextTick(() => this._processNextSample());
  }

  /**
   * Process audio samples from the framer. Framer calls this function everytime
   * it has FFT_SIZE samples available.
   *
   * @private
   */
  _detectKeyword(signal) {
    if (this._suspended) {
      return;
    }
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
  async _processNextWindow() {
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

    try {
      log.debug(`Running prediction`);
      await this._predictAsync(output);
    } catch (err) {
      log.error(`Prediction failed err: ${err}`);
    }
    this._output.splice(0, SKIP_SAMPLES); // Skip a few samples
    process.nextTick(() => this._processNextWindow()); // Process next sample
  }

  /**
   * Play a sound when hot keyword is detected
   */
  _playHotKeywordSound() {
    return this._util.playSound(path.join(__dirname, '..', 'media',
        'hotkeyword_detected.mp3'));
  }

  /**
   * Stop listening for the keyword
   */
  _pauseSpotting() {
    log.debug(`Pause spotting`);
    camera.removeListener('mic-data', this._onMicData);
    this._output = []; // Clear the queue
    this._suspended = true; // Suspend any framer activity

    // Register for `speech` events
    timeline.on('dialog_stop', this._onSpeechStop);
  }

  /**
   * Start listening for the keyword
   */
  _resumeSpotting(when) {
    log.debug(`Resume spotting ${when}`);
    this._vib.pattern(50);
    this._suspended = false;
    camera.on('mic-data', this._onMicData);
    timeline.removeListener('dialog_stop', this._onSpeechStop);
  }
}

module.exports = (env: Env): any => new KeywordSpotting(env);
