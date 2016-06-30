/**
 * @flow
 * @private
 */

import createLog from 'silk-log/device';
import player from './player';
import fs from 'mz/fs';
import wav from 'wav';
import Speaker from 'silk-speaker';

import type { ConfigDeviceMic } from 'silk-config';

const log = createLog('audioplayer');
const GAIN_MIN = 0.0;
const GAIN_MAX = 1.0;

type soundMapDataType = {
  buffer: Buffer;
  options: ConfigDeviceMic;
};

/**
 * This module provides an interface to play audio files.
 * @module silk-audioplayer
 *
 * @example
 * const player = require('silk-audioplayer');
 * const log = require('silk-alog');
 *
 * player.setVolume(1.0);
 * player.play('data/media/test.mp3')
 * .then(() => log.info('Done playing'));
 * .catch(err => log.error(err));
 *
 * // Reduce latency by preloading the sound file
 * player.load('data/media/test.wav')
 * .then(() => player.play('data/media/test.wav'))
 * .then(() => log.info('Done playing'));
 * .catch(err => log.error(err));
 */
class Player {

  _gain: number = GAIN_MAX;
  _soundMap: {[key: string]: soundMapDataType} = {};

  /**
   * Sets the specified output gain value on all channels of this sound file. Gain
   * values are clamped to the closed interval [0.0, 1.0]. A value of 0.0
   * results in zero gain (silence), and a value of 1.0 means signal unchanged.
   * The default value is 1.0.
   * @memberof silk-speaker
   * @instance
   *
   * @param gain output gain for all channels
   */
  setVolume(gain: number) {
    this._gain = this._clampGain(gain);
    player.setVolume(this._gain);
  }

  /**
   * @private
   */
  _clampGain(gainOrLevel: number) {
    if (isNaN(parseFloat(gainOrLevel))) {
      throw new Error(`${gainOrLevel} is not a valid floating point number`);
    }
    if (gainOrLevel < GAIN_MIN) {
      gainOrLevel = GAIN_MIN;
    } else if (gainOrLevel > GAIN_MAX) {
      gainOrLevel = GAIN_MAX;
    }
    return gainOrLevel;
  }

  /**
   * Play an audio file.
   *
   * @param {string} fileName Name of the audio file to play
   * @return {Promise} Return a promise that is fulfilled when the sound is
   *                   done playing.
   * @memberof silk-audioplayer
   * @instance
   */
  async play(fileName: string): Promise<void> {
    let exists = await fs.exists(fileName);
    if (!exists) {
      return Promise.reject(`${fileName} not found`);
    }

    // A cached PCM data for the file is available so stream PCM data instead
    // of using MediaPlayer to play the file
    if (this._soundMap[fileName]) {
      return new Promise((resolve, reject) => {
        let speaker = new Speaker(this._soundMap[fileName].options);
        speaker.setVolume(this._gain);
        speaker.on('close', () => resolve());
        speaker.write(this._soundMap[fileName].buffer);
        speaker.end();
      });
    }

    return new Promise((resolve, reject) => {
      player.play(fileName, (err) => {
        if (err) {
          reject(err);
          return;
        }
        log.debug(`Done playing ${fileName}`);
        resolve();
      });
    });
  }

  /**
   * Load the audio into a raw 16-bit PCM mono or stereo stream to provide
   * low-latency audio playback.
   * <b>NOTE:</b> Only wav files are supported at this time.
   *
   * @param fileName Name of the audio file to load
   * @return {Promise} Return a promise that is fulfilled when the sound
   *                   is done loading
   * @memberof silk-audioplayer
   * @instance
   */
  load(fileName: string): Promise<void> {
    log.debug(`Loading sound ${fileName}`);
    if (this._soundMap[fileName]) {
      log.debug(`${fileName} already loaded`);
      return Promise.resolve();
    }

    return this._readWavFile(fileName).then((wav) => {
      log.debug(`Done loading ${fileName}`);
      this._soundMap[fileName] = wav;
    });
  }

  /**
   * Read pcm data from the wav file
   * @private
   */
  async _readWavFile(fileName: string): Promise<soundMapDataType> {
    let reader = new wav.Reader();
    let options = {};
    let buffer = new Buffer(0);

    let exists = await fs.exists(fileName);
    if (!exists) {
      return Promise.reject(`${fileName} not found`);
    }

    return new Promise((resolve, reject) => {
      reader.on('format', format => {
        options.numChannels = format.channels;
        options.sampleRate = format.sampleRate;
        options.bytesPerSample = format.bitDepth / 8;
        options.encoding = format.signed ? 'signed-integer' : 'unsigned-integer';
      });
      reader.on('data', pcmData => {
        buffer = Buffer.concat([buffer, pcmData]);
      });
      reader.on('end', () => {
        resolve({buffer, options});
      });
      reader.on('error', err => {
        reader.removeAllListeners('data');
        reader.removeAllListeners('end');
        reader.removeAllListeners('format');
        reject(err);
      });
      fs.createReadStream(fileName).pipe(reader).resume();
    });
  }
}

module.exports = new Player();
