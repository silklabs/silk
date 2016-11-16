/**
 * @flow
 * @private
 */

import createLog from 'silk-log/device';
import bindings from './player';
import fs from 'mz/fs';
import events from 'events';

import type { PlayerType } from './player';

const log = createLog('audioplayer');
const GAIN_MIN = 0.0;
const GAIN_MAX = 1.0;

/**
 * The available audio types
 *
 * @memberof silk-audioplayer
 * @example
 * file   - Should be set to this value to play an audio file. Default
 * stream - Should be set to this value to play an audio stream
 */
export type AudioType = 'file' | 'stream';

/**
 * The available media states
 *
 * @memberof silk-audioplayer
 * @example
 * idle      - Audio hasn't started playing yet
 * prepared  - Audio stream is being prepared to play
 * playing   - Audio file or stream is now playing
 * stopped   - Audio file or stream has stopped or finished playback
 * paused    - Audio file or stream has paused
 */
type MediaState = 'idle' | 'prepared' | 'playing' | 'paused' | 'stopped';

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
 */

/**
 * This event is emitted when audio player is ready to play back audio
 *
 * @event prepared
 * @memberof silk-audioplayer
 * @instance
 */

/**
 * This event is emitted when audio playback has started
 *
 * @event started
 * @memberof silk-audioplayer
 * @instance
 */

/**
 * This event is emitted when audio playback has finished
 *
 * @event done
 * @memberof silk-audioplayer
 * @instance
 */

/**
 * This event is emitted when audio playback has paused
 *
 * @event paused
 * @memberof silk-audioplayer
 * @instance
 */

/**
 * This event is emitted when audio playback has resumed
 *
 * @event resumed
 * @memberof silk-audioplayer
 * @instance
 */

export default class Player extends events.EventEmitter {

  _gain: number = GAIN_MAX;
  _player: PlayerType = null;
  _mediaState: MediaState = 'idle';
  _fileName: string = '';
  _audioType: AudioType;
  _closed: boolean = false;

  constructor(audioType: AudioType = 'file') {
    super();
    this._audioType = audioType;
    this._player = new bindings.Player(audioType === 'stream' ? 1 : 0);

    // Prepare stream player
    if (audioType === 'stream') {
      this._player.prepare();
    }

    this._player.addEventListener(this._nativeEventListener);
  }

  /**
   * @private
   */
  _nativeEventListener = (event: string, err: Error) => {
    log.debug(`received event: ${event}, errorMsg: ${err}`);

    switch (event) {
    case 'prepared':
      this._mediaState = 'prepared';
      break;
    case 'started':
      if (this._mediaState === 'paused') { // Resumed
        event = 'resumed';
      }
      this._mediaState = 'playing';
      break;
    case 'paused':
      this._mediaState = 'paused';
      break;
    case 'done':
      this._mediaState = 'stopped';
      break;
    default:
      log.warn(`Unknown event ${event}`);
      break;
    }
    this.emit(event, new Error(err));
  };

  /**
   * Sets the specified output gain value on all channels of this sound file.
   * Gain values are clamped to the closed interval [0.0, 1.0]. A value of 0.0
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
    if (this._audioType !== 'file') {
      return Promise.reject(
        new Error(`Play can only be called for AUDIO_TYPE_FILE`)
      );
    }
    let exists = await fs.exists(fileName);
    if (!exists) {
      return Promise.reject(new Error(`${fileName} not found`));
    }
    this._fileName = fileName;

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

  _onError(err: Error) {
    log.debug(`Error`, err.message);
    this._nativeEventListener('error', err);
  }

  /**
   * Write audio buffer to be player's queue
   * @private
   */
  write(chunk: Buffer) {
    if (this._audioType !== 'stream') {
      this._onError(new Error(`Write can only be called for AUDIO_TYPE_STREAM`));
      return;
    }

    if (this._closed) {
      // stop() has already been called. this should not be called
      this._onError(new Error('write() call after close() call'));
      return;
    }

    if (this._player.write(chunk, chunk.length) <= 0) {
      this._onError(new Error('Failed to queue buffer to play'));
      return;
    }
  }

  /**
   * Stop the currently playing audio file
   * @memberof silk-audioplayer
   * @instance
   */
  stop() {
    this._player.stop();
  }

  /**
   * Pause the currently playing audio file
   * @memberof silk-audioplayer
   * @instance
   */
  pause() {
    this._player.pause();
  }

  /**
   * Resume the currently paused audio file
   * @memberof silk-audioplayer
   * @instance
   */
  resume() {
    this._player.resume();
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
   * Mark the end of audio stream. This API doesn't stop the audio streaming
   * but rather tells the audio player to finish when all the audio buffers
   * are done playing.
   *
   * @return {FileInfo}
   * @memberof silk-audioplayer
   * @instance
   */
  endOfStream() {
    this._player.endOfStream();
  }
}
