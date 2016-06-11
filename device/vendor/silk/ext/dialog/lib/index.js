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
import wav from 'wav';
import fs from 'fs';

import type { DialogEngine, DialogEngineOptions } from 'silk-dialog-engine';
import type { Env, Camera } from 'silk-exttest';
import { Duplex } from 'stream';

type MicData = {
   when: number;
  frames: Buffer;
};
type MicDataCallback = (pkt: MicData) => void;
type InputEventCallback = (event: { keyId: string }) => void;
type SpeechEventCallback = (stream: Buffer, finished: boolean) => void;

const KEYWORD_DETECTED_SOUND_FILE = path.join(__dirname, '..', 'media', 'hotkeyword_detected.mp3');
const SPEECH_END_SOUND_FILE = path.join(__dirname, '..', 'media', 'stopListen.mp3');
const ERROR_SOUND_FILE = path.join(__dirname, '..', 'media', 'motion_detected.mp3');
const SAY_FILE_NAME = '/data/say.wav';

const KWS_ENABLED_PROP = 'persist.silk.kws.enabled';
const LOCAL_TTS_ENABLED_PROP = 'persist.silk.dialog.tts.enabled';

const log = createLog('silkext-dialog');
let camera: Camera;

/**
 * Where to search for the dialog engine
 */
const DIALOGSCRIPT_MODNAME = 'silk-dialog-script';

const dialogScriptSearchDirs = util.getboolprop('ro.debuggable') ?
  [ 'data/node_modules', 'system/silk/node_modules' ] :
  [ 'system/silk/node_modules' ];

/**
 * This extension implements interaction between dialog engine and the end
 * user.
 */
class Dialog {
  _dialogEngine: DialogEngine;
  _kwsEnabled: boolean;
  _input: Input;
  _stream: ?Duplex;
  _activeSpeechPromise: Promise = Promise.resolve();
  _activeSpeechCount: number = 0;
  _vad: VoiceActivityDetector;
  _kws: KeywordSpotting;
  _localTts: boolean;

