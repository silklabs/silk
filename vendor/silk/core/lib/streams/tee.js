/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

/* eslint no-loop-func:0 */

import { Writable } from 'stream';

/**
 * Node does not support multiple top level pipes in a easy to use way instead
 * we have a "Tee" construct which accepts N writable pipes.
 *
 * All writes to the T are as slow as the slowest writable stream given this
 * ensures if one individual writable stream given throws an error it can be
 * handled independently of the tee.
 *
 * NOTE: Tee will emit a close event but underlying streams given must also
 * support close events for this to work.
 */
export default class TeeStream extends Writable {

  _streamHandles = []

  constructor(...list) {
    super();

    for (let stream of list) {
      let handle = {
        stream: stream,
        errorCb: null,
        onError: (err) => {
          // If we error out and we have a proper callback to handle it pass the
          // error on...
          if (handle.errorCb) {
            handle.errorCb(err);
            handle.errorCb = null;
            return;
          }

          // Otherwise we error out in some unknown state (outside of a
          // write). This can happen with network errors/etc... Remove stream
          // from the tee.
          this._removeHandle(handle);
        }
      };

      stream.on('error', handle.onError);
      this._streamHandles.push(handle);
    }


    // Ensure we do not emit a 'close' event until all streams have emitted
    // their close events.
    this.once('prefinish', () => {
      // All streams have been finalized so we know which ones to listen to
      // here.
      let pending = this._streamHandles.length + 1;

      let next = () => {
        if (--pending === 0) {
          this.emit('close');
        }
      };

      for (let handle of this._streamHandles) {
        handle.stream.once('close', next);
      }

      next();
    });
  }

  _removeHandle(handle) {
    let idx = this._streamHandles.indexOf(handle);
    if (idx !== -1) {
      this._streamHandles.splice(idx, 1);
      handle.stream.removeListener('error', handle.onError);
    }
  }

  /**
   * Wrapper to ensure we correctly capture any possible type of stream error.
   */
  _writeStream(handle, chunk, encoding, cb) {
    function onError(err) {
      handle.stream.removeListener('error', onError);
      cb(err);
    }

    handle.errorCb = onError;
    return handle.stream.write(chunk, encoding, err => {
      handle.errorCb = null;
      cb(err);
    });
  }

  end(...args) {
    if (args.length > 0) {
      throw new Error('Tee stream does not support .end with arguments');
    }

    // Since everything is being written to the "Tee" we must wait for all
    // writes to be flushed out here prior to telling the streams inside of the
    // tee to end.
    super.end(() => {
      for (let handle of this._streamHandles) {
        handle.stream.end();
      }
    });
  }

  _write(chunk, encoding, cb) {
    let pending = this._streamHandles.length;
    if (!pending) {
      process.nextTick(cb);
      return true;
    }

    this._streamHandles.forEach((handle) => {
      this._writeStream(handle, chunk, encoding, err => {
        // reduce the number of pending writes we are waiting for.
        pending--;

        // If there is an error we need to remove this particular stream...
        if (err) {
          this._removeHandle(handle);

          // If this was the last stream and there was an error bubble it up.
          if (!this._streamHandles.length) {
            cb(err);
            return;
          }
        }

        // When there are no more pending writes and we have a callback...
        if (!pending) {
          cb();
        }
      });
    });
  }
}
