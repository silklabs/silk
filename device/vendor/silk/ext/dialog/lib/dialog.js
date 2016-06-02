/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

import path from 'path';
import oldfs from 'fs';

import silkconfig from 'silk-config';
import {createDialogEngine} from 'silk-dialog';
import {generateWavHeader, createSpeechToText, createTextToSpeech} from 'silk-dialog';

import babyScriptData from 'silk-dialog/demo/baby/babyScriptData';
import createBabyInitState from 'silk-dialog/demo/baby/babyState';

let log;
let util;

const audioParams = silkconfig.deviceMic;

const KEYWORD_DETECTED_SOUND_FILE = path.join(__dirname, '..', 'media', 'hotkeyword_detected.mp3');
const SPEECH_END_SOUND_FILE = path.join(__dirname, '..', 'media', 'stopListen.mp3');
const ERROR_SOUND_FILE = path.join(__dirname, '..', 'media', 'motion_detected.mp3');
const KWS_ENABLED_PROP = 'persist.silk.kws.enabled';

class Dialog {
  constructor(env) {
    log = env.log;
    util = env.util;

    this._listeningState = 'ready';
    this._camera = env.camera;
    this._ui = env.ui;
    this._timeline = env.timeline;

    this._dialogEngine =
        createDialogEngine(babyScriptData, createBabyInitState);

    this._dialogEngine.on('say',
        (sayText, isLast) => this._onSay(sayText, isLast));

    this._dialogEngine.on('error', err => {
      throw err;
    });

    this._kwsEnabled = util.getboolprop(KWS_ENABLED_PROP, false);

    if (this._kwsEnabled) {
      this._timeline.on('keyword', () => {
        this._onSpeechStart();
      });
      this._timeline.on('speech_stop', () => {
        this._onSpeechStop();
      });
      this._timeline.on('speech_timeout', () => {
        this._onSpeechStop();
      });
    } else {
      this._ui.on('key', (key, type) => {
        if (key === 'volumedown' && type === 'down') {
          this._onKeyPress();
        }
      });
    }

    log.info(`Dialog initialized`);
  }

  _onMicData = (pkt) => {
    const { when, frames } = pkt;
    log.debug(`mic-data: ${frames.length} bytes at ${when}`);

    this._speechToText.write(frames);
  }

  _onSay(sayText, isLast) {
    log.info(`say: ${sayText} (isLast: ${isLast})`);

    let pcmSamples = new Buffer(0);
    let tts = createTextToSpeech(sayText);

    tts.on('data', data => pcmSamples = Buffer.concat([pcmSamples, data]));

    tts.on('end', () => {
      let hdr = generateWavHeader(
          Object.assign({}, audioParams, { dataSize: pcmSamples.length }));
      let wavData = Buffer.concat([hdr, pcmSamples]);

      // TODO: stream into audio sink
      let sayFilename = '/data/say.wav';
      oldfs.writeFile(sayFilename, wavData, err => {
        if (err) {
          throw err;
        }

        util.playSound(sayFilename)
        .then(() => {
          if (!isLast) {
            this._onSpeechStart();
          } else {
            this._onDialogDone();
          }
        })
        .catch(err => {
          log.error(`cannot play ${sayFilename}, error: ${err}`);
        });
      });
    });
  }

  _onSpeechStart() {
    log.info(`onSpeechStart`);

    if (this._listeningState !== 'ready') {
      log.info(`not ready, skipping speech start`);
      return;
    }

    this._onDialogStart();

    // TODO: maybe start mic after playSound finishes.
    if (!this._kwsEnabled) {
      util.playSound(KEYWORD_DETECTED_SOUND_FILE);
    }

    this._speechToText = createSpeechToText(audioParams, (error, json) => {
      let text = '';

      if (error) {
        log.error(error);
        this._onDialogDone();
        if (this._kwsEnabled) {
          this._listeningState = 'ready';
        } else {
          util.playSound(ERROR_SOUND_FILE)
          .then(() => {
            this._listeningState = 'ready';
          })
          .catch(err => {
            log.error(error);
            this._listeningState = 'ready';
          });
        }
        return;
      }

      if (json.results && json.results.length >= 1) {
        const result = json.results[0];
        text = result.name;
        log.info(`speechToText: ${result.confidence}: ${text}`);
      } else {
        log.info(`speechToText: (no text)`);
      }

      this._dialogEngine.processUtterance(text);
    });

    this._camera.on('mic-data', this._onMicData);
    this._listeningState = 'listening';
  }

  _onSpeechStop() {
    log.info(`onSpeechStop`);

    if (this._listeningState !== 'listening') {
      log.info(`not listening, skipping speech stop`);
      return;
    }

    this._camera.removeListener('mic-data', this._onMicData);
    this._speechToText.finish();

    if (!this._kwsEnabled) {
      util.playSound(SPEECH_END_SOUND_FILE);
    }

    this._listeningState = 'ready';
  }

  _onDialogStart() {
    this._timeline.addObjects([{
      source: 'dialog',
      tag: 'dialog_start',
      when: Date.now(),
    }]);
  }

  _onDialogDone() {
    this._timeline.addObjects([{
      source: 'dialog',
      tag: 'dialog_stop',
      when: Date.now(),
    }]);
  }

  _onKeyPress() {
    if (this._listeningState === 'ready') {
      this._onSpeechStart();
    } else {
      this._onSpeechStop();
    }
  }
}

module.exports = env => new Dialog(env);
