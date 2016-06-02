/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import path from 'path';
import config from 'silk-config';
import SpeechRecognizer from './speechrecognizer';
import type { Env, Util, Say, Log, Timeline } from 'silk-exttest/interface/env';
import type { Hypothesis } from 'pocketsphinx';

let log: Log;
let util: Util;
let timeline: Timeline;

// Enable or disable keyword spotting mode. With kws disabled the extension
// only does the voice activity detection and no voice recognition
const KWS_ENABLED_PROP = 'persist.silk.oksilk.kws.enabled';

const MODEL_DIR = path.join(__dirname, '..', 'model');
const LISTEN_TIMEOUT = 3000; // In activity timeout after keyword is detected

// Named searches allow to quickly reconfigure the decoder
const HOTKEY_SEARCH = 'default';
const SILK_COMMANDS = 'commands';
const VAD_SEARCH = 'vad';

// Keyword we are looking for to activate menu
const KEYPHRASE = 'ok sense';

/**
 * This class adds voice recognition functionality to silk devices
 */
class OkSilk {
  _env: Env;
  _say: Say;
  _speechRecognizer: SpeechRecognizer;
  _kwsEnabled: boolean;
  _onSpeechStart: (when: number) => void;
  _onSpeechStop: (when: number) => void;
  _onSpeechTimeout: () => void;

  constructor(env: Env) {
    this._env = env;
    util = env.util;
    timeline = this._env.timeline;
    log = this._env.log;
    this._say = env.say;
    this._kwsEnabled = util.getboolprop(KWS_ENABLED_PROP, false);
    this._setupRecognizer();
  }

  /**
   * Called when extension is about to be unloaded
   */
  willUnload() {
    if (this._speechRecognizer) {
      this._speechRecognizer.cancel();
      this._speechRecognizer.removeAllListeners('result');
      this._speechRecognizer.removeAllListeners('partialResult');
      this._speechRecognizer.willUnload();
    }
    this._stopVoiceActivityDetection();
  }

  /**
   * Configure the recognizer to perform multiple searches of different kind and
   * switch between them
   */
  _setupRecognizer(): void {
    log.info(`Setting up speech recognizer`);

    // Configure with audio properties of the input data from mic. These
    // properties must match the audio properties set in camera
    this._speechRecognizer = new SpeechRecognizer(this._env, config.deviceMic);

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
    this._speechRecognizer.setFloat('-vad_threshold', 3.7);

    this._speechRecognizer.finishSetup();

    // Add model searches
    if (this._kwsEnabled) {
      // Add keyphrase search
      this._speechRecognizer.addKeyphraseSearch(HOTKEY_SEARCH, KEYPHRASE);

      // Add grammar-based search for selection between demos
      this._speechRecognizer.addGrammarSearch(SILK_COMMANDS,
          path.join(MODEL_DIR, 'silk.gram'));
    } else {
      // TODO: Patch pocketsphinx to not required a search to be set to run
      // vad detection. For now keyphrase search seems to be taking the least
      // amount of time from among the other type of searches available
      this._speechRecognizer.addKeyphraseSearch(VAD_SEARCH, KEYPHRASE);
    }

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

    if (this._kwsEnabled) {
      this._startVoiceActivityDetection();

      this._speechRecognizer.on('result', hypothesis => {
        this._handleResult(hypothesis);
      });

      this._speechRecognizer.on('partialResult', hypothesis => {
        this._handlePartialResult(hypothesis);
      });

      this._switchSearch(HOTKEY_SEARCH); // Start listening for the hot keyword
    } else {
      // If kws is disabled then register for keyword event from timeline
      timeline.on('keyword', () => {
        // Start voice activity detection when keyword is detected
        this._startVoiceActivityDetection();
        this._switchSearch(VAD_SEARCH);
      });
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
  }

  /**
   * Unregister for VAD events
   */
  _stopVoiceActivityDetection(): void {
    log.debug(`stop vad`);
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
   * Switch between default or hotkeyword listening mode and grammar search with silk
   * commands
   */
  _switchSearch(searchName): void {
    this._speechRecognizer.stop();

    // If we are not spotting, start listening with timeout
    if (searchName === HOTKEY_SEARCH) {
      this._speechRecognizer.startListening(searchName);
    } else {
      this._speechRecognizer.startListeningTimeout(searchName, LISTEN_TIMEOUT);
    }
    log.debug(`Switching to search ${searchName}`);
  }

  /**
   * This callback is called when we stop the recognizer. This is where we
   * act on the commands
   */
  _handleResult(hypothesis: Hypothesis): void {
    if (hypothesis !== null) {
      let text = hypothesis.hypstr;
      log.info(`Received result hypothesis: ${text}`);

      if (text.match(new RegExp(`on lights`, 'i'))) {
        this._say.speak(`turning lights on`);
      } else if (text.match(new RegExp(`off lights`, 'i'))) {
        this._say.speak(`turning lights off`);
      } else if (text.match(new RegExp(`dim lights`, 'i'))) {
        this._say.speak(`dimming the lights`);
      } else if (text.match(new RegExp(`bright lights`, 'i'))) {
        this._say.speak(`brightning the lights`);
      }
    }
  }

  /**
   * In partial result we get quick updates about current hypothesis. In
   * keyword spotting mode we can react here, in other modes we need to wait
   * for final result in onResult.
   */
  _handlePartialResult(hypothesis: Hypothesis): void {
    if (hypothesis === null) {
      return;
    }

    let text = hypothesis.hypstr;
    log.info(`Received partial result hypothesis: ${text}`);

    if (text.match(new RegExp(`${KEYPHRASE}`, 'i'))) {
      this._playHotKeywordSound();
      this._switchSearch(SILK_COMMANDS);
    }
  }

  /**
   * Handle start of speech event
   */
  _handleBeginningOfSpeech(when: number): void {
    log.debug(`Speech begin`);
    timeline.addObjects([{
      source: 'oksilk',
      tag: 'speech_start',
      when,
    }]);
  }

  /**
   * Handle end of speech event
   */
  _handleEndOfSpeech(when: number): void {
    log.debug(`Speech end`);
    timeline.addObjects([{
      source: 'oksilk',
      tag: 'speech_stop',
      when,
    }]);

    if (this._kwsEnabled) {
      if (this._speechRecognizer.getSearchName() !== HOTKEY_SEARCH) {
        log.debug(`Current search: ${this._speechRecognizer.getSearchName()}`);
        this._switchSearch(HOTKEY_SEARCH);
      }
    } else {
      // Wait for next keyword to be spotted before starting VAD again
      this._stopVoiceActivityDetection();
    }
  }

  /**
   * No text spoken within the given time
   */
  _handleTimeout(): void {
    log.debug(`speech timeout`);
    timeline.addObjects([{
      source: 'oksilk',
      tag: 'speech_timeout',
      when: Date.now(),
    }]);

    if (this._kwsEnabled) {
      this._switchSearch(HOTKEY_SEARCH);
    } else {
      this._stopVoiceActivityDetection();
    }
  }

  /**
   * Play a sound when hot keyword is detected
   */
  _playHotKeywordSound(): void {
    util.playSound(path.join(__dirname, '..', 'media', 'hotkeyword_detected.mp3'));
  }
}

module.exports = (env: Env): any => new OkSilk(env);
