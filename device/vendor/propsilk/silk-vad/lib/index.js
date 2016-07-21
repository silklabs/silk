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
import WebRtcVad from './webrtc_vad';

const log = createLog('vad');

const INACTIVITY_TIMEOUT = 5000;
const SPEECH_DURATION = 10000;

export type VadMode = 'continuous' | 'dialog';
export type MicData = {
  when: number;
  frames: Buffer;
};

const VAD_ENGINE_PS = 'pocketsphinx';
const VAD_ENGINE_WEBRTC = 'webrtc';

/**
 * This class adds voice recognition functionality to silk devices
 */
export default class VoiceActivityDetector extends EventEmitter {

  _vad: SpeechRecognizer | WebRtcVad;
  _onSpeechStart: (when: number) => void;
  _onSpeechStop: (when: number) => void;
  _onSpeechTimeout: () => void;
  _vadMode: VadMode;
  _inactivityTimeout: ?number;
  _speechDurationTimeout: ?number;

  constructor(vadEngine: string = VAD_ENGINE_PS) {
    super();
    this._setupRecognizer(vadEngine);
  }

  /**
   * Call this function to add mic-data
   */
  addMicData(pkt: MicData) {
    if (this._vad) {
      this._vad.addMicData(pkt);
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
  _setupRecognizer(vadEngine: string): void {
    log.info(`Setting up speech recognizer`);

    // Instantiate voice activity detection
    if (vadEngine === VAD_ENGINE_PS) {
      this._vad = new SpeechRecognizer();
    } else {
      this._vad = new WebRtcVad();
    }
    const result = this._vad.init();
    if (!result) {
      log.error(`Failed to initialize ${vadEngine}`);
      return;
    }

    // Setup listeners
    this._onSpeechStart = (when) => {
      this._handleBeginningOfSpeech(when);
    };

    this._onSpeechStop = (when) => {
      this._handleEndOfSpeech(when);
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
    this._vad.on('speech_start', this._onSpeechStart);
    this._vad.on('speech_stop', this._onSpeechStop);
    this._start();
  }

  /**
   * Unregister for VAD events
   */
  _stopVoiceActivityDetection(): void {
    log.debug(`stop vad`);
    this._vad.stop();
    if (this._onSpeechStart) {
      this._vad.removeListener('speech_start', this._onSpeechStart);
    }
    if (this._onSpeechStop) {
      this._vad.removeListener('speech_stop', this._onSpeechStop);
    }
    if (this._onSpeechTimeout) {
      this._vad.removeListener('speech_timeout', this._onSpeechTimeout);
    }
  }

  /**
   * Start the search
   */
  _start(): void {
    this._vad.stop();

    if (this._vadMode === 'dialog') {
      // Set an inactivity timeout
      this._inactivityTimeout = this._startTimer(INACTIVITY_TIMEOUT, 'inactivity');
    }
    this._vad.startListening();
  }

  /**
   * Handle timer expired event
   */
  _startTimer(timeout: number, reason: string): number {
    return setTimeout(() => {
      this._handleTimeout(reason);
    }, timeout);
  }

  /**
   * Handle start of speech event
   */
  _handleBeginningOfSpeech(when: number): void {
    log.debug(`Speech begin`);

    // Clear voice inactivity timeout if exists
    if (this._inactivityTimeout) {
      clearTimeout(this._inactivityTimeout);
      this._inactivityTimeout = null;
    }

    // Start a speech duration timer to not allow to be in speech forever in a
    // noisy environment.
    if (this._vadMode === 'dialog') {
      this._speechDurationTimeout = this._startTimer(SPEECH_DURATION,
          'speech duration exceeded');
    }

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

      if (this._speechDurationTimeout) {
        clearTimeout(this._speechDurationTimeout);
        this._speechDurationTimeout = null;
      }
    }
  }

  /**
   * No text spoken within the given time
   */
  _handleTimeout(reason: string): void {
    log.debug(`speech timeout due to ${reason}`);
    this.emit('speech_timeout');

    if (this._vadMode === 'dialog') {
      this._stopVoiceActivityDetection();
    }
  }
}

export type { VoiceActivityDetector };
