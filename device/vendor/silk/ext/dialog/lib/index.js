/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import modwatcher from 'silk-modwatcher';
import type { ModulePushCallback } from 'silk-modwatcher';
import { createDialogEngine } from 'silk-dialog-engine';
import path from 'path';
import createLog from 'silk-log/device';
import * as util from 'silk-sysutils';
import Input from 'silk-input';
import ClosingPassThrough from 'silk-streams/src/closing_passthrough';
import config from 'silk-config';
import VoiceActivityDetector from 'silk-vad';
import KeywordSpotting from 'silk-kws';
import say from 'silk-say';
import fs from 'fs';
import netstatus from 'silk-netstatus';
import Speaker from 'silk-speaker';
import Player from 'silk-audioplayer';
import ui from 'silk-device-ui';
import api from 'silk-device-api';
import {Metric} from 'silk-api';

import type {
  DialogEngine,
  DialogEngineOptions,
  DialogState,
  DialogUiModeEventCallback,
} from 'silk-dialog-engine';
import type {
  Env,
  Camera,
  Timeline,
} from 'silk-exttest';
import { Duplex } from 'stream';
import type { OnAudioEvent } from 'silk-kws';

type MicData = {
   when: number;
  frames: Buffer;
};
type MicDataCallback = (pkt: MicData) => void;
type InputEventCallback = (event: { keyId: string }) => void;
type SpeechEventCallback = (stream: Buffer, nextState: ?DialogState) => void;
type InterpretEndCallback = (error: ?Error) => void;
type SpeakBeginCallback = (text: string, nextState: ?DialogState) => void;
type EventType = 'listening' | 'processing_speech' | 'speaking' |
                 'speaking_network_error' | 'finished_processing_speech';

const KEYWORD_DETECTED_SOUND_FILE = path.join(__dirname, '..', 'media', 'hotkeyword_detected.wav');
const ERROR_SOUND_FILE = path.join(__dirname, '..', 'media', 'error.wav');

const NETWORK_DOWN_SOUND_FILE = 'network_down.mp3';
const NETWORK_ERROR_MESSAGE = 'Unable to talk to the server, please try again';
const NETWORK_ERROR_SOUND_FILE = 'network_error.mp3';

const KWS_ENABLED_PROP = 'persist.silk.kws.enabled';
const LOCAL_TTS_ENABLED_PROP = 'persist.silk.dialog.tts.enabled';

// In this mode dialog extension starts the keyword spotting but doesn't process
// the speech that follows. This helps with testing the keyword spotting on the
// device
const KWS_TEST_MODE_PROP = 'persist.silk.kws.testmode';

const log = createLog('silkext-dialog');
let camera: Camera;
let timeline: Timeline;
let modLocation: string;

/**
 * Where to search for the dialog engine
 */
const DIALOGSCRIPT_MODNAME = 'silk-dialog-script';

const dialogScriptSearchDirs = util.getboolprop('ro.debuggable') ?
  [ 'data/node_modules', 'system/silk/node_modules' ] :
  [ 'system/silk/node_modules' ];


class KeywordDetected extends Metric {
  static NAME = 'dialog_keyword';
  static DESC = 'Records when the dialog keyword was detected';

  constructor() {
    super({buttonPress: false});
  }
}

class KeywordButtonPress extends Metric {
  static NAME = 'dialog_keyword';
  static DESC = 'Records when the dialog action button was detected';

  constructor() {
    super({buttonPress: true});
  }
}

/**
 * This extension implements interaction between dialog engine and the end
 * user.
 */
class Dialog {
  _dialogEngine: DialogEngine;
  _kwsEnabled: boolean;
  _input: Input;
  _stream: ?Duplex;
  _activePlaySoundPromise: Promise<void> = Promise.resolve();
  _vad: VoiceActivityDetector;
  _kws: KeywordSpotting;
  _localTts: boolean;
  _speechStopWhen: number;
  _player: Player;

