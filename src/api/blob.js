import fetch from 'node-fetch';
import { Readable } from 'stream';
import throwError from './fetch_error';
import fetchJson from './fetch_json';

class BufferToStream extends Readable {
  constructor(buffer) {
    super();
    this.buffer = buffer;
  }

  _read() {
    this.push(this.buffer);
    // next time _read is called this will be returned triggering the end of
    // the stream...
    this.buffer = null;
  }
}


export default function(config) {
  let baseUrl = config.server_url;  //eslint-disable-line
  return {
    signedUrl: fetchJson.bind(null, `${baseUrl}/blob`),
    ack: fetchJson.bind(null, `${baseUrl}/blob/ack`),

    async upload(putUrl, size, bufferOrStream) {
      let stream;
      if (bufferOrStream instanceof Buffer) {
        bufferOrStream = new BufferToStream(bufferOrStream);
      }
      stream = bufferOrStream;
      let response = await fetch(putUrl, {
        method: 'put',
        body: stream,
        headers: {
          'Content-Length': size
        }
      });

      if (!response.ok) {
        await throwError(response);
      }
    },

    async uploadAndAck(size, bufferOrStream) {
      let { putUrl } = await this.signedUrl();
      await this.upload(putUrl, size, bufferOrStream);
      return await this.ack({ url: putUrl });
    }
  };
}
