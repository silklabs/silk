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
 * The available media states
 *
 * @memberof silk-audioplayer
 * @example
 * idle      - Audio playback hasn't started yet
 * preparing - Audio is preparing for playback
 * prepared  - Audio stream is being prepared to play
 * playing   - Audio playback has started
 * stopped   - Audio playback has stopped
 * paused    - Audio playback has paused
 */
type MediaState =
  'idle' |
  'preparing' |
  'prepared' |
  'playing' |
  'paused' |
  'stopped';

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
 * This module provides an interface to play audio files or audio streams
 * @module silk-audioplayer
 *
 * @example
 * Example1 - Play an audio file
 *
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
 *
 *   player.setVolume(0.5);
 *   player.resume();
 *
 *   log.info(`getState ${player.getState()}`);
 *   log.info(`getCurrentPosition ${player.getCurrentPosition()}`);
 *   log.info(`getDuration ${player.getDuration()}`);
 *   log.info(`getInfo ${JSON.stringify(player.getInfo())}`);
 * });
 *
 *
 * Example2 - Play an audio stream
 *
 * const Player = require('silk-audioplayer').default;
 * const https = require('https');
 * const log = require('silk-alog');
 * const player = new Player();
 *
 * https.get('https://test.mp3', (res) => {
 *  res.once('error', (err) => log.error(err));
 *  res.on('data', data => player.write(data));
 *  res.once('end', () => {
 *    if (res.statusCode !== 200) {
 *      log.error(`status code ${res.statusCode}, error \'${res.statusMessage}\'`);
 *    } else {
 *      log.info(`Request complete`);
 *      player.endOfStream();
 *    }
 *  });
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

/**
 * This event is emitted when there is an error in audio playback
 *
 * @event error
 * @memberof silk-audioplayer
 * @instance
 */

export default class Player extends events.EventEmitter {

  _gain: number = GAIN_MAX;
  _player: PlayerType = null;
  _mediaState: MediaState = 'idle';
  _fileName: string = '';
  _playPromiseAccept: ?(value: Promise<void> | void) => void = null;
  _playPromiseReject: ?(error: any) => void = null;

  constructor() {
    super();
    this._player = new bindings.Player();
    this._player.addEventListener((event, err) => {
      // process.nextTick doesn't work here as the caller of this
      // callback needs to finish before the nextTick happens, which isn't
      // the case here.
      setTimeout(() => this._nativeEventListener(event, err), 0);
    });
  }

  /**
   * Sets the specified output gain value on all channels of this sound file.
   * Gain values are clamped to the closed interval [0.0, 1.0]. A value of 0.0
   * results in zero gain (silence), and a value of 1.0 means signal unchanged.
   * The default value is 1.0. Audio player volume can be set before or during
   * the playback.
   *
   * @param gain output gain for all channels
   * @memberof silk-audioplayer
   * @instance
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
   * @param fileName Name of the audio file to play
   * @return {Promise} Return a promise that is fulfilled when the sound is
   *                   done playing.
   * @memberof silk-audioplayer
   * @instance
   */
  async play(fileName: string): Promise<void> {
    let exists = await fs.exists(fileName);
    if (!exists) {
      this._mediaState = 'stopped';
      return Promise.reject(new Error(`${fileName} not found`));
    }

    this._fileName = fileName;

    return new Promise((resolve, reject) => {
      this._playPromiseAccept = resolve;
      this._playPromiseReject = reject;

      this._player.setDataSource(bindings.DATA_SOURCE_TYPE_FILE, fileName);
      this._player.start();
    });
  }

  /**
   * Write audio buffer to the player's queue to be played
   *
   * @param chunk buffer containing audio data to be played
   * @memberof silk-audioplayer
   * @instance
   */
  write(chunk: Buffer) {
    // Prepare stream player with BufferedDataSource
    if ((this._mediaState === 'idle') || (this._mediaState === 'stopped')) {
      this._mediaState = 'preparing';
      this._player.setDataSource(bindings.DATA_SOURCE_TYPE_BUFFER);
      this._player.start();
    }

    if (this._player.write(chunk, chunk.length) <= 0) {
      this._onError(new Error('Failed to queue buffer to play'));
      return;
    }
  }

  /**
   * Stop the currently playing audio file or an audio stream
   * @memberof silk-audioplayer
   * @instance
   */
  stop() {
    this._player.stop();
  }

  /**
   * Pause the currently playing audio file or an audio stream
   * @memberof silk-audioplayer
   * @instance
   */
  pause() {
    this._player.pause();
  }

  /**
   * Resume the currently paused audio file or an audio stream
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
   * Gets the duration of the file or an audio stream. Duration is not available
   * in the idle state.
   * @return {number} the duration in milliseconds
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
   * but rather tells the audio player to stop when all the buffers in the audio
   * queue are done playing.
   *
   * @return {FileInfo}
   * @memberof silk-audioplayer
   * @instance
   */
  endOfStream() {
    this._player.endOfStream();
  }

  /**
   * @private
   */
  _nativeEventListener = (event: string, err: Error) => {
    log.debug(`received event: ${event}`);

    switch (event) {
    case 'prepared':
      this._mediaState = 'prepared';
      break;
    case 'started':
      if (this._mediaState === 'paused') {
        event = 'resumed';
      }
      this._mediaState = 'playing';
      break;
    case 'paused':
      this._mediaState = 'paused';
      break;
    case 'done':
      this._mediaState = 'stopped';
      if (this._playPromiseAccept) {
        this._playPromiseAccept();
        this._playPromiseAccept = null;
      }
      break;
    case 'error':
      log.error(`errorMsg: `, err);
      this._mediaState = 'stopped';
      if (this._playPromiseReject) {
        this._playPromiseReject();
        this._playPromiseReject = null;
      }
      break;
    default:
      log.warn(`Unknown event ${event}`);
      break;
    }
    this.emit(event, new Error(err));
  };

  _onError(err: Error) {
    log.debug(`Error`, err.message);
    this._nativeEventListener('error', err);
  }
}
