/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

// Load the regnerator polyfill manually so we don't need to also load all the
// core-js pollyfills which we don't actually need...
import regeneratorRuntime from 'babel-runtime/regenerator';
global.regeneratorRuntime = global.regeneratorRuntime || regeneratorRuntime;

import SpeechRecognizer from './speechrecognizer';
let log;

const MODEL_DIR = '/system/silk/media/pocketsphinx/';
const AUDIO_SAMPLE_RATE = 8000;

/* Named searches allow to quickly reconfigure the decoder */
const HOTKEY_SEARCH = 'wakeup';
const SILK_COMMANDS = 'commands';

/* Keyword we are looking for to activate menu */
const KEYPHRASE = 'ok sense';

/**
 * This class adds voice recognition functionality to silk devices
 */
class OkSilk {
  constructor(env) {
    this._env = env;
    this._util = env.util;
    this._say = env.say;
    log = this._env.log;
    this._speechRecognizer = null;
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
      this._speechRecognizer.removeAllListeners('beginningOfSpeech');
      this._speechRecognizer.removeAllListeners('endOfSpeech');
      this._speechRecognizer.removeAllListeners('timeout');
      this._speechRecognizer.willUnload();
    }
  }

  /**
   * Configure the recognizer to perform multiple searches of different kind and
   * switch between them
   */
  _setupRecognizer() {
    log.info(`Setting up speech recognizer`);

    // Configure with audio properties of the input data from mic. These
    // properties must match the audio properties set in camera
    this._speechRecognizer = new SpeechRecognizer(this._env, {
      sampleRate: AUDIO_SAMPLE_RATE,
      bytesPerSample: 2,
      numChannels: 1,
    });

    // Bandwidth of Audio recorded from capture process is 8khz so use
    // en-us-8khz model. Reference http://cmusphinx.sourceforge.net/wiki/faq
    // Default configuration options are documented at:
    //   https://github.com/watsonbox/pocketsphinx-ruby/wiki/Default-Pocketsphinx-Configuration
    this._speechRecognizer.setAcousticModel(MODEL_DIR + 'en-us-ptm-8khz');

    this._speechRecognizer.setDictionary(MODEL_DIR + 'cmudict-en-us.dict');

    // Audio from capture process is recorded at 8khz samling rate so set
    // the speechrecognizer's sample rate accordingly
    this._speechRecognizer.setSampleRate(AUDIO_SAMPLE_RATE);

    // Threshold to tune for keyphrase to balance between false alarms and misses
    // Higher the number more false alarms and less misses, lower the number
    // less false alarms but higher misses (1e-30 > 1e-40)
    this._speechRecognizer.setKeywordThreshold(1e-45);

    // Use context-independent phonetic search, context-dependent is too slow
    // for mobile
    this._speechRecognizer.setBoolean('-allphone_ci', true);

    // Enable voice activity detection (VAD)
    this._speechRecognizer.setBoolean('-remove_silence', true);
    this._speechRecognizer.setBoolean('-remove_noise', true);

    // Adjust VAD threshold. Higher number means ignore more sound. Default
    // value of 2.0 is not sufficient as mic data on the phones are pretty
    // sensitive in picking up stray noise like clock ticking, person breathing
    // and so on.
    this._speechRecognizer.setFloat('-vad_threshold', 3.7);

    this._speechRecognizer.finishSetup();

    // Add keyword-activation search for hotkeyword listening
    this._speechRecognizer.addKeyphraseSearch(HOTKEY_SEARCH, KEYPHRASE);

    // Add grammar-based search for selection between demos
    this._speechRecognizer.addGrammarSearch(SILK_COMMANDS, MODEL_DIR + 'silk.gram');

    /* Setup listeners */
    this._speechRecognizer.on('result', hypothesis => {
      this._handleResult(hypothesis);
    });

    this._speechRecognizer.on('partialResult', hypothesis => {
      this._handlePartialResult(hypothesis);
    });

    this._speechRecognizer.on('beginningOfSpeech', () => {
      this._handleBeginningOfSpeech();
    });

    this._speechRecognizer.on('endOfSpeech', () => {
      this._handleEndOfSpeech();
    });

    this._speechRecognizer.on('timeout', () => {
      this._handleTimeout();
    });

    // Start listening for the hot keyword
    this._switchSearch(HOTKEY_SEARCH);
  }

  /**
   * Switch between hotkeyword listening mode and grammar search with silk
   * commands
   */
  _switchSearch(searchName) {
    this._speechRecognizer.stop();

    // If we are not spotting, start listening with timeout (5 seconds)
    if (searchName === HOTKEY_SEARCH) {
      this._speechRecognizer.startListening(searchName);
    } else {
      this._speechRecognizer.startListeningTimeout(searchName, 5000);
    }
    log.debug(`Switching to search ${searchName}`);
  }

  /**
   * This callback is called when we stop the recognizer. This is where we
   * act on the commands
   */
  _handleResult(hypothesis) {
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
  _handlePartialResult(hypothesis) {
    if (hypothesis === null) {
      return;
    }

    let text = hypothesis.hypstr;
    log.info(`Received partial result hypothesis: ${text}`);

    if (text.match(new RegExp(`${KEYPHRASE}`, 'i'))) {
      this._switchSearch(SILK_COMMANDS);
    }
  }

  _handleBeginningOfSpeech() {
    log.debug(`Speech begin`);
  }

  /**
   * We stop recognizer here to get a final result
   */
  _handleEndOfSpeech() {
    log.debug(`Speech end`);
    if (this._speechRecognizer.getSearchName() !== HOTKEY_SEARCH) {
      log.debug(`Current search: ${this._speechRecognizer.getSearchName()}`);
      this._switchSearch(HOTKEY_SEARCH);
    }
  }

  /**
   * No text spoken within the given time so reset back to keyword search
   */
  _handleTimeout() {
    log.debug(`Timeout`);
    this._switchSearch(HOTKEY_SEARCH);
  }
}

module.exports = env => new OkSilk(env);
