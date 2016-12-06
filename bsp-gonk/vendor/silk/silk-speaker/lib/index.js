/**
 * @flow
 * @private
 */

import createLog from 'silk-log/device';
import Writable from 'readable-stream/writable';
import bindings from './speaker';

import type { WritableStreamOptions } from 'silk-streams';
import type { ConfigDeviceMic } from 'silk-config';
import type { SpeakerType } from './speaker';

type SpeakerOptions = WritableStreamOptions & ConfigDeviceMic;

const log = createLog('speaker');
const SAMPLES_PER_FRAME = 1024;
const GAIN_MIN = 0.0;
const GAIN_MAX = 1.0;

/**
 * This module provides a writable stream instance to stream raw PCM data to
 * the device speakers.
 * @module silk-speaker
 *
 * @example
 * 'use strict';
 *
 * const Speaker = require('silk-speaker').default;
 * const log = require('silk-alog');
 *
 * let speaker = new Speaker({ numChannels: 1,    // Default is 2
 *                             sampleRate: 16000, // Default is 44100
 *                             bytesPerSample: 2,
 *                             encoding: 'signed-integer'
 *                           });
 * speaker.setVolume(1.0);
 * speaker.write(pcmBuffer);
 * speaker.end();
 * speaker.on('close', () => log.info(`done`));
 */
export default class Speaker extends Writable {

  _speaker: SpeakerType;
  _closed: boolean = false;
  _opened: boolean = false;
  _options: SpeakerOptions;
  _chunkSize: number;

  constructor(options: ?SpeakerOptions) {
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

    // Calculate the block alignment
    let blockAlign = this._options.bytesPerSample / this._options.numChannels;
    this._chunkSize = blockAlign * SAMPLES_PER_FRAME;

    this.on('finish', () => this._flush());
    this._speaker = new bindings.Speaker();
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
   * _write() callback for the Writable stream base class
   * @private
   */
  _write(chunk: Buffer, encoding: string, done: Function) {
    if (this._closed) {
      // close() has already been called. this should not be called
      done(new Error('write() call after close() call'));
      return;
    }

    // Open native bindings
    if (!this._opened) {
      this._speaker.open(this._options.numChannels, this._options.sampleRate,
          this.getFormat());
      this._opened = true;

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

    let buffer = chunk;
    let left = chunk;

    let write = () => {
      if (this._closed) {
        log.debug(`Aborting remainder of write() call since speaker is closed`);
        done();
        return;
      }
      if (!left) {
        done();
        return;
      }
      buffer = left;
      if (buffer.length > this._chunkSize) {
        let tmp = buffer;
        buffer = tmp.slice(0, this._chunkSize);
        left = tmp.slice(this._chunkSize);
      } else {
        left = null;
      }
      this._speaker.write(buffer, buffer.length, onwrite);
    };

    let onwrite = written => {
      if (written <= 0) {
        done(new Error(`write() failed: ${written}`));
      } else if (written !== buffer.length) {
        // Failed to write all the bytes to audio track due to block
        // misalignment so retry the left over bytes again with more data
        if (left) {
          let leftOver = buffer.slice(written);
          left = Buffer.concat([leftOver, left]);
          write();
        } else {
          done(new Error(`write() failed: ${written}`));
        }
      } else if (left) {
        write();
      } else {
        done();
      }
    };

    write();
  }

  /**
   * Calls the `.close()` function on this Speaker instance.
   *
   * @private
   */
  _flush() {
    this.close();
  }

  /**
   * Closes the audio backend
   * @memberof silk-speaker
   * @instance
   */
  close() {
    log.debug(`Closing the stream`);
    if (this._closed) {
      log.debug('already closed...');
      return;
    }
    if (this._opened) {
      this._speaker.close();
      this._opened = false;
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
