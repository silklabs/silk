/**
 * @flow
 * @private
 */

import createLog from 'silk-log';
import events from 'events';

import bindings from './speaker';

import type {ConfigDeviceMic} from 'silk-mic-config';
import type {SpeakerType} from './speaker';

const log = createLog('speaker');
const GAIN_MIN = 0.0;
const GAIN_MAX = 1.0;

/**
 * This module provides functionality to stream raw PCM data to
 * the device speakers.
 * @module silk-speaker
 *
 * @example
 * 'use strict';
 *
 * const Speaker = require('silk-speaker').default;
 * const log = require('silk-alog');
 *
 * let speaker = new Speaker({
 *   numChannels: 1,    // Default is 2
 *   sampleRate: 16000, // Default is 44100
 *   bytesPerSample: 2,
 *   encoding: 'signed-integer'
 * });
 * speaker.setVolume(1.0);
 * speaker.write(pcmBuffer);
 * speaker.end();
 * speaker.on('close', () => log.info(`done`));
 * speaker.on('error', (err) => log.error(err));
 */
export default class Speaker extends events.EventEmitter {

  _speaker: SpeakerType;
  _closed: boolean = false;
  _options: ConfigDeviceMic;
  _frameSize: number = 0;
  _pcmBuffer: Buffer;
  _totalBufferLen: number = 0;
  _writing: boolean = false;

  constructor(options: ?ConfigDeviceMic) {
    super(options); // Calls the stream.Writable() constructor
    this._options = {
      numChannels: 2,
      sampleRate: 44100,
      bytesPerSample: 2,
      encoding: 'signed-integer',
      ...options,
    };

    if (null === this.getFormat()) {
      throw new Error('invalid PCM format specified');
    }

    this._pcmBuffer = new Buffer(0);
    this._open();
  }

  /**
   * @private
   */
  _open() {
    // Open native bindings
    this._speaker = new bindings.Speaker();
    this._speaker.open(this._options.numChannels, this._options.sampleRate,
        this.getFormat());

    // Calculate the frame size
    this._frameSize = this._speaker.getFrameSize();
    log.debug(`Audio frame size: ${this._frameSize}`);

    /**
     * This event is fired when speaker stream is opened and ready to receive
     * a stream to play
     *
     * @event open
     * @memberof silk-speaker
     * @instance
     */
    this.emit('open');
  }

  /**
   * Returns the audio_format_t as defined in system/core/include/system/audio.h
   * @memberof silk-speaker
   * @instance
   * @return {number} audio format if valid or null otherwise
   */
  getFormat(): ?number {
    if (this._options.bytesPerSample === 1 &&
        this._options.encoding === 'unsigned-integer') {
      return bindings.AUDIO_FORMAT_PCM_8_BIT;
    }
    if (this._options.bytesPerSample === 2 &&
        this._options.encoding === 'signed-integer') {
      return bindings.AUDIO_FORMAT_PCM_16_BIT;
    }
    if (this._options.bytesPerSample === 4 &&
        this._options.encoding === 'float') {
      return bindings.AUDIO_FORMAT_PCM_FLOAT;
    }
    if (this._options.bytesPerSample === 3 &&
        this._options.encoding === 'signed-integer') {
      return bindings.AUDIO_FORMAT_PCM_24_BIT_PACKED;
    }
    return null;
  }

  /**
   * Sets the specified output gain value on all channels of this track. Gain
   * values are clamped to the closed interval [0.0, 1.0]. A value of 0.0
   * results in zero gain (silence), and a value of 1.0 means signal unchanged.
   * The default value is 1.0.
   * @memberof silk-speaker
   * @instance
   *
   * @param gain output gain for all channels
   */
  setVolume(gain: number) {
    gain = this._clampGain(gain);
    this._speaker.setVolume(gain);
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
   * Write PCM buffer to the player's queue to be played.
   *
   * @param chunk buffer containing audio data to be played
   * @memberof silk-speaker
   * @instance
   */
  write(chunk: Buffer) {
    if (this._closed) {
      // end() has already been called. this should not be called
      this._done(new Error('write() call after close() call'));
      return;
    }

    this._totalBufferLen += chunk.length;
    this._pcmBuffer = Buffer.concat([this._pcmBuffer, chunk]);
    this._write();
  }

  /**
   * @private
   */
  _write() {
    if (this._closed) {
      log.debug(`Aborting remainder of write() call since speaker is closed`);
      return;
    }

    if (this._writing) {
      return;
    }

    // Find number of full frames contained with in the pcm buffer
    let numFrames = Math.floor(this._pcmBuffer.length / this._frameSize);
    let chunkSize = numFrames * this._frameSize;

    if (chunkSize <= 0) {
      // Not enough data; wait
      return;
    }

    this._writing = true;
    let buffer = this._pcmBuffer.slice(0, chunkSize);
    this._pcmBuffer = this._pcmBuffer.slice(chunkSize);

    let onwrite = written => {
      if (written <= 0) {
        this._done(new Error(`write() failed: ${written}`));
      } else if (written !== buffer.length) {
        // Failed to write all the bytes to audio track due to block
        // misalignment so retry the left over bytes again with more data
        if (this._pcmBuffer) {
          let leftOver = buffer.slice(written);
          this._pcmBuffer = Buffer.concat([leftOver, this._pcmBuffer]);
          process.nextTick(() => this._write());
        } else {
          this._done(new Error(`write() failed: ${written}`));
        }
      } else if (this._pcmBuffer.length) {
        process.nextTick(() => this._write());
      }
      this._writing = false;
    };

    this._speaker.write(buffer, buffer.length, onwrite);
  }

  /**
   * Mark the end of audio stream. This API doesn't stop the audio streaming
   * but rather tells the speaker to stop when all the buffers in the audio
   * queue are done playing.
   *
   * @memberof silk-speaker
   * @instance
   */
  end() {
    if (this._closed) {
      log.error(`Speaker already closed`);
      return;
    }

    if ((this._totalBufferLen % this._frameSize) !== 0) {
      this._done(
        new Error(`Buffer not a multiple of frame size of ${this._frameSize}`)
      );
      return;
    }

    let numFrames = this._totalBufferLen / this._frameSize;
    if (!this._speaker.setNotificationMarkerPosition(numFrames)) {
      this._done(new Error(`Failed to set marker for eos`));
      return;
    }

    this._speaker.setPlaybackPositionUpdateListener((err) => {
      // Done playback
      this._done(err);
    });
  }

  /**
   * @private
   */
  _done(err: Error) {
    if (err) {
      this.emit('error', err);
    }
    this._close();
  }

  /**
   * Closes the audio backend
   * @private
   */
  _close() {
    log.debug(`Closing the stream`);
    if (this._closed) {
      log.debug('already closed...');
      return;
    }
    if (this._speaker) {
      this._speaker.close();
    }

    this._closed = true;

    /**
     * This event is fired after end() is called on the speaker and speaker is
     * done playing the entire audio stream. This speaker instance is essentially
     * finished after this point
     *
     * @event close
     * @memberof silk-speaker
     * @instance
     */
    this.emit('close');
  }
}
