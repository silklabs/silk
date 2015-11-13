/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

/**
 * Another base class for operations which do an all-or-nothing write to an
 * underlying writable stream
 *
 * ```js
 * class MyStreamOperation extends StreamOperation {
 *   static NAME = 'my-stream-op'
 *   static StreamClass = streams.PipeThrough
 * }
 * ```
 *
 * NOTE: The stream class _must_ also emit 'close' events in addition to finish.
 */
import TeeStream from '../streams/tee';
import StoringStream from '../streams/store';
import Operation from './operation';

import createLog from '../log';
import eventToPromise from 'event-to-promise';
import fs from 'fs';

const log = createLog('outbox:stream_operation');

/**
 * Maximum time for any stream based upload...
 *
 * (Note: 5 minutes is pretty arbitrary.)
 */
const MAX_UPLOAD_TIME = 60 * 1000 * 5;

/**
 * Handles the generic case where we want to cancel a stream after a specific
 * amount of time...
 *
 * NOTE: Only use this in combination with Promise.race this will not resolve
 * only reject!
 */
async function streamTimeout(writer, readable, timeout) {
  return new Promise((accept, reject) => {
    let timer = setTimeout(() => {
      readable.unpipe(writer);
      writer.end();

      // XXX: This might be a little hacky but ensures we trigger the same logic
      // as an exception in the underlying writer...
      let err = new Error(
        `Stream timeout! Has not completed after ${timeout} ms`
      );
      writer.emit('error', err);
      reject(err);
    }, timeout);

    // Clear the timer so we don't reject all the time...
    writer.once('close', () => {
      clearTimeout(timer);
    });
  });
}

export default class StreamOperation extends Operation {

  static MAX_UPLOAD_TIME = MAX_UPLOAD_TIME;

  createdAt = null
  arguments = {}
  writing = false
  error = null;

  constructor(options) {
    super(options);
    Object.assign(this, options);
  }

  /**
   * Get the writable destination.
   */
  async _getDestination() {
    if (!this.constructor.StreamClass) {
      throw new Error('StreamClass static property is required...');
    }

    return new this.constructor.StreamClass(this.arguments);
  }

  /**
   * Attempt to write to the destination stream.
   *
   * When successful this will resolve with { done: true }. If for whatever
   * reason we fail to complete the write this will resolve with a "remainder"
   * stream which can be persisted (via persistToDisk) for later retry of the
   * operation.
   */
  async _write(readable) {
    if (this.writing) {
      throw new Error('.write may only be called once');
    }
    this.writing = true;

    let isReadingPath = typeof readable === 'string';
    readable = (isReadingPath) ?
      fs.createReadStream(readable) :
      readable;

    let error;
    let remainder = readable;
    let writer;

    try {
      this.destination = await this._getDestination(remainder);
    } catch (err) {
      log.error('Failed to get destination stream', err.stack);
      return { done: false, remainder, error: err };
    }

    if (!isReadingPath) {
      remainder = new StoringStream();
      writer = new TeeStream(remainder, this.destination);
    } else {
      writer = this.destination;
    }

    readable.pipe(writer);
    log.info(`(${this.constructor.name}) beginning write operation`);

    this.destination.on('error', err => {
      // bad stuff happened oh noes...
      error = err;
      log.warn(
        `(${this.constructor.NAME}) Error attemping to write will retry`,
        this.arguments,
        err.stack,
      );
      log.info(`(${this.constructor.NAME}) Need readable.destroy()?`, isReadingPath);
      if (isReadingPath) {
         // Avoid leaking a file descriptor if this is a file...
        readable.destroy();
      } else {
        // Drain the rest of the stream...
        readable.resume();
      }
    });

    /**
     * The decision to use "close" instead of "finish" is important here...
     * Finish simply means all the bytes have been written to the underlying
     * stream but it does not indicate success of the overall operation.
     *
     * For example a http request will "finish" once all bytes have been
     * consumed from the readable side but unless "close" has been emitted there
     * still may be network errors/etc..
     */
    try {
      await Promise.race([
        eventToPromise(writer, 'close'),
        streamTimeout(writer, readable, this.constructor.MAX_UPLOAD_TIME)
      ]);
    } catch (err) {
      // We have completely failed to write the stream for one reason or
      // another...
      error = err;
    }

    log.info(`(${this.constructor.name}) finished write operation`, {
      error
    });

    // Successfully uploaded everything hooray...
    if (!error) {
      return { done: true };
    }

    return { done: false, remainder, error };
  }

  _getMetadata() {
    return Object.assign({
      createdAt: Date.now(),
      arguments: this.arguments
    });
  }

}
