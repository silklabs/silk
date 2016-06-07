/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import path from 'path';
import config from 'silk-config';
import createLog from 'silk-log/device';
import * as util from 'silk-sysutils';

import SpeechRecognizer from './speechrecognizer';
import type { Camera, Timeline } from 'silk-exttest';

const log = createLog('vad');

const MODEL_DIR = path.join(__dirname, '..', 'model');
const LISTEN_TIMEOUT = 5000; // In activity timeout after keyword is detected

// Named searches allow to quickly reconfigure the decoder
const VAD_SEARCH = 'vad';

// Keyword we are looking for to activate menu
const KEYPHRASE = 'ok sense';

// Allow continuous keyword spotting if dialog is disabled
const DIALOG_ENABLED_PROP = 'persist.silk.dialog.enabled';

export type VadMode = 'continuous' | 'dialog';

/**
 * This class adds voice recognition functionality to silk devices
 */
export default class VoiceActivityDetector {

  _timeline: Timeline;
  _camera: Camera;
  _speechRecognizer: SpeechRecognizer;
  _onSpeechStart: (when: number) => void;
  _onSpeechStop: (when: number) => void;
  _onSpeechTimeout: () => void;
  _onDialogStart: () => void;
  _dialogEnabled: boolean;
  _vadMode: VadMode;

  constructor(timeline: Timeline, camera: Camera) {
    this._timeline = timeline;
    this._camera = camera;
    this._setupRecognizer();
    this._dialogEnabled = util.getboolprop(DIALOG_ENABLED_PROP, false);
  }

  /**
   * Configure the recognizer to perform multiple searches of different kind and
   * switch between them
   */
  _setupRecognizer(): void {
    log.info(`Setting up speech recognizer`);

    // Configure with audio properties of the input data from mic. These
    // properties must match the audio properties set in camera
    this._speechRecognizer = new SpeechRecognizer(config.deviceMic, this._camera);

    // Bandwidth of Audio recorded from capture process is 16khz so use
    // en-us-16khz model. Reference http://cmusphinx.sourceforge.net/wiki/faq
    // Default configuration options are documented at:
    //   https://github.com/watsonbox/pocketsphinx-ruby/wiki/Default-Pocketsphinx-Configuration
    this._speechRecognizer.setAcousticModel(
        path.join(MODEL_DIR, 'en-us-ptm-16khz'));

    this._speechRecognizer.setDictionary(
        path.join(MODEL_DIR, 'cmudict-en-us.dict'));

    // Audio from capture process is recorded at 8khz samling rate so set
    // the speechrecognizer's sample rate accordingly
    this._speechRecognizer.setSampleRate(config.deviceMic.sampleRate);

    // Threshold to tune for keyphrase to balance between false alarms and misses
    // Higher the number more false alarms and less misses, lower the number
    // less false alarms but higher misses (1e-30 > 1e-40)
    this._speechRecognizer.setKeywordThreshold(1e-45);

    // Use context-independent phonetic search, context-dependent is too slow
    // for mobile
    this._speechRecognizer.setBoolean('-allphone_ci', true);

    // Enable voice activity detection
    this._speechRecognizer.setBoolean('-remove_silence', true);
    this._speechRecognizer.setBoolean('-remove_noise', true);

    // Adjust VAD threshold. Higher number means ignore more sound. Default
    // value of 2.0 is not sufficient as mic data on the phones are pretty
    // sensitive in picking up stray noise like clock ticking, person breathing
    // and so on.
    this._speechRecognizer.setFloat('-vad_threshold', 3.2);

    this._speechRecognizer.finishSetup();

    // Add model searches
    this._speechRecognizer.addKeyphraseSearch(VAD_SEARCH, KEYPHRASE);

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

    // Start VAD when dialog starts and stop when end of speech
    // is detected
    this._onDialogStart = () => {
      this._startVoiceActivityDetection();
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
      this._timeline.removeListener('dialog_start', this._onDialogStart);
      this._startVoiceActivityDetection();
    } else if (this._vadMode === 'dialog') {
      this._stopVoiceActivityDetection();
      this._timeline.on('dialog_start', this._onDialogStart);
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
    this._startSearch(VAD_SEARCH);
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
   *
   * TODO: Patch pocketsphinx to not required a search to be set to run
   * vad detection. For now keyphrase search seems to be taking the least
   * amount of time from among the other type of searches available
   */
  _startSearch(): void {
    this._speechRecognizer.stop();

    if (this._vadMode === 'dialog') {
      // Wait for LISTEN_TIMEOUT time for VAD start in a dialog mode
      this._speechRecognizer.startListeningTimeout(VAD_SEARCH, LISTEN_TIMEOUT);
    } else {
      // Continue to wait for VAD start in a continuous mode
      this._speechRecognizer.startListening(VAD_SEARCH);
    }
  }

  /**
   * Handle start of speech event
   */
  _handleBeginningOfSpeech(when: number): void {
    log.debug(`Speech begin`);
    this._timeline.addObjects([{
      source: 'silk-vad',
      tag: 'speech_start',
      when,
    }]);
  }

  /**
   * Handle end of speech event
   */
  _handleEndOfSpeech(when: number): void {
    log.debug(`Speech end`);
    this._timeline.addObjects([{
      source: 'silk-vad',
      tag: 'speech_stop',
      when,
    }]);

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
    this._timeline.addObjects([{
      source: 'silk-vad',
      tag: 'speech_timeout',
      when: Date.now(),
    }]);

    if (this._vadMode === 'dialog') {
      this._stopVoiceActivityDetection();
    }
  }
}
