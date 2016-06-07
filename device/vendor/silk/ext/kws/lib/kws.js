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
import wav from 'wav';

import type { Env, Util, Log, Timeline, Camera } from 'silk-exttest';

let log: Log;
let timeline: Timeline;
let camera: Camera;

const MODEL_PROTO = path.join(__dirname, '..', 'model', 'keyword.prototxt');
const MODEL_BIN = path.join(__dirname, '..', 'model', 'keyword.caffemodel');
const MODEL_DICTIONARY = path.join(__dirname, '..', 'model', 'keyword.labels');
const TOPK = 3; // Return top K predictions
const HOT_KEYWORD = 'keyword';

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

const RAW_BYTES_TO_SKIP = SKIP_SAMPLES * STEP_SIZE * 2;
const WINDOW_SIZE_IN_BYTES = NUM_SAMPLES * STEP_SIZE * 2;

const PCM_BUFFER_SECS = 1000; // How many seconds worth of data to buffer
// Reference: vendor/silk/capture/AudioSourceEmitter.cpp#L17
const PCM_BUFFER_COUNT = PCM_BUFFER_SECS / 100; // 96ms (~100) of buffer per TAG_MIC packet

// Kenzo seems to produce results with lower confidence than with Mako for some
// reason. Also further away the device is lower the confidence is. Keeping
// the threshold to lower value to catch far utterances too.
const THRESHOLD = 80; // Ignore predictions with probability lower than threshold

// Allow continuous keyword spotting if dialog is disabled
const DIALOG_ENABLED_PROP = 'persist.silk.dialog.enabled';

const SAVE_KEYWORD_WAV = 'persist.silk.kws.save';

type MicData = {
  when: number;
  frames: Buffer;
};

type VadMode = 'continuous' | 'dialog';

/**
 * This class receives mic data stream and tries to detect a specific keyword
 * using keyword spotting with neural networks
 */
class KeywordSpotting extends EventEmitter {
  _env: Env;
  _util: Util;
  _netCaffe: caffe.Model;
  _spotting: bool = false;
  _predicting: bool = false;
  _onMicData: (pkt: MicData) => void;
  _extractor: MelFeatureExtractor;
  _framer: Framer;
  _output: Array<Float32Array>;
  _sampleRate:number;
  _bytesPerSample: number;
  _numChannels: number;
  _pcmDataArray: Array<[number, Buffer]>;
  _pcmDataSizeInBytes: number;
  _vib: Vibrator;
  _dialogEnabled: boolean;
  _wavDataBuffer: Buffer;
  _saveEnabled: boolean;
  _onSpeechStart: (when: number) => void;
  _onSpeechStop: (when: number) => void;
  _onDialogStop: () => void;
  _vadMode: VadMode;
  _speechStartWhen: number;
  _speechStopWhen: number;
  _waitingForPcmData: boolean = false;

  constructor(env: Env) {
    super();
    this._env = env;
    this._util = env.util;
    log = this._env.log;
    timeline = this._env.timeline;
    camera = this._env.camera;
    this._init();
    this._vib = new Vibrator();

    this._sampleRate = config.deviceMic.sampleRate;
    this._bytesPerSample = config.deviceMic.bytesPerSample;
    this._numChannels = config.deviceMic.numChannels;

    this._extractor = new MelFeatureExtractor(MEL_COEFFS, this._sampleRate, FFT_SIZE);
    this._framer = new Framer(STEP_SIZE, FFT_SIZE, (signal) => {
      this._detectKeyword(signal);
    });

    this._pcmDataArray = []; // Array of [when, pcmData] tuples
    this._pcmDataSizeInBytes = STEP_SIZE; // Size of all the pcmData buffers in the queue
    this._output = [];
    this._wavDataBuffer = new Buffer(0); // Array of raw pcmData

    // Setup listener for handing mic data and speech
    this._onMicData = pkt => {
      this._handleMicData(pkt.when, pkt.frames);
    };
    this._onSpeechStart = when => {
      this._resumeSpotting(when);
    };
    this._onSpeechStop = when => {
      this._pauseSpotting(when);
    };
    this._onDialogStop = () => {
      this._setVadMode('continuous');
    };

    this._dialogEnabled = this._util.getboolprop(DIALOG_ENABLED_PROP, false);
    this._saveEnabled = this._util.getboolprop(SAVE_KEYWORD_WAV, false);
  }

  /**
   *
   */
  willUnload() {
    if (camera) {
      camera.removeListener('mic-data', this._onMicData);
    }
    if (timeline) {
      timeline.removeListener('dialog_stop', this._onSpeechStop);
      timeline.removeListener('speech_start', this._onSpeechStart);
      timeline.removeListener('speech_stop', this._onSpeechStop);
    }
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
          if ((label === HOT_KEYWORD) && (confidence >= THRESHOLD)) {
            log.info(`${label} spotted with confidence: ${confidence}%`);
            resolve(label);
          } else {
            resolve(null);
          }
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

    // Start the continuous mode
    this._setVadMode('continuous');
  }

