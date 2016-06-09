/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import * as pocketsphinx from 'pocketsphinx';
import { EventEmitter } from 'events';
import createLog from 'silk-log/device';
import config from 'silk-config';

import type { ConfigDeviceMic } from 'silk-config';

const log = createLog('vad');
let ps = pocketsphinx.ps;

export type MicData = {
  when: number;
  frames: Buffer;
};

/**
 * Implementattion of voice activity detection using pocketsphinx. This class
 * receives mic data and rus voice activity detection on it using Pocketsphinx
 * engine.
 */
export default class SpeechRecognizer extends EventEmitter {

  _decoder: any;
  _config: ConfigDeviceMic;
  _listening: boolean = false;
  _sampleRate:number;
  _bytesPerSample: number;
  _numChannels: number;
  _pcmDataQueue: Array<[number, Buffer]>;
  _pcmDataQueueSizeInBytes: number;
  _processingInProgress: boolean;
  _backlogMinSizeInBytes: number;
  _inSpeech: boolean;
  _listenTimeout: ?number;

  constructor() {
    super();
    this._decoder = null;

    this._sampleRate = config.deviceMic.sampleRate;
    this._bytesPerSample = config.deviceMic.bytesPerSample;
    this._numChannels = config.deviceMic.numChannels;
    this._pcmDataQueue = []; // Array of [when, pcmData] tuples
    this._pcmDataQueueSizeInBytes = 0; // Size of all the pcmData buffers in the queue
    this._processingInProgress = false;

    // Calculate backlog size for 1 second worth of data
    this._backlogMinSizeInBytes = 1 * this._sampleRate * this._bytesPerSample *
        this._numChannels;

    this._config = new ps.Decoder.defaultConfig(); // eslint-disable-line new-cap
  }

  /**
   * Call this function to add mic-data
   */
  addMicData(pkt: MicData) {
    this._handleMicData(pkt.when, pkt.frames);
  }

  /**
   * Set loction of directory containing acoustic model files
   */
  setAcousticModel(model: string): void {
    this._config.setString('-hmm', model);
  }

  /**
   * Set location of main pronunciation dictionary (lexicon) input file
   */
  setDictionary(dictionary: string): void {
    this._config.setString('-dict', dictionary);
  }

  /**
   * Set sampling rate option. Sample rate of the recognizer should match
   * the sample rate of the incoming audio
   */
  setSampleRate(rate: number): void {
    this._config.setFloat('-samprate', rate);
  }

  /**
   * Set threshold for p(hyp)/p(alternatives) ratio
   */
  setKeywordThreshold(threshold: number): void {
    this._config.setFloat('-kws_threshold', threshold);
  }

  /**
   * Set configuration option as boolean
   */
  setBoolean(key: string, value: boolean): void {
    this._config.setBoolean(key, value);
  }

  /**
   * Set configuration option as integer
   */
  setInteger(key: string, value: number): void {
    this._config.setInt(key, value);
  }

  /**
   * Set configuration option as float
   */
  setFloat(key: string, value: number): void {
    this._config.setFloat(key, value);
  }

  /**
   * This needs to be called before any this._decoder functions are invoked
   */
  finishSetup(): void {
    this._decoder = new ps.Decoder(this._config);

    const sampleRate = this._decoder.getConfig().getFloat('-samprate');
    log.info(`Initialized recognizer with rate ${sampleRate}`);
  }

  /**
   * Gets name of the currently active search
   *
   * @return active search name or null if no search was started
   */
  getSearchName(): string {
    return this._decoder.getSearch();
  }

  /**
   * Adds search based on a single phrase
   *
   * @param name search name
   * @param phrase search phrase
   */
  addKeyphraseSearch(name: string, phrase: string): void {
    this._decoder.setKeyphrase(name, phrase);
  }

  /**
   * Adds search based on a keyphrase file.
   *
   * @param name search name
   * @param phrase a file with search phrases, one phrase per line with optional
   *        weight in the end, for example
   *        <br/>
   *        <code>
   *        oh mighty computer /1e-20/
   *        how do you do /1e-10/
   *        </code>
   */
  addKeywordSearch(name: string, file: string): void {
    log.verbose(`Load keytword file ${file}`);
    this._decoder.setKws(name, file);
  }

  /**
   * Adds searches based on JSpeech grammar
   *
   * @param name search name
   * @param file JSGF file
   */
  addGrammarSearch(name: string, file: string): void {
    log.verbose(`Load JSGF file ${file}`);
    this._decoder.setJsgfFile(name, file);
  }

  /**
   * Adds search based on N-gram language model.
   *
   * @param name search name
   * @param file N-gram model file
   */
  addNgramSearch(name: string, file: string): void {
    log.verbose(`Load N-gram model ${file}`);
    this._decoder.setLmFile(name, file);
  }

  /**
   * Starts recognition. Does nothing if recognition is active.
   *
   * @return true if recognition was actually started
   */
  startListening(searchName: string): boolean {
    if (this._listening) {
      return false;
    }

    log.debug(`Start search ${searchName}`);
    this._decoder.setSearch(searchName);

    this._decoder.startUtt(); // Start utterance processing
    this._pcmDataQueue.length = 0;
    this._pcmDataQueueSizeInBytes = 0;
    this._listening = true;
    this._inSpeech = this._decoder.getInSpeech();
    return true;
  }

  /**
   * Starts recognition. After specified timeout listening stops and the
   * endOfSpeech signals about that. Does nothing if recognition is active.
   *
   * @timeout - timeout in milliseconds to listen.
   *
   * @return true if recognition was actually started
   */
  startListeningTimeout(searchName: string, timeout: number): boolean {
    log.debug(`Start recognition ${searchName} with timeout ${timeout}`);
    if (this.startListening(searchName)) {
      // Stop listening after the provided timeout
      this._listenTimeout = setTimeout(() => {
        this.stop();
        this.emit('speech_timeout');
      }, timeout);
      return true;
    }
    return false;
  }

  /**
   * Cancels recognition. Listeners do not receive final result. Does nothing
   * if recognition is not active.
   */
  cancel(): void {
    if (!this.stop()) {
      return;
    }
    log.info(`Cancel recognition`);
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
    this._decoder.endUtt(); // End utterance processing
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

    // It would be better to fail to recognize a keyword then to recognize
    // a few seconds later so clear the stale mic data from the queue
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
    let [when, pcmData] = this._pcmDataQueue.shift();
    this._pcmDataQueueSizeInBytes -= pcmData.length;

    this._decoder.processRaw(pcmData, false, false);
    if (this._inSpeech !== this._decoder.getInSpeech()) {
      this._inSpeech = this._decoder.getInSpeech();

      if (this._inSpeech) {
        log.debug('===== Begin speech');
        this.emit('speech_start', when);

        // Clear voice activity timeout if exists
        if (this._listenTimeout) {
          clearTimeout(this._listenTimeout);
          this._listenTimeout = null;
        }
      } else {
        log.debug('===== End speech');
        this.emit('speech_stop', when);
      }
    }

    this._processingInProgress = true;

    // Process next sample
    process.nextTick(() => this._processNextSample());
  }
}
