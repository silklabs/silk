/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

import { Readable } from 'stream';

export default class BufferReadable extends Readable {
  constructor(buffer) {
    super();
    this.buffer = buffer;
  }

  _read() {
    let buffer = this.buffer;
    this.buffer = null;
    this.push(buffer);
  }
}
