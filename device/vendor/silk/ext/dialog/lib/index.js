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
import wav from 'wav';

import type { DialogEngine, DialogEngineOptions } from 'silk-dialog-engine';
import type { Env, Camera } from 'silk-exttest';

type ListeningState = 'ready' | 'listening';
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
const KWS_ENABLED_PROP = 'persist.silk.kws.enabled';

const log = createLog('silkext-dialog');
let camera: Camera;

/**
 * Where to search for the dialog engine
 */
const DIALOGSCRIPT_MODNAME = 'silk-dialog-script';

/**
 *
 */
class Dialog {
  _dialogEngine: DialogEngine;
  _listeningState: ListeningState = 'ready';
  _kwsEnabled: boolean;
  _input: Input;
  _stream: any;
  _activeSpeechPromise: Promise = Promise.resolve();
  _activeSpeechCount: number = 0;

  constructor(env: Env) {
    camera = env.camera;
    this._monitor(true);
    this._kwsEnabled = util.getboolprop(KWS_ENABLED_PROP, false);

    const options: DialogEngineOptions = {
      // TODO
    };
    this._dialogEngine = createDialogEngine(options);
    this._loadDialogScript();
    this._input = new Input();

    // Start mic-data handler right away so the mic data can be passed
    // over to keyword spotting and voice activity modules
    camera.on('mic-data', this._onMicData);

    this._input.on('down', this._onKeyPress);
    this._dialogEngine.on('speech', this._onSay);
  }

  /**
   * Mic-data handler
   */
  _onMicData: MicDataCallback = pkt => {
    if (this._listeningState !== 'listening') {
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
    if (this._listeningState === 'ready') {
      this._onSpeechStart();
    } else {
      this._onSpeechStop();
    }
  };

  /**
   * Handle speech event from dialog engine. Store the stream
   * data in a wav file and play the file at the end of the stream.
   */
  _onSay: SpeechEventCallback = (stream, finished) => {
    log.debug(`Received stream to speak`);

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

    endListener = async () => {
      log.debug('Speech stream ended');
      let sayFilename = '/data/say.wav';

      // Wait for previous playSound to finish before playing another file
      this._activeSpeechPromise = this._activeSpeechPromise.then(() => {
        this._activeSpeechCount++;
        let writer = new wav.FileWriter(sayFilename, {
          sampleRate: config.deviceMic.sampleRate,
          channels: config.deviceMic.numChannels,
          bitDepth: config.deviceMic.bytesPerSample * 8,
        });
        writer.write(pcmSamples);
        writer.end();
        return util.playSound(sayFilename);
      })
      .then(() => {
        log.debug(`Done playing audio, dialog finished: ${finished}`);
        finish();
      })
      .catch((err) => {
        log.error(`cannot play ${sayFilename}, error: ${err}`);
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

    if (this._listeningState !== 'ready') {
      log.info(`not ready, skipping speech start`);
      return;
    }

    try {
      await util.playSound(KEYWORD_DETECTED_SOUND_FILE);
    } catch (err) {
      log.error(`cannot play ${KEYWORD_DETECTED_SOUND_FILE}, error: ${err}`);
    }

    this._stream = new ClosingPassThrough();
    this._dialogEngine.interpret(this._stream);
    this._listeningState = 'listening';
  }

  /**
   * Handle end of speech. On end of speech close the mic stream
   * and interpret the result of speech to text
   */
  _onSpeechStop() {
    log.info(`onSpeechStop`);

    if (this._listeningState !== 'listening') {
      log.info(`not listening, skipping speech stop`);
      return;
    }

    this._stream.end();
    util.playSound(SPEECH_END_SOUND_FILE);
    this._listeningState = 'ready';
  }

  /**
   * Try to load DIALOGSCRIPT_MODNAME
   */
  _loadDialogScript(): void {
    try {
      modwatcher.require(DIALOGSCRIPT_MODNAME);
      const modLocation = modwatcher.require.resolve(DIALOGSCRIPT_MODNAME);
      log.info(`${DIALOGSCRIPT_MODNAME} loaded from ${modLocation}`);
    } catch (e) {
      log.warn('Unable to load', DIALOGSCRIPT_MODNAME, ':', e.stack || e);
    }
  }

  /**
   * Register/deregister for notifications of DIALOGSCRIPT_MODNAME changes
   */
  _monitor(enable: bool): void {
    if (!process.env.NODE_PATH) {
      return;
    }
    const monitorDirs: Array<string> = process.env.NODE_PATH.split(path.delimiter);
    monitorDirs.forEach(dir => {
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
    this._dialogEngine.removeListener('speech', this._onSay);
  }
}

module.exports = (env: Env) => new Dialog(env);
