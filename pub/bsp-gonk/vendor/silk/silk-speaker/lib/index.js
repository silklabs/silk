/**
 * @flow
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

/**
 * This module provides a writable stream instance to stream raw PCM data to
 * the device speakers. This module emits following events.
 *
 *
 * "open" - Fired when the native open() call has completed.
 *
 * "close" - Fired after end() is called on the speaker and speaker is done
 * playing the entire audio stream. This speaker instance is essentially
 * finished after this point.
 *
 * @module silk-speaker
 *
 * @example
 * const Speaker = require('silk-speaker').default;
 * let speaker = new Speaker({ numChannels: 1,
 *                             sampleRate: 16000,
 *                             bytesPerSample: 2,
 *                             encoding: 'signed-integer'
 *                           });
 * speaker.write(pcmBuffer);
 * speaker.end();
 */
export default class Speaker extends Writable {

  _speaker: SpeakerType;
  _closed: boolean = false;
  _opened: boolean = false;
  _options: SpeakerOptions;
  _chunkSize: number;

  constructor(options: SpeakerOptions) {
    super(options); // Calls the stream.Writable() constructor
    this._options = {
      numChannels: 1,
      sampleRate: 16000,
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
    return null;
  }

  /**
   * _write() callback for the Writable stream base class
   * @private
   */
  _write(chunk: Buffer, encoding: string, done: Function) {
    if (this._closed) {
      // close() has already been called. this should not be called
      return done(new Error('write() call after close() call'));
    }

    // Open native bindings
    if (!this._opened) {
      this._speaker.open(this._options.numChannels, this._options.sampleRate,
          this.getFormat());
      this._opened = true;
      this.emit('open');
    }

    let buffer = chunk;
    let left = chunk;

    let write = () => {
      if (this._closed) {
        log.debug(`Aborting remainder of write() call since speaker is closed`);
        return done();
      }
      if (!left) {
        return done();
      }
      buffer = left;
      if (buffer.length > this._chunkSize) {
        let tmp = buffer;
        buffer = tmp.slice(0, this._chunkSize);
        left = tmp.slice(this._chunkSize);
      } else {
        left = null;
      }
      log.debug(`writing ${buffer.length} bytes`);
      this._speaker.write(buffer, buffer.length, onwrite);
    };

    let onwrite = written => {
      log.debug(`wrote ${written} bytes`);
      if (written !== buffer.length) {
        done(new Error(`write() failed: ${written}`));
      } else if (left) {
        log.debug(`still ${left.length} bytes left in this chunk`);
        write();
      } else {
        log.debug('Done with this chunk');
        done();
      }
    };

    write();
  }

  /**
   * Emits a "flush" event and then calls the `.close()` function on
   * this Speaker instance.
   *
   * @private
   */
  _flush() {
    log.debug('Flushing the data');
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
    this.emit('close');
  }
}
