export default class Blob {

  constructor(parts, options) {
    this.type = options && options.type || '';
    this.size = 0;

    this.buffer = Buffer.concat(parts.map((part) => {
      if (Buffer.isBuffer(part)) {
        this.size += part.length;
        return buffer;
      }
      if (ArrayBuffer.isView(part)) {
        this.size += part.length;
        return new Buffer(part);
      }
      if (part instanceof ArrayBuffer) {
        this.size += part.byteLength;
        return new Buffer(part);
      }
      if (part instanceof Blob) {
        this.size += part.size;
        return part.buffer;
      }
      throw new Error(
        'Blob constituent must be Blob, ArrayBuffer, Typed Array, or Buffer'
      );
    }), this.size);
  }

  slice(start, end) {
    return new Blob([this.buffer.slice(start, end)], {type: this.type});
  }

  close() {
    this.buffer = null;
  }

}
