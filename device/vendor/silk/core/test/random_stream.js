/**
 * Generates some random data for the stream...
 */

import { PassThrough } from 'stream';
import assert from 'assert';

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * @param {Number} bytes to include in buffer.
 * @param {Number} writes how many writes to use.
 */
export default function (bytes = 1024, writes = 30) {
  let buffer = new Buffer(bytes);
  let stream = new PassThrough();

  let currentWrite = 0;
  let writeBytes = Math.ceil(bytes / writes);

  for (let i = 0; i < bytes; i++) {
    // Some ASCII byte...
    let byte = rand(48, /* 0 */ 126 /* ~ */);
    buffer.writeUInt8(byte, i);

    /**
     * This is tricky logic while it will not result in invalid ranges (i.e. you
     * missed the end of the buffer) it _will_ slice segments of the stream
     * prior to them being written to... This is actually completely fine
     * because the buffer is pre-initialized and the slices we add to the stream
     * are actually _references_ to that range of memory rather then the values.
     */
    if (i % writeBytes === 0) {
      let start = currentWrite * writeBytes;
      let end = start + writeBytes;
      let slice = buffer.slice(start, end);

      stream.write(slice);
      currentWrite++;
    }
  }

  stream.end();
  return { stream, buffer };
}