  constructor(env: Env) {
    camera = env.camera;
    timeline = env.timeline;
    this._monitor(true);
    this._player = new Player();
    this._kwsEnabled = util.getboolprop(KWS_ENABLED_PROP, true);
    this._localTts = util.getboolprop(LOCAL_TTS_ENABLED_PROP, false);
    let kwsTestMode = util.getboolprop(KWS_TEST_MODE_PROP, false);

    const options: DialogEngineOptions = {
      localTts: this._localTts,
    };

    let uiMode;
    switch (util.getprop('persist.silk.dialog.uimode')) {
    case 'normal':
    default:
      uiMode = 'normal';
      break;
    case 'dnd':
      uiMode = 'dnd';
      break;
    case 'mute':
      uiMode = 'mute';
      break;
    }

    // $FlowFixMe: Very sorry!! Remove once connections.js is moved into its own module
    this._dialogEngine = createDialogEngine(options, uiMode, env.dialogChannel);
    this._loadDialogScript();
    this._input = new Input();

    // Start mic-data handler right away so the mic data can be passed
    // over to keyword spotting and voice activity modules
    camera.on('mic-data', this._onMicData);

    // If TTS on device is used then use silk-say service to generate TTS.
    // Dialog engine only sends the speak-begin event in that case and expects
    // to be notified of end of speech after TTS is done playing
    if (this._localTts) {
      this._dialogEngine.on('speak-begin', this._onSpeakBegin);
    } else {
      this._dialogEngine.on('speech', this._onSpeak);
    }
    this._dialogEngine.on('interpret-end', this._onInterpretEnd);
    this._dialogEngine.on('ui-mode', this._onUiMode);

    if (this._kwsEnabled) {
      this._vad = new VoiceActivityDetector();
      this._kws = new KeywordSpotting(this._vad, (kwsTestMode ? true : false));
      this._kws.start();

      if (!kwsTestMode) {
        this._kws.on('keyword', this._onKeywordEvent);
        this._kws.on('cry', this._onCryEvent);

        this._vad.on('speech_stop', this._onSpeechStop);
        this._vad.on('speech_timeout', this._onSpeechTimeout);
      }
    }
    this._input.on('down', this._onKeyPress);

    this._init();
  }

  async _init() {
    // Preload sounds to reduce run time play latency
    try {
      await this._player.load(KEYWORD_DETECTED_SOUND_FILE);
      await this._player.load(ERROR_SOUND_FILE);
    } catch (err) {
      log.error(err);
    }
  }

  /**
   * Mic-data handler
   */
  _onMicData: MicDataCallback = pkt => {
    // Feed mic-data to kws and vad modules
    if (this._kwsEnabled) {
      this._kws.addMicData(pkt);
    }

    if (!this._stream) {
      return;
    }

    const { when, frames } = pkt;
    log.debug(`mic-data: ${frames.length} bytes at ${when}`);

    // Stop processing after speech stop
    if (when > this._speechStopWhen) {
      this._stopSpeech();
      return;
    }

    this._stream.write(frames);
  };

  /**
   * Handle key down event
   */
  _onKeyPress: InputEventCallback = event => {
    if (event.keyId !== 'power') {
      return;
    }
    log.info(`Received key down event ${JSON.stringify(event)}`);
    if (!this._stream) {
      if (this._kwsEnabled) {
        this._kws.stop();
      }
      api.metrics.add(new KeywordButtonPress());
      this._dialogEngine.startDialog();
      this._playSound(KEYWORD_DETECTED_SOUND_FILE)
      .then(() => this._onSpeechStart());
    } else {
      if (!this._kwsEnabled) {
        this._stopSpeech();
      }
    }
  };

  _onUiMode: DialogUiModeEventCallback = uiMode => {
    util.setprop('persist.silk.dialog.uimode', uiMode);
  };

  /**
   * Handle end of text interpretation
   */
  _onInterpretEnd: InterpretEndCallback = error => {
    if (error) {
      this._stopSpeech();
      this._playErrorMessage(NETWORK_ERROR_MESSAGE, NETWORK_ERROR_SOUND_FILE);
    }
  };

  /**
   * This function makes sure to finish the currently playing file
   * before scheduling the next one
   */
  _playSound(file: string) {
    log.debug(`Playing ${file}`);
    this._activePlaySoundPromise = this._activePlaySoundPromise.then(() => {
      return this._player.play(file);
    })
    .catch(err => {
      log.error(`cannot play ${file}, error: `, err);
    });
    return this._activePlaySoundPromise;
  }


