/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import createLog from 'silk-log/device';
import { EventEmitter } from 'events';

import SpeechRecognizer from './speechrecognizer';
import type { MicData } from './speechrecognizer';

const log = createLog('vad');

const LISTEN_TIMEOUT = 5000; // In activity timeout after keyword is detected

export type VadMode = 'continuous' | 'dialog';

/**
 * This class adds voice recognition functionality to silk devices
 */
export default class VoiceActivityDetector extends EventEmitter {

  _speechRecognizer: SpeechRecognizer;
  _onSpeechStart: (when: number) => void;
  _onSpeechStop: (when: number) => void;
  _onSpeechTimeout: () => void;
  _vadMode: VadMode;

  constructor() {
    super();
    this._setupRecognizer();
  }

  /**
   * Call this function to add mic-data
   */
  addMicData(pkt: MicData) {
    if (this._speechRecognizer) {
      this._speechRecognizer.addMicData(pkt);
    }
  }

  /**
   * Start voice activity detection. This is only supported when VAD is in
   * dialog mode.
   */
  startVad() {
    // Start VAD when dialog starts and stop when end of speech is detected
    if (this._vadMode === 'dialog') {
      this._startVoiceActivityDetection();
    }
  }

  /**
   * Stop voice activity detection. This is only supported when VAD is in
   * dialog mode. In dialog mode voice activity detection is automatically
   * stopped on speech_stop so there is no need to explicitly call this function.
   */
  stoptVad() {
    // Start VAD when dialog starts and stop when end of speech is detected
    if (this._vadMode === 'dialog') {
      this._stopVoiceActivityDetection();
    }
  }

  /**
   * Configure the recognizer to perform multiple searches of different kind and
   * switch between them
   */
  _setupRecognizer(): void {
    log.info(`Setting up speech recognizer`);

    // Instantiate voice activity detection
    this._speechRecognizer = new SpeechRecognizer();
    this._speechRecognizer.init();

    // Setup listeners
    this._onSpeechStart = (when) => {
      this._handleBeginningOfSpeech(when);
    };

    this._onSpeechStop = (when) => {
      this._handleEndOfSpeech(when);
    };

    this._onSpeechTimeout = () => {
      this._handleTimeout();
    };
  }

  /**
   * VAD can be in continuous or dialog mode. In continuous mode
   * we continue to run VAD to be able to spot the keyword. Once the keyword is
   * spotted we switch to the dialog mode so we only run VAD at the beginning of
   * a dialog and stop at end of speech to prevent VAD from interfering with
   * the dialog's voice interaction (text-to-speech).
   */
  setMode(mode: VadMode) {
    log.info(`Switching to ${mode} mode`);
    this._vadMode = mode;

    if (this._vadMode === 'continuous') {
      this._startVoiceActivityDetection();
    } else if (this._vadMode === 'dialog') {
      // Stop current voice activity and wait to be explicitly called to start VAD
      this._stopVoiceActivityDetection();
    } else {
      log.warn(`Unknown VAD mode: ${mode}`);
    }
  }

  /**
   * Register for VAD events
   */
  _startVoiceActivityDetection(): void {
    log.debug(`start vad`);
    this._speechRecognizer.on('speech_start', this._onSpeechStart);
    this._speechRecognizer.on('speech_stop', this._onSpeechStop);
    this._speechRecognizer.on('speech_timeout', this._onSpeechTimeout);
    this._start();
  }

  /**
   * Unregister for VAD events
   */
  _stopVoiceActivityDetection(): void {
    log.debug(`stop vad`);
    this._speechRecognizer.stop();
    if (this._onSpeechStart) {
      this._speechRecognizer.removeListener('speech_start', this._onSpeechStart);
    }
    if (this._onSpeechStop) {
      this._speechRecognizer.removeListener('speech_stop', this._onSpeechStop);
    }
    if (this._onSpeechTimeout) {
      this._speechRecognizer.removeListener('speech_timeout', this._onSpeechTimeout);
    }
  }

  /**
   * Start the search
   */
  _start(): void {
    this._speechRecognizer.stop();

    if (this._vadMode === 'dialog') {
      // Wait for LISTEN_TIMEOUT time for VAD start in a dialog mode
      this._speechRecognizer.startListeningTimeout(LISTEN_TIMEOUT);
    } else {
      // Continue to wait for VAD start in a continuous mode
      this._speechRecognizer.startListening();
    }
  }

  /**
   * Handle start of speech event
   */
  _handleBeginningOfSpeech(when: number): void {
    log.debug(`Speech begin`);
    this.emit('speech_start', when);
  }

  /**
   * Handle end of speech event
   */
  _handleEndOfSpeech(when: number): void {
    log.debug(`Speech end`);
    this.emit('speech_stop', when);

    // Suspend VAD activity if in a dialog mode until the next dialog_start
    // event is received
    if (this._vadMode === 'dialog') {
      this._stopVoiceActivityDetection();
    }
  }

  /**
   * No text spoken within the given time
   */
  _handleTimeout(): void {
    log.debug(`speech timeout`);
    this.emit('speech_timeout');

    if (this._vadMode === 'dialog') {
      this._stopVoiceActivityDetection();
    }
  }
}

export type { VoiceActivityDetector };
