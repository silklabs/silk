/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import streams from 'stream';

/**
 * A dumb stream which simply holds the contents of the writes to it.
 */
export default class StoringStream extends streams.Duplex {
  _writes = []

  constructor(...args) {
    super(...args);
    this.once('finish', () => {
      this.emit('close');
    });
  }

  _write(chunk, enc, callback) {
    this._writes.push(chunk);
    callback();
  }

  _read() {
    let write = this._writes.shift();
    this.push(write ? write : null);
  }

  getStoreSize() {
    return this._writes.reduce((size, item) => size + item.length, 0);
  }
}
