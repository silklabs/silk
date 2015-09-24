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
