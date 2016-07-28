/**
 * @private
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import { Readable } from 'stream';

export default class BufferReadable extends Readable {

  buffer: ?Buffer;

  constructor(buffer: Buffer) {
    super();
    this.buffer = buffer;
  }

  _read() {
    let buffer = this.buffer;
    this.buffer = null;
    this.push(buffer);
  }
}
