import { Readable } from 'stream';

export class WritableStreamHook extends Readable {

  _chunks = [];
  _unhook = null;

  constructor(stream, options = { }) {
    if (!(`encoding` in options)) {
      options.encoding = `utf8`;
    }

    super(options);

    let passThrough = options.passThrough || false;

    const oldWrite = stream.write;

    stream.write = (chunk, encoding, cb) => {
      this._chunks.push(chunk);
      if (passThrough) {
        return oldWrite.call(stream, chunk, encoding, cb);
      }
      return false;
    };

    this._unhook = () => {
      this._unhook = null;
      stream.write = oldWrite;
    };
  }

  unhook() {
    if (this._unhook) {
      this._unhook();
    }
  }

  _read() {
    const chunks = this._chunks;
    this._chunks = [];

    for (let chunk of chunks) {
      this.push(chunk, `utf8`);
    }
  }
}

export class StdoutHook extends WritableStreamHook {
  constructor(options) {
    super(process.stdout, options);
  }
}

export class StderrHook extends WritableStreamHook {
  constructor(options) {
    super(process.stderr, options);
  }
}
