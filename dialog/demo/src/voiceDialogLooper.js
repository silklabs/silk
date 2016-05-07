import readline from 'readline';
import Speaker from 'speaker';
import mic from 'mic';

import {createDialogEngine, createSpeechToText,
    createTextToSpeech} from '../..';

import beep from './beep';

import createLog from 'silk-log';
const log = createLog('voice-dialog-looper');

import config from 'silk-config';
const audioParams = config.deviceMic;

class VoiceDialogLooper {
  constructor(scriptData, createInitState) {
    this._rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    this._initMic();
    this._dialogEngine = createDialogEngine(scriptData, createInitState);
    this._dialogEngine.on('say',
        (sayText, isLast) => this._onSay(sayText, isLast));
    this._dialogEngine.on('error', err => {
      throw err;
    });
  }

  _initMic() {
    this._mic = mic({
      bitwidth: audioParams.bytesPerSample * 8,
      encoding: audioParams.encoding,
      endian: audioParams.endian,
      channels: audioParams.numChannels,
      rate: audioParams.sampleRate,
      exitOnSilence: 4
    });
    this._micStream = this._mic.getAudioStream();

    this._micStream.on('resumeComplete', () => this._onMicResume());
    this._micStream.on('data', data => this._onMicData(data));
    this._micStream.on('silence', () => this._onMicSilence());

    this._mic.start();
    this._mic.pause();
  }

  _onMicResume() {
    log.debug('on mic resumed');
    beep('startListen');
  }

  _onMicData(data) {
    log.debug(`on mic data ${data.length}`);
    this._speechToText.write(data);
  }

  _onMicSilence() {
    log.info('on mic silence');
    beep('stopListen');

    this._mic.pause();
    this._speechToText.finish();
  }

  _getMicToText() {
    this._speechToText = createSpeechToText(audioParams, (error, json) => {
      let text = '';

      if (error) {
        throw error;
      }

      if (json.results && json.results.length >= 1) {
        const result = json.results[0];
        text = result.name;
        log.info(`speechToText: ${result.confidence}: ${text}`);
      } else {
        log.info(`speechToText: (no text)`);
      }

      log.info(`>>> ${text}`);
      this._dialogEngine.processUtterance(text);
    });

    this._mic.resume();
  }

  _onSay(sayText, isLast) {
    log.info(`<<< ${sayText}\n`);

    let tts = createTextToSpeech(sayText);

    this._speaker = new Speaker({
      channels: tts.audioParams.numChannels,
      bitDepth: tts.audioParams.bytesPerSample * 8,
      signed: tts.audioParams.encoding === 'signed-integer',
      sampleRate: tts.audioParams.sampleRate,
    });

    let next = isLast ? () => this._waitForWake() : () => this._getMicToText();
    let ttsDone = false;
    let cnt = 0;   // number of outstanding writes to speaker
    tts.on('data', data => {
      cnt++;
      this._speaker.write(data, null, () => {
        if (--cnt === 0 && ttsDone) { // finished speech playback, do next
          this._speaker.end();
          next();
        }
      });
    });

    tts.on('end', () => ttsDone = true);
  }

  _waitForWake() {
    this._rl.question('\nPress enter to simulate wake word detection ',
        text => this._getMicToText(text));
  }

  start() {
    this._waitForWake();
  }
}

export default function createVoiceDialogLooper(scriptData, createInitState) {
  return new VoiceDialogLooper(scriptData, createInitState);
}