  /**
   * This function plays the specified error message
   */
  _playErrorMessage(errorMsg: string, errorFile: string) {
    this._emitEvent('speaking_network_error');

    // Play error sound first
    let errorSoundPromise = this._playSound(ERROR_SOUND_FILE);

    let errorMsgPromise = Promise.resolve();
    if (this._localTts) {
      errorMsgPromise = errorSoundPromise.then(() => say.speak(errorMsg));
    } else {
      if (modLocation) {
        errorMsgPromise = this._playSound(path.join(modLocation, 'media', errorFile));
      } else {
        log.error(`${DIALOGSCRIPT_MODNAME} not loaded; can't play error message`);
      }
    }
    errorMsgPromise.then(() => this._onDialogDone());
  }

  /**
   * This function handles the generation of text to speech if TTS service
   * running on the device is used
   */
  _onSpeakBegin: SpeakBeginCallback = (text, nextState) => {
    log.debug(`_onSpeakBegin ${text} ${nextState}`);
    ui.userActivity();
    this._emitEvent('speaking');

    const finish = (err) => {
      if (nextState === 'waiting') {
        this._onSpeechStart();
      } else if (nextState === 'idle') {
        this._onDialogDone();
      }
    };

    this._activePlaySoundPromise = this._activePlaySoundPromise.then(() => {
      return say.speak(text);
    })
    .then(() => {
      log.debug('Finished speaking');
      this._dialogEngine.endSpeak(text, null);
      finish();
    })
    .catch(err => {
      log.error(`Failed to speak text:`, err);
      this._playSound(ERROR_SOUND_FILE);
      finish(err);
    });
  };

  /**
   * Handle speech event from dialog engine
   */
  _onSpeak: SpeechEventCallback = (stream, nextState) => {
    log.debug(`Received stream to speak ${nextState}`);
    ui.userActivity();
    this._emitEvent('speaking');

    let errorListener: ?Function = null;
    let dataListener: ?Function = null;
    let endListener: ?Function = null;
    let pcmSamples = new Buffer(0);

    const finish = (error) => {
      stream.removeListener('error', errorListener);
      stream.removeListener('data', dataListener);
      stream.removeListener('end', endListener);

      if (error) {
        log.error(`Stream error: `, error);
        this._playErrorMessage(NETWORK_ERROR_MESSAGE, NETWORK_ERROR_SOUND_FILE);
        return;
      }

      if (nextState === 'waiting') {
        this._onSpeechStart();
      } else if (nextState === 'idle') {
        this._onDialogDone();
      }
    };

    errorListener = error => {
      finish(error);
    };

    dataListener = data => {
      pcmSamples = Buffer.concat([pcmSamples, data]);
    };

    endListener = () => {
      log.debug('Speech stream ended');

      // Wait for previous playSound to finish before playing another file
      this._activePlaySoundPromise = this._activePlaySoundPromise.then(() => {
        return new Promise((resolve, reject) => {
          let speaker = new Speaker(config.deviceMic);
          speaker.on('close', () => resolve());
          speaker.write(pcmSamples);
          speaker.end();
        });
      })
      .then(() => {
        log.debug(`Done playing audio`);
        finish();
      })
      .catch(err => {
        log.error(`Failed to stream audio to speaker, error: `, err);
        finish();
      });
    };

    stream.on('error', errorListener);
    stream.on('data', dataListener);
    stream.on('end', endListener);
  };

  /**
   * Handle start of speech. On start of speech start sending
   * mic-data to the dialog engine to start the process of
   * conversion from speech to text.
   */
  _onSpeechStart() {
    log.info(`onSpeechStart`);
    ui.userActivity();
    if (this._dialogEngine.uiMode === 'mute') {
      log.verbose('UI muted');
      this._onDialogDone();
      return;
    }
    switch (ui.getState()) {
    case 'connecting':
    case 'online':
      break;
    default:
      log.verbose('Skipping due to UI state', ui.getState());
      this._onDialogDone();
      return;
    }

    // Check if network is available
    if (!netstatus.online) {
      this._playErrorMessage('Internet is down, please try again',
          NETWORK_DOWN_SOUND_FILE);
      return;
    }

    if (this._stream) {
      log.info(`not ready, skipping speech start`);
      return;
    }
    this._speechStopWhen = Infinity;
    this._emitEvent('listening');
    this._stream = new ClosingPassThrough();

    if (this._kwsEnabled) {
      this._vad.startVad();
    }

    if (this._stream) {
      this._dialogEngine.interpret(this._stream);
    }
  }

