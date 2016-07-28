/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @noflow
 */

import streams from 'stream';

/**
 * A dumb stream which simply holds the contents of the writes to it.
 */
export default class StoringStream extends streams.Duplex {
  _writes = [];
  _size = 0;

  constructor(...args) {
    super(...args);
    this.once('finish', () => {
      process.nextTick(() => this.emit('close'));
    });
  }

  _write(chunk, enc, callback) {
    this._writes.push(chunk);
    this._size += chunk.length;
    callback();
  }

  _read() {
    let write = this._writes.shift();
    if (write) {
      this._size -= write.length;
      this.push(write);
    } else {
      this.push(null);
    }
  }

  getStoreSize() {
    return this._size;
  }
}
