/**
 * @flow
 * @private
 */

import createLog from 'silk-log/device';
import bindings from './player';
import fs from 'mz/fs';
import wav from 'node-wav';
import Speaker from 'silk-speaker';
import events from 'events';

import type { PlayerType } from './player';
import type { ConfigDeviceMic } from 'silk-config';

const log = createLog('audioplayer');
const GAIN_MIN = 0.0;
const GAIN_MAX = 1.0;

type soundMapDataType = {
  buffer: Buffer;
  options: ConfigDeviceMic;
};

/**
 * The available media states
 *
 * @memberof silk-audioplayer
 * @example
 * idle    - Audio hasn't started playing yet
 * playing - Audio is now playing
 * paused  - Audio has paused
 * stopped - Audio has stopped or finished playback
 */
type MediaState = 'idle' | 'playing' | 'paused' | 'stopped';

/**
 * Information about an audio file
 *
 * @memberof silk-audioplayer
 * @property {string} name name of the audio file
 */
type FileInfo = {
  name: string;
};

/**
 * This module provides an interface to play audio files.
 * @module silk-audioplayer
 *
 * @example
 * const Player = require('silk-audioplayer').default;
 * const log = require('silk-alog');
 * const player = new Player();
 *
 * player.setVolume(1.0);
 * player.play('data/media/test.mp3')
 * .then(() => log.info('Done playing'))
 * .catch(err => log.error(err));
 *
 * player.on('started', () => {
 *   player.pause();
 *   log.info(`getState ${player.getState()}`);
 *   player.setVolume(0.5);
 *   player.resume();
 *   log.info(`getState ${player.getState()}`);
 *   log.info(`getCurrentPosition ${player.getCurrentPosition()}`);
 *   log.info(`getDuration ${player.getDuration()}`);
 *   log.info(`getInfo ${JSON.stringify(player.getInfo())}`);
 * });
 *
 * // Reduce latency by preloading the sound file
 * player.load('data/media/test.wav')
 * .then(() => player.play('data/media/test.wav'))
 * .then(() => log.info('Done playing'));
 * .catch(err => log.error(err));
 */
export default class Player extends events.EventEmitter {

  _gain: number = GAIN_MAX;
  _soundMap: {[key: string]: soundMapDataType} = {};
  _player: PlayerType = null;
  _mediaState: MediaState = 'idle';
  _fileName: string = '';

  constructor() {
    super();
    this._player = new bindings.Player();
  }

  /**
   * Sets the specified output gain value on all channels of this sound file. Gain
   * values are clamped to the closed interval [0.0, 1.0]. A value of 0.0
   * results in zero gain (silence), and a value of 1.0 means signal unchanged.
   * The default value is 1.0. Audio player volume can be set before or during
   * the playback.
   *
   * @memberof silk-audioplayer
   * @instance
   *
   * @param gain output gain for all channels
   */
  setVolume(gain: number) {
    this._gain = this._clampGain(gain);
    this._player.setVolume(this._gain);
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
      return Promise.reject(new Error(`${fileName} not found`));
    }
    this._fileName = fileName;

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

    this._mediaState = 'playing';
    return new Promise((resolve, reject) => {
      this._player.play(fileName, (err) => {
        this._mediaState = 'stopped';
        if (err) {
          reject(err);
          return;
        }
        log.debug(`Done playing ${fileName}`);
        resolve();
      }, () => {
        /**
         * This event is emitted when audio file has started to play
         *
         * @event started
         * @memberof silk-audioplayer
         * @instance
         */
        this.emit('started');
      });
    });
  }

  /**
   * Stop the currently playing audio file
   * @return true if the operation was successful, false otherwise
   * @memberof silk-audioplayer
   * @instance
   */
  stop(): boolean {
    let result = this._player.stop();
    if (result) {
      this._mediaState = 'stopped';
    }
    return result;
  }

  /**
   * Pause the currently playing audio file
   * @return true if the operation was successful, false otherwise
   * @memberof silk-audioplayer
   * @instance
   */
  pause(): boolean {
    let result = this._player.pause();
    if (result) {
      this._mediaState = 'paused';
    }
    return result;
  }

  /**
   * Resume the currently paused audio file
   * @return true if the operation was successful, false otherwise
   * @memberof silk-audioplayer
   * @instance
   */
  resume(): boolean {
    let result = this._player.resume();
    if (result) {
      this._mediaState = 'playing';
    }
    return result;
  }

  /**
   * Gets the current state of audio player
   * @return {MediaState} the current audio player state
   * @memberof silk-audioplayer
   * @instance
   */
  getState(): MediaState {
    return this._mediaState;
  }

  /**
   * Gets the current playback position
   * @return {number} the current position in milliseconds
   * @memberof silk-audioplayer
   * @instance
   */
  getCurrentPosition(): number {
    return this._player.getCurrentPosition();
  }

  /**
   * Gets the duration of the file. Duration is not available in
   * the idle state.
   * @return {number} the duration in milliseconds, if no duration is available
   *                  (for example, there is an error), -1 is returned.
   * @memberof silk-audioplayer
   * @instance
   */
  getDuration(): number {
    return this._player.getDuration();
  }

  /**
   * Gets the information about an audio file being played
   * @return {FileInfo}
   * @memberof silk-audioplayer
   * @instance
   */
  getInfo(): FileInfo {
    return {
      name: this._fileName,
    };
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
    let options = {};

    try {
      let buffer = await fs.readFile(fileName);
      let result = wav.decodeRaw(buffer);
      options.numChannels = result.channels;
      options.sampleRate = result.sampleRate;
      options.bytesPerSample = result.bitDepth / 8;

      return {buffer: result.channelData, options};
    } catch (err) {
      log.debug(err);
      return Promise.reject(`Failed to decode ${fileName}`);
    }
  }
}