  _onKeywordEvent: OnAudioEvent = (label, when, confidence) => {
    api.metrics.add(new KeywordDetected());
    this._kws.stop();
    this._dialogEngine.startDialog();
    this._playSound(KEYWORD_DETECTED_SOUND_FILE)
    .then(() => this._onSpeechStart());
  };

  _onCryEvent: OnAudioEvent = (label, when, confidence) => {
    // Notify dialog engine of sound events
    this._dialogEngine.notifySoundEvent(label, when);
  };

  _onSpeechStop: (when: number) => void = when => {
    // Stop processing after mic data upto this time has been processed
    this._speechStopWhen = when;
  };

  _onSpeechTimeout: () => void = () => {
    log.debug('Speech timed out');
    this._stopSpeech();
  };

  /**
   * Handle end of speech. On end of speech close the mic stream
   * and interpret the result of speech to text
   */
  _stopSpeech() {
    log.info(`onSpeechStop`);

    if (!this._stream) {
      log.info(`not listening, skipping speech stop`);
      return;
    }

    this._emitEvent('processing_speech');
    if (this._stream) {
      this._stream.end();
      this._stream = null;
    }
  }

  /**
   * Handle end of dialog event. When an active dialog finishes, start the
   * keyword spotting again
   */
  _onDialogDone() {
    this._dialogEngine.endDialog();
    this._emitEvent('finished_processing_speech');
    if (this._kwsEnabled) {
      this._kws.start();
    }
  }

  /**
   * Try to load DIALOGSCRIPT_MODNAME
   */
  _loadDialogScript(): void {
    for (const dir of dialogScriptSearchDirs) {
      try {
        modLocation = fs.realpathSync(path.join(dir, DIALOGSCRIPT_MODNAME));
      } catch (err) {
        log.debug(err.message || err);
      }

      if (modLocation) {
        try {
          log.info(`Loading ${DIALOGSCRIPT_MODNAME} from ${modLocation}`);
          modwatcher.require(modLocation);
        } catch (err) {
          log.warn('Unable to load', DIALOGSCRIPT_MODNAME, ':', err.stack || err);
        }
        return;
      }
    }
    log.warn(DIALOGSCRIPT_MODNAME, 'not found');
  }

  /**
   * Register/deregister for notifications of DIALOGSCRIPT_MODNAME changes
   */
  _monitor(enable: bool): void {
    dialogScriptSearchDirs.forEach(dir => {
      modwatcher.monitor(path.join(dir, DIALOGSCRIPT_MODNAME),
                         enable ? this._onModulePush : null);
    });
  }

  /**
   * Reload DIALOGSCRIPT_MODNAME
   */
  _onModulePush: ModulePushCallback = (modulePath: string) => {
    this._loadDialogScript();
  };

  /**
   * Emit an event to timeline
   */
  _emitEvent(event: EventType): void {
    log.debug(`Emitting event ${event}`);
    timeline.addObjects([{
      source: 'dialog',
      tag: event,
      when: Date.now(),
      durationMs: 250,
    }]);
  }

  willUnload(): void {
    log.info('unloading....');
    this._monitor(false);
    modwatcher.flush(DIALOGSCRIPT_MODNAME);

    camera.removeListener('mic-data', this._onMicData);
    this._input.removeListener('down', this._onKeyPress);
    this._dialogEngine.removeListener('speech', this._onSpeak);
    this._dialogEngine.removeListener('speak-begin', this._onSpeakBegin);
    this._dialogEngine.removeListener('interpret-end', this._onInterpretEnd);

    if (this._kws) {
      this._kws.removeListener('keyword', this._onKeywordEvent);
      this._kws.removeListener('cry', this._onCryEvent);
    }

    if (this._vad) {
      this._vad.removeListener('speech_stop', this._onSpeechStop);
      this._vad.removeListener('speech_timeout', this._onSpeechTimeout);
    }
  }
}

module.exports = (env: Env) => new Dialog(env);