  /**
   *
   */
  _setVadMode(mode) {
    log.info(`Switching to ${mode} mode`);
    this._vadMode = mode;

    if (this._vadMode === 'continuous') {
      this._vib.pattern(50);
      timeline.on('speech_start', this._onSpeechStart);
      timeline.on('speech_stop', this._onSpeechStop);
      timeline.removeListener('dialog_stop', this._onDialogStop);
    } else if (this._vadMode === 'dialog') {
      timeline.removeListener('speech_start', this._onSpeechStart);
      timeline.removeListener('speech_stop', this._onSpeechStop);
      timeline.on('dialog_stop', this._onDialogStop);
    } else {
      log.warn(`Unknown VAD mode: ${mode}`);
    }
  }

  /**
   * Receive  mic data and buffer it to be processed at a later time
   * @private
   */
  _handleMicData(when: number, pcmData: Buffer) {
    this._pcmDataArray.push([when, pcmData]);
    this._pcmDataSizeInBytes += pcmData.length;

    // Keep around PCM_BUFFER_SECS worth of data in the ring buffer
    if (!this._spotting && (this._pcmDataArray.length > PCM_BUFFER_COUNT)) {
      while (this._pcmDataArray.length > PCM_BUFFER_COUNT) {
        this._pcmDataArray.shift();
        this._pcmDataSizeInBytes -= pcmData.length;
      }
    }

    if (this._spotting && this._waitingForPcmData) {
      process.nextTick(() => this._processNextSample());
    }
  }

  /**
   * Process next mic data from the queue
   */
  _processNextSample() {
    if (!this._spotting) {
      return;
    }
    if (this._pcmDataArray.length === 0) {
      this._waitingForPcmData = true;
      return;
    }
    this._waitingForPcmData = false;

    // Start processing pcm data
    let [when, pcmData] = this._pcmDataArray.shift();

    // Stop processing after speech stop
    if (when >= this._speechStopWhen + PCM_BUFFER_SECS) {
      log.debug(`Stop processing sample`);
      this._spotting = false;
      return;
    }

    // Convert the raw pcm data into Float32Array of [-1, 1]
    this._pcmDataSizeInBytes -= pcmData.length;

    let samples = new Int16Array(pcmData.length / 2);
    for (let i = 0; i < samples.length; ++i) {
      samples[i] = pcmData.readInt16LE(2 * i);
    }
    let wavData = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; ++i) {
      wavData[i] = (samples[i] < 0) ? (samples[i] / 32768) : (samples[i] / 32767);
    }

    // Store raw PCM data
    if (this._saveEnabled) {
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
  _detectKeyword(signal) {
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
      let label = await this._predictAsync(output);
      if (label && (label === HOT_KEYWORD)) {
        await this._playHotKeywordSound();
        this._saveAsWav();
        this._onKeywordDetected();
        timeline.addObjects([{
          source: 'kws',
          tag: label,
          when: Date.now(),
        }]);
      }
    } catch (err) {
      log.error(`Prediction failed err: ${err.stack}||${err}`);
    }

    // Skip a few samples
    this._output.splice(0, SKIP_SAMPLES);
    if (this._saveEnabled) {
      this._wavDataBuffer = this._wavDataBuffer.slice(RAW_BYTES_TO_SKIP);
    }

    process.nextTick(() => this._processNextWindow()); // Process next sample
  }

  /**
   * Play a sound when hot keyword is detected
   */
  _playHotKeywordSound() {
    if (!this._dialogEnabled) {
      return this._util.playSound(path.join(__dirname, '..', 'media',
          'hotkeyword_detected.mp3'));
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Stop listening for the keyword once the current buffer is finished
   * processing or a keyword is detected
   */
  _pauseSpotting(when) {
    if (!this._spotting) {
      return;
    }
    log.debug(`Pause spotting ${when}`);
    this._speechStopWhen = when;
  }

  /**
   * Start listening for the keyword
   */
  _resumeSpotting(when) {
    if (this._spotting) {
      return;
    }
    log.debug(`Resume spotting ${when}`);
    this._waitingForPcmData = false;
    this._speechStartWhen = when;
    this._speechStopWhen = Infinity;
    if (this._spotting) {
      log.error(`Previous processing in progress`);
      return;
    }
    this._spotting = true;

    this._output = [];
    this._wavDataBuffer = new Buffer(0);
    this._processNextSample();
  }

  /**
   * Stop processsing data as soon as keyword is detected
   */
  _onKeywordDetected() {
    this._output = []; // Clear buffer to stop predictions right away
    this._speechStopWhen = 0;

    if (this._dialogEnabled) {
      this._setVadMode('dialog');
    }
  }

  /**
   *
   */
  _saveAsWav() {
    if (this._saveEnabled) {
      let wavData = this._wavDataBuffer.slice(0, WINDOW_SIZE_IN_BYTES);
      let writer = new wav.FileWriter(`data/media/kws_${Date.now()}.wav`, {
        sampleRate: this._sampleRate,
        channels: this._numChannels,
        bitDepth: this._bytesPerSample * 8,
      });
      writer.write(wavData);
      writer.end();
    }
  }
}

module.exports = (env: Env): any => new KeywordSpotting(env);