  constructor(env: Env) {
    camera = env.camera;
    this._monitor(true);
    this._kwsEnabled = util.getboolprop(KWS_ENABLED_PROP, false);
    this._localTts = util.getboolprop(LOCAL_TTS_ENABLED_PROP, true);

    const options: DialogEngineOptions = {
      localTts: this._localTts,
    };
    this._dialogEngine = createDialogEngine(options);
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

    if (this._kwsEnabled) {
      this._vad = new VoiceActivityDetector();
      this._kws = new KeywordSpotting(this._vad);
      this._kws.start();

      this._kws.on('keyword', () => {
        log.debug(`Keyword detected`);
        this._kws.stop();
        this._onSpeechStart();
      });
      this._vad.on('speech_stop', () => {
        this._onSpeechStop();
      });
      this._vad.on('speech_timeout', () => {
        log.debug('Speech timedout');
        this._onSpeechStop();
      });
    } else {
      this._input.on('down', this._onKeyPress);
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
    this._stream.write(frames);
  };

  /**
   * Handle volume key down event
   */
  _onKeyPress: InputEventCallback = event => {
    if (event.keyId !== 'volumedown') {
      return;
    }
    log.info(`Received key down event ${JSON.stringify(event)}`);
    if (!this._stream) {
      this._onSpeechStart();
    } else {
      this._onSpeechStop();
    }
  };

  /**
   * Write raw pcm data in a wav file
   */
  _writeWavFile(pcmSamples: Buffer): Promise {
    return new Promise((resolve, reject) => {
      let writer = new wav.FileWriter(SAY_FILE_NAME, {
        sampleRate: config.deviceMic.sampleRate,
        channels: config.deviceMic.numChannels,
        bitDepth: config.deviceMic.bytesPerSample * 8,
      });
      writer.on('header', () => {
        resolve();
      });
      writer.on('error', (err) => {
        reject(err);
      });
      writer.write(pcmSamples);
      writer.end();
    });
  }

  /**
   * This function handles the generation of text to speech if TTS service
   * running on the device is used
   */
  _onSpeakBegin: Function = (text, finished) => {
    log.debug(`_onSpeakBegin ${text} ${finished}`);

    const finish = (err) => {
      if (--this._activeSpeechCount <= 0) {
        this._activeSpeechCount = 0;
        if (!finished) {
          this._onSpeechStart();
        } else {
          this._onDialogDone();
        }
      }
    };

    this._activeSpeechCount++;
    this._activeSpeechPromise = this._activeSpeechPromise.then(() => {
      // This is a workaround for issue #2032. Ideally this event should only
      // be called when the TTS is done.
      this._dialogEngine.endSpeak(text, null);

      return say.speak(text);
    })
    .then(() => {
      log.debug('Finished speaking');
      finish();
    })
    .catch((err) => {
      log.error(`Failed to speak text: ${err}`);
      util.playSound(ERROR_SOUND_FILE);
      finish(err);
    });
  };

  /**
   * Handle speech event from dialog engine. Store the stream
   * data in a wav file and play the file at the end of the stream.
   */
  _onSpeak: SpeechEventCallback = (stream, finished) => {
    log.debug(`Received stream to speak ${finished}`);

    let errorListener: ?Function = null;
    let dataListener: ?Function = null;
    let endListener: ?Function = null;
    let pcmSamples = new Buffer(0);

    const finish = () => {
      stream.removeListener(`error`, errorListener);
      stream.removeListener(`data`, dataListener);
      stream.removeListener(`end`, endListener);

      if (--this._activeSpeechCount <= 0) {
        this._activeSpeechCount = 0;
        if (!finished) {
          this._onSpeechStart();
        } else {
          this._onDialogDone();
        }
      }
    };

    errorListener = error => {
      log.error(`Stream error`, error);
      util.playSound(ERROR_SOUND_FILE);
      finish();
    };

    dataListener = data => {
      pcmSamples = Buffer.concat([pcmSamples, data]);
    };

    endListener = () => {
      log.debug('Speech stream ended');
      this._activeSpeechCount++;

      // Wait for previous playSound to finish before playing another file
      this._activeSpeechPromise = this._activeSpeechPromise.then(() => {
        return this._writeWavFile(pcmSamples)
        .then(() => {
          return util.playSound(SAY_FILE_NAME);
        });
      })
      .then(() => {
        log.debug(`Done playing audio`);
        finish();
      })
      .catch((err) => {
        log.error(`cannot play ${SAY_FILE_NAME}, error: ${err}`);
        finish();
      });
    };

    stream.on('error', errorListener);
    stream.on('data', dataListener);
    stream.on('end', endListener);
  }

  /**
   * Handle start of speech. On start of speech start sending
   * mic-data to the dialog engine to start the process of
   * conversion from speech to text.
   */
  async _onSpeechStart() {
    log.info(`onSpeechStart`);

    if (this._stream) {
      log.info(`not ready, skipping speech start`);
      return;
    }
    this._stream = new ClosingPassThrough();

    try {
      await util.playSound(KEYWORD_DETECTED_SOUND_FILE);
    } catch (err) {
      log.error(`cannot play ${KEYWORD_DETECTED_SOUND_FILE}, error: ${err}`);
    }

    if (this._kwsEnabled) {
      this._vad.startVad();
    }

    if (this._stream) {
      this._dialogEngine.interpret(this._stream);
    }
  }

  /**
   * Handle end of speech. On end of speech close the mic stream
   * and interpret the result of speech to text
   */
  _onSpeechStop() {
    log.info(`onSpeechStop`);

    if (!this._stream) {
      log.info(`not listening, skipping speech stop`);
      return;
    }

    if (this._stream) {
      this._stream.end();
      this._stream = null;
    }
    util.playSound(SPEECH_END_SOUND_FILE);
  }

  /**
   * Handle end of dialog event. When an active dialog finishes, start the
   * keyword spotting again
   */
  _onDialogDone() {
    if (this._kwsEnabled) {
      this._kws.start();
    }
  }

  /**
   * Try to load DIALOGSCRIPT_MODNAME
   */
  _loadDialogScript(): void {
    for (const dir of dialogScriptSearchDirs) {
      let modLocation = null;
      try {
        modLocation = fs.realpathSync(path.join(dir, DIALOGSCRIPT_MODNAME));
      } catch (e) {
        log.debug(e);
      }

      if (modLocation !== null) {
        try {
          log.info(`Loading ${DIALOGSCRIPT_MODNAME} from ${modLocation}`);
          modwatcher.require(modLocation);
        } catch (e) {
          log.warn('Unable to load', DIALOGSCRIPT_MODNAME, ':', e.stack || e);
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

  willUnload(): void {
    log.info('unloading....');
    this._monitor(false);
    modwatcher.flush(DIALOGSCRIPT_MODNAME);

    camera.removeListener('mic-data', this._onMicData);
    this._input.removeListener('down', this._onKeyPress);
    this._dialogEngine.removeListener('speech', this._onSpeak);
    this._dialogEngine.removeListener('speak-begin', this._onSpeakBegin);
  }
}

module.exports = (env: Env) => new Dialog(env);
